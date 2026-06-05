# Users — User Management, Customer Management & Addresses

## Overview

User management covers creating and editing user profiles across all roles (CUSTOMER, TECHNICIAN, ADMIN, etc.). The `AdminCustomerController` provides admin-level views of customers with stats. The `AddressController` manages per-user shipping/service addresses.

---

## User API Endpoints

**Base path:** `/api/private/users`

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| POST | `/` | @IsAdmin | Create a new user |
| GET | `/` | @IsAdmin | List users with filters and pagination |
| GET | `/{id}` | @IsAdminOrSelf | Get user by ID |
| GET | `/profile` | Authenticated | Get current logged-in user's profile |
| PUT | `/{id}` | @IsAdmin | Admin update any user |
| DELETE | `/{id}` | @IsAdminOrSelf | Soft-delete user |
| POST | `/upload-profile` | Authenticated | Upload profile image |
| PUT | `/update` | Authenticated | User self-profile update |

### GET `/` — Query Parameters

| Param | Type | Description |
|-------|------|-------------|
| userid | String | Exact match on userId |
| username | String | Case-insensitive contains |
| emailid | String | Case-insensitive exact |
| role | String | Case-insensitive exact |
| enabled | Boolean | Filter by account status |
| page | int | Default 0 |
| size | int | Default 10 |
| sortBy | String | Default `userId` |
| direction | String | `asc` / `desc` (default `asc`) |

---

## UserEntity — Database Schema

**Table:** `users`

| Field | Type | Notes |
|-------|------|-------|
| userId | String (UUID) | PK, auto-generated |
| username | String | Display name, 3–50 chars |
| email | String | Unique, login identifier |
| password | String | BCrypt hashed, never returned |
| role | String | CUSTOMER, TECHNICIAN, ADMIN, etc. |
| enabled | boolean | Default true |
| accountNonLocked | boolean | Default true |
| emailVerified | boolean | Default false |
| verificationToken | String | For password reset |
| phoneNumber | String | 10 digits |
| gender | String | |
| birthDate | LocalDate | |
| profileImageUrl | String | Relative URL |
| createdDate | LocalDateTime | Immutable, set on create |
| updatedDate | LocalDateTime | Auto-updated |
| isDeleted | boolean | Soft delete flag |
| deletedDate | LocalDateTime | Set on soft delete |
| refreshToken | String | Current session refresh token |
| refreshTokenExpiry | LocalDateTime | Refresh token or reset token expiry |
| tenantId | String | Multi-tenant; null for SUPER_ADMIN |
| createdBy | String | Audit field (userId of creator) |
| updatedBy | String | Audit field |

**Relationships:**

| Association | Type | Entity |
|-------------|------|--------|
| address | OneToMany (cascade ALL, orphan removal) | AddressEntity |
| cart | OneToOne (cascade ALL) | CartEntity |
| attachments | OneToMany (cascade ALL) | ServiceRequestAttachmentItemEntity |
| requests | OneToMany | ServiceRequestEntity (customer-side) |

**Lifecycle hooks:**
- `@PrePersist`: sets `createdDate` and `updatedDate`
- `@PreUpdate`: sets `updatedDate`

---

## UserDTO Structure

Key fields transferred in API:

| Field | Notes |
|-------|-------|
| userId | |
| username / name | Aliases (synced internally) |
| email | |
| password | `@JsonProperty(WRITE_ONLY)` — never returned |
| role | |
| enabled, accountNonLocked | |
| phoneNumber / phone | Aliases |
| gender, birthDate | |
| profileImageUrl / profileImage | Aliases |
| address | `List<AddressDTO>` |
| tenantId | |
| skills | `List<SkillsDTO>` (technician only) |
| experienceYears, ratings, proficiencyLevel | Technician metadata |
| totalBookings, activeRequests | Computed stats |
| registrationDate | Alias for createdDate |

`@JsonInclude(NON_NULL)` — null fields omitted from JSON output.

---

## Create User Flow (Admin)

1. `POST /api/private/users` with `UserDTO`.
2. Validate: email uniqueness (409 on duplicate).
3. Hash password with BCrypt.
4. Default role to `CUSTOMER` if not provided.
5. If role is `TECHNICIAN`: create a `TechnicianSkillEntity` row for the user.
6. Save `UserEntity`.
7. Return created `UserDTO` with synced aliases and skill metadata.

