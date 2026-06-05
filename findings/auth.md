# Auth Module — Authentication & Authorization

Handles all login, register, token refresh, logout, and password reset flows. Serves four distinct user types with separate login endpoints.

---

## Overview

- JWT HS256, 15-minute access tokens, 7-day refresh tokens stored in the `refresh_tokens` table.
- Refresh tokens are single-use: each `/auth/refresh` call deletes the old token and issues a new pair.
- On password reset, all refresh tokens for that user are invalidated.
- `@Public()` decorator bypasses JWT guard. All auth endpoints are public.
- Rate limiting is tighter on auth routes via `@Throttle`.

**Base path:** `/api/v1/auth`

---

## API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/super-admin/login` | No | Super admin email+password login |
| POST | `/auth/tenant/:tenantCode/login` | No | Admin or Manager login (by tenant code) |
| POST | `/auth/technician/login` | No | Technician login (by tenantId UUID) |
| POST | `/auth/customer/register` | No | Customer self-registration |
| POST | `/auth/customer/login` | No | Customer login (phone or email) |
| POST | `/auth/refresh` | No | Refresh access token |
| POST | `/auth/logout` | Yes (JWT) | Logout and invalidate refresh token |
| POST | `/auth/forgot-password` | No | Send password reset email |
| POST | `/auth/reset-password` | No | Set new password via token |

---

## Endpoint Details

### POST /auth/super-admin/login

Rate limit: 5 requests per minute.

**Request body:**

| Field | Type | Required | Notes |
|---|---|---|---|
| email | string | Yes | Valid email format |
| password | string | Yes | Min 6 chars |

**Process:**
1. Find user by email with `role = SUPER_ADMIN`.
2. Verify bcrypt hash. Wrong credentials → 401.
3. Check `isActive = true` → disabled account → 403.
4. Build JWT payload: `{ sub, email, role }` (no tenantId for super admin).
5. Sign access token (15m) + refresh token (7d, different secret).
6. Persist refresh token in `refresh_tokens` table with 7-day expiry.

**Response:**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGc...",
    "refreshToken": "eyJhbGc...",
    "user": { "id": "...", "name": "...", "email": "...", "role": "SUPER_ADMIN" }
  }
}
```

---

### POST /auth/tenant/:tenantCode/login

Rate limit: 10 requests per minute.

Used by **ADMIN** and **MANAGER** roles. The tenant is identified by its unique `tenantCode` slug in the URL path.

**Request body:**

| Field | Type | Required | Notes |
|---|---|---|---|
| email | string | Yes | Valid email |
| password | string | Yes | Min 6 chars |

**Process:**
1. Look up tenant by `tenantCode`. Not found → 404.
2. Verify tenant `status = ACTIVE`. Suspended/expired → 403.
3. Find user where `tenantId = tenant.id`, `email = dto.email`, `role IN (ADMIN, MANAGER)`.
4. Verify bcrypt hash. Wrong credentials → 401.
5. Check `isActive`. Disabled → 403.
6. Build JWT payload: `{ sub, email, role, tenantId }`.
7. Issue tokens.

**Response:**
```json
{
  "accessToken": "...",
  "refreshToken": "...",
  "user": { "id": "...", "name": "...", "email": "...", "role": "ADMIN", "tenantId": "..." }
}
```

---

### POST /auth/technician/login

Rate limit: 10 requests per minute.

Technicians pass `tenantId` (UUID) in the body (not as a URL param).

**Request body:**

| Field | Type | Required | Notes |
|---|---|---|---|
| tenantId | UUID | Yes | Must be a valid tenant UUID |
| email | string | Yes | Valid email |
| password | string | Yes | Min 6 chars |

**Process:**
1. Look up tenant by UUID. Not found → 404. Not ACTIVE → 403.
2. Find user where `tenantId`, `email`, `role = TECHNICIAN`.
3. Verify password, isActive.
4. Issue tokens.

**Response includes `technicianId`:**
```json
{
  "accessToken": "...",
  "refreshToken": "...",
  "user": {
    "id": "...",
    "name": "...",
    "email": "...",
    "role": "TECHNICIAN",
    "tenantId": "...",
    "technicianId": "..."
  }
}
```

---

### POST /auth/customer/register

Rate limit: 5 requests per minute. Creates both a `users` record and a `customers` record in a transaction.

**Request body:**

| Field | Type | Required | Notes |
|---|---|---|---|
| tenantId | UUID | Yes | Tenant the customer belongs to |
| name | string | Yes | Customer display name |
| email | string | No | Optional email |
| phone | string | Yes | Must be unique per tenant |
| password | string | Yes | Min 6 chars |

**Process:**
1. Validate tenant is ACTIVE.
2. Check for existing CUSTOMER with same phone in tenant → 400 if duplicate.
3. bcrypt hash password.
4. Transaction: create `User` (role=CUSTOMER) then create `Customer` profile.
5. Issue tokens immediately (auto-login after register).

**Response:**
```json
{
  "accessToken": "...",
  "refreshToken": "...",
  "user": { "id": "...", "name": "...", "role": "CUSTOMER", "tenantId": "..." }
}
```

---

### POST /auth/customer/login

Rate limit: 10 requests per minute.

**Request body:**

| Field | Type | Required | Notes |
|---|---|---|---|
| tenantId | UUID | Yes | Tenant UUID |
| phone | string | No | Either phone or email required |
| email | string | No | Either phone or email required |
| password | string | Yes | |

**Process:**
1. At least one of phone or email must be provided → 400 if neither.
2. Validate tenant is ACTIVE.
3. Find CUSTOMER user by phone or email within tenant.
4. Verify password, isActive.
5. Issue tokens. Response includes `customerId`.

---

### POST /auth/refresh

Rate limit: 20 requests per minute.

**Request body:**

| Field | Type | Required |
|---|---|---|
| refreshToken | string | Yes |

**Process:**
1. Verify the refresh token JWT signature using `JWT_REFRESH_SECRET`.
2. Look up token in `refresh_tokens` table. Not found or expired → 401.
3. Delete the old token (rotation: single-use).
4. Issue new access + refresh token pair.
5. Store new refresh token.

**Response:**
```json
{ "accessToken": "...", "refreshToken": "..." }
```

---

### POST /auth/logout

Requires valid JWT in Authorization header.

**Request body:**

| Field | Type | Required | Notes |
|---|---|---|---|
| refreshToken | string | No | If provided, only that token is deleted. If omitted, ALL user refresh tokens are deleted. |

**Process:**
- If `refreshToken` provided: `DELETE FROM refresh_tokens WHERE token = ?`
- If omitted: `DELETE FROM refresh_tokens WHERE userId = ?`

---

### POST /auth/forgot-password

Rate limit: 3 requests per minute.

**Request body:**

| Field | Type | Required | Notes |
|---|---|---|---|
| email | string | Yes | |
| tenantId | UUID | No | Omit for super admin; provide for all tenant users |

**Process:**
1. For tenant users: look up user in tenant with `isActive = true`.
2. For super admin: look up user with `role = SUPER_ADMIN`.
3. Always returns the same message regardless of whether user exists (prevents email enumeration).
4. Generate 32-byte hex reset token, set expiry = now + 15 minutes.
5. Persist `resetToken` + `resetTokenExpiry` on the User record.
6. Send email via Resend with:
   - Web reset link: `{APP_URL}/reset-password?token={token}`
   - Mobile deep link: `fieldeaze://reset-password?token={token}`

**Response:**
```json
{ "message": "If that email exists, reset instructions have been sent" }
```

---

### POST /auth/reset-password

Rate limit: 5 requests per minute.

**Request body:**

| Field | Type | Required | Notes |
|---|---|---|---|
| token | string | Yes | Token received in reset email |
| newPassword | string | Yes | Min 8 chars |

**Process:**
1. Look up user by `resetToken` where `resetTokenExpiry > now`. Not found → 400 "Invalid or expired reset token".
2. bcrypt hash new password.
3. Clear `resetToken` and `resetTokenExpiry` fields.
4. Delete ALL refresh tokens for that user (forces re-login everywhere).

---

## JWT Token Details

| Property | Value |
|---|---|
| Algorithm | HS256 |
| Access token expiry | 15 minutes (`JWT_EXPIRES_IN` env, default `'15m'`) |
| Refresh token expiry | 7 days (`JWT_REFRESH_EXPIRES_IN` env, default `'7d'`) |
| Access token secret | `JWT_SECRET` env var |
| Refresh token secret | `JWT_REFRESH_SECRET` env var (different from access) |

**JWT Payload (`JwtPayload` type):**

| Claim | Present For |
|---|---|
| sub | All users (userId) |
| email | All users |
| role | All users (UserRole enum value) |
| tenantId | ADMIN, MANAGER, TECHNICIAN, CUSTOMER (not SUPER_ADMIN) |

---

## Token Lifecycle

```
Login
  → Access token (15m, client keeps in memory)
  → Refresh token (7d, client stores securely)

Every 15m
  → POST /auth/refresh with old refresh token
  → Get new access + refresh token pair
  → Old refresh token is deleted (rotation)

Logout
  → POST /auth/logout (deletes refresh token from DB)
  → Client discards both tokens

Password reset
  → All refresh tokens invalidated → must re-login
```

---

## Guard Architecture

- **JwtAuthGuard** — validates JWT signature and expiry on all non-`@Public()` routes.
- **TenantGuard** — ensures JWT payload has `tenantId` for all non-SUPER_ADMIN roles. SUPER_ADMIN bypasses this check. Writes `request.tenantId` for use in controllers.
- **RolesGuard** — reads `@Roles()` decorator and compares with JWT `role` claim.

---

## Security Notes

- Passwords hashed with bcrypt, 10 salt rounds.
- No email enumeration on forgot-password — always returns the same message.
- On reset-password, all active sessions are invalidated.
- Super admin `tenantId` is `'system'` in the users table — not a valid tenant UUID.
- Technician login passes `tenantId` as UUID in body (not `tenantCode`). Admin/Manager use `tenantCode` in URL path.