---

## Self Profile Update Flow

`PUT /api/private/users/update` (no @IsAdmin — any authenticated user):

1. Extract `userId` from JWT via `request.getAttribute("userId")`.
2. Fetch existing entity.
3. Update only editable fields: name, phone, gender, birthDate, addresses.
4. Preserve: role, password, createdDate, createdBy.
5. If role = TECHNICIAN: update `TechnicianSkillEntity` as well.

---

## Profile Image Upload

`POST /api/private/users/upload-profile` (multipart):

- Param: `profileImage` or `file`
- Saves to: `uploads/profiles/{userId}_{uuid}.{ext}`
- Stores relative URL `/uploads/profiles/{filename}` in `UserEntity.profileImageUrl`

---

## Soft Delete

`DELETE /api/private/users/{id}`:

- Sets `isDeleted = true`, `deletedDate = now()`, `enabled = false`
- Data preserved for audit; never hard-deleted
- Restore: clears `isDeleted` and `deletedDate`

---

## Repository Custom Queries

**File:** `UserEntityRepo.java`

```java
Optional<UserEntity> findByEmail(String email);
Optional<UserEntity> findByUserId(String userId);
Optional<UserEntity> findByRefreshToken(String refreshToken);
Optional<UserEntity> findByVerificationToken(String verificationToken);
boolean existsByEmail(String email);
long countByRole(String role);
long countByTenantIdAndIsDeletedFalse(String tenantId);

// Paginated multi-criteria filter
Page<UserEntity> findAllWithFilters(
    userId, name, email, roles, checkRoles, enabled, Pageable
);

// Eager fetch for attachments (avoids N+1)
UserEntity findUserWithAttachments(userId);
```

---

## Admin Customer Management

**Base path:** `/api/private/admin/customers`

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| GET | `/` | @IsAdmin | Paginated customer list with filters |
| GET | `/{id}` | @IsAdmin | Full customer profile with stats |
| PATCH | `/status` | @IsAdmin | Enable / disable customer account |

### GET `/` — Query Parameters

| Param | Default |
|-------|---------|
| name | – |
| email | – |
| enabled | – |
| page | 0 |
| size | 10 |
| sortBy | createdDate |
| direction | desc |

Response payload per customer:

```json
{
  "userId": "...",
  "username": "...",
  "email": "...",
  "enabled": true,
  "totalBookings": 5,
  "activeRequests": 2,
  "registrationDate": "2024-01-01T..."
}
```

### GET `/{id}` Response:

```json
{
  "profile": { "...UserDTO" },
  "addresses": [ "...AddressEntity..." ],
  "bookings": [ "...ServiceRequestEntity..." ],
  "stats": {
    "totalBookings": 10,
    "completedBookings": 7,
    "pendingBookings": 2,
    "cancelledBookings": 1,
    "totalSpent": 5500.00
  }
}
```

### PATCH `/status?id=&enabled=`

Sets `user.enabled = true/false`. Disabling prevents login but preserves data.

---

## Address Management

**Base path:** `/api/private/addresses`

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/` | Add address for user |
| PUT | `/{userId}/{label}` | Update address by label |
| GET | `/{userId}` | Get all addresses for user |
| DELETE | `/{userId}/{id}` | Delete address by ID |

### AddressDTO

```json
{
  "id": "uuid",
  "isActive": true,
  "userId": "...",
  "street": "...",
  "city": "...",
  "state": "...",
  "country": "...",
  "postalCode": "...",
  "label": "home"
}
```

### Business Rules

- **Label uniqueness:** `userId + label` must be unique. Returns 409 on duplicate.
- **Single active address:** Adding or updating any address deactivates all other addresses for that user. Only the latest is `isActive = true`.
- **Soft delete:** Addresses are hard-deleted (no soft-delete flag).
- **Ownership check:** Delete validates `address.customer.userId == userId`.

### Repository Methods

```java
List<AddressEntity> findByCustomer_UserId(String userId);
List<AddressEntity> findByCustomer_UserIdAndLabel(String userId, String label);
boolean existsByCustomer_UserIdAndLabel(String userId, String label);
```
