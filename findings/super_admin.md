# Super Admin Module — Tenant Management, Plans, Subscriptions, Billing

Platform-level administration. Super admin has no tenantId and manages all tenants.

---

## Overview

- Controller: `SuperAdminController`
- Service: `SuperAdminService`
- Base path: `/api/v1/web/super-admin`
- All endpoints require `role = SUPER_ADMIN` (except `POST /setup` which is public and one-time only).
- Guards: `JwtAuthGuard`, `RolesGuard`

---

## API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/web/super-admin/setup` | No (public, one-time) | Create the first super admin account |
| POST | `/web/super-admin/create-super-admin` | SUPER_ADMIN | Create additional super admin accounts |
| GET | `/web/super-admin/dashboard` | SUPER_ADMIN | Platform-wide statistics |
| POST | `/web/super-admin/tenants` | SUPER_ADMIN | Create a new tenant with admin account |
| GET | `/web/super-admin/tenants` | SUPER_ADMIN | List all tenants (filterable) |
| GET | `/web/super-admin/tenants/:id` | SUPER_ADMIN | Get tenant details with subscription + billing history |
| PATCH | `/web/super-admin/tenants/:id` | SUPER_ADMIN | Update tenant profile info |
| PATCH | `/web/super-admin/tenants/:id/status` | SUPER_ADMIN | Activate or suspend a tenant |
| DELETE | `/web/super-admin/tenants/:id` | SUPER_ADMIN | Soft-delete tenant (deactivates all users) |
| GET | `/web/super-admin/plans` | SUPER_ADMIN | List all subscription plans |
| POST | `/web/super-admin/plans` | SUPER_ADMIN | Create a subscription plan |
| PATCH | `/web/super-admin/plans/:id` | SUPER_ADMIN | Update a subscription plan |
| POST | `/web/super-admin/subscriptions` | SUPER_ADMIN | Assign a subscription plan to a tenant |
| PATCH | `/web/super-admin/subscriptions/:id/renew` | SUPER_ADMIN | Renew an existing subscription |
| GET | `/web/super-admin/billing` | SUPER_ADMIN | Revenue and billing report |
| GET | `/web/super-admin/activity-logs` | SUPER_ADMIN | Paginated platform audit trail |

---

## POST /web/super-admin/setup

**Public endpoint — one-time only.** Blocked if any SUPER_ADMIN user already exists.

**Request body (`CreateSuperAdminDto`):**

| Field | Type | Required |
|---|---|---|
| name | string | Yes |
| email | string | Yes |
| password | string | Yes |

**Process:**
1. Check if any user with `role = SUPER_ADMIN` exists. If yes → 409.
2. bcrypt hash password.
3. Create user with `tenantId = 'system'`, `role = SUPER_ADMIN`.

**Response:**
```json
{
  "message": "Super admin created successfully. Please login and change your password.",
  "data": { "id": "...", "name": "...", "email": "...", "role": "SUPER_ADMIN" }
}
```

---

## POST /web/super-admin/create-super-admin

Requires existing SUPER_ADMIN token. Creates additional super admin accounts.

**Request body:** Same as `CreateSuperAdminDto` above.

**Validation:** Email must not already be used by another SUPER_ADMIN → 409 if duplicate.

---

## GET /web/super-admin/dashboard

Returns platform-wide aggregate statistics computed in parallel.

**Response data:**

| Field | Description |
|---|---|
| totalTenants | Total tenant count |
| activeTenants | Count with status = ACTIVE |
| expiredTenants | Count with status = EXPIRED |
| suspendedTenants | Count with status = SUSPENDED |
| totalRevenue | Sum of all PAID billing amounts |
| activeUsers | Count of active non-SUPER_ADMIN users |

---

## POST /web/super-admin/tenants

Creates a tenant, admin user, and TenantSetting record in a single transaction. Optionally assigns a subscription plan.

**Request body (`CreateTenantDto`):**

| Field | Type | Required | Notes |
|---|---|---|---|
| companyName | string | Yes | |
| tenantCode | string | Yes | Unique slug, lowercased on save |
| email | string | Yes | Company contact email (must be unique) |
| phone | string | No | |
| address | string | No | |
| adminName | string | Yes | Name of the initial admin user |
| adminEmail | string | Yes | Admin login email (must be unique) |
| adminPassword | string | Yes | |
| plan | PlanName enum | No | If provided, creates 1-year subscription |

**Validation:**
- `tenantCode` uniqueness check.
- Company `email` uniqueness check.
- `adminEmail` uniqueness check among ADMIN users.

**Transaction steps:**
1. Create `Tenant` record.
2. Create `User` record (role=ADMIN, tenantId=tenant.id).
3. Create `TenantSetting` record (default GST/invoice settings).
4. If `plan` provided: find `SubscriptionPlan` by name, create `Subscription` with start=today, end=today+1year.

---

## GET /web/super-admin/tenants

**Query params:**

| Param | Type | Notes |
|---|---|---|
| status | TenantStatus | ACTIVE, SUSPENDED, EXPIRED |
| plan | PlanName | STARTER, PROFESSIONAL, ENTERPRISE |

Returns tenants with their active subscription + plan details included. `plan` filter is applied post-query (in-memory filtering).

---

## GET /web/super-admin/tenants/:id

Returns full tenant detail including all subscriptions (with plan) and last 10 billing records.

---

## PATCH /web/super-admin/tenants/:id/status

**Request body:**

| Field | Type | Notes |
|---|---|---|
| status | TenantStatus | ACTIVE, SUSPENDED, or EXPIRED |

---

## DELETE /web/super-admin/tenants/:id

Does NOT hard-delete. Performs a soft-delete:
1. Sets `isActive = false` on all tenant users.
2. Sets `status = CANCELLED` on all ACTIVE subscriptions.
3. Sets tenant `status = SUSPENDED`.

---

## POST /web/super-admin/plans

**Request body (`CreatePlanDto`):**

| Field | Type | Required | Notes |
|---|---|---|---|
| name | PlanName enum | Yes | STARTER, PROFESSIONAL, or ENTERPRISE (unique) |
| managerLimit | number | Yes | Max managers allowed |
| technicianLimit | number | Yes | Max technicians allowed |
| ticketLimit | number | Yes | Max tickets allowed |
| storageLimitGb | number | Yes | Cloud storage limit |
| price | number | Yes | Plan price (Decimal) |

Plan names are unique (enforced by Prisma `@unique`). Creating a duplicate name → 409.

---

## PATCH /web/super-admin/plans/:id

**Request body (`UpdatePlanDto`):** All fields optional. Can update: `managerLimit`, `technicianLimit`, `ticketLimit`, `storageLimitGb`, `price`.

---

## POST /web/super-admin/subscriptions

Assigns a plan to a tenant. Cancels any currently ACTIVE subscriptions for that tenant first.

**Request body (`AssignSubscriptionDto`):**

| Field | Type | Required |
|---|---|---|
| tenantId | string | Yes |
| planId | string | Yes |
| startDate | ISO date string | Yes |
| endDate | ISO date string | Yes |

---

## PATCH /web/super-admin/subscriptions/:id/renew

**Request body (`RenewSubscriptionDto`):**

| Field | Type | Required |
|---|---|---|
| endDate | ISO date string | Yes |

Sets `endDate` and `status = ACTIVE` on the subscription.

---

## GET /web/super-admin/billing

Returns last 100 billing records with tenant and subscription plan included, plus a summary:

| Summary Field | Description |
|---|---|
| totalPaid | Sum of all PAID billing amounts |
| totalPending | Sum of all PENDING billing amounts |

---

## GET /web/super-admin/activity-logs

Paginated audit trail from the `audit_logs` table.

**Query params:**

| Param | Type | Default |
|---|---|---|
| page | number | 1 |
| limit | number | 50 |
| userId | string | optional filter |
| entity | string | optional filter (case-insensitive LIKE) |

**Response:**
```json
{
  "data": {
    "logs": [...],
    "total": 250,
    "page": 1,
    "limit": 50,
    "totalPages": 5
  }
}
```

---

## Data Models

### Tenant

| Field | Type | Notes |
|---|---|---|
| id | UUID | PK |
| companyName | string | |
| tenantCode | string | Unique slug |
| email | string | Unique |
| phone | string? | |
| logoUrl | string? | |
| address | string? | |
| status | TenantStatus | ACTIVE / SUSPENDED / EXPIRED |
| createdAt | DateTime | |
| updatedAt | DateTime | |

### SubscriptionPlan

| Field | Type | Notes |
|---|---|---|
| id | UUID | PK |
| name | PlanName | Unique (STARTER / PROFESSIONAL / ENTERPRISE) |
| managerLimit | int | |
| technicianLimit | int | |
| ticketLimit | int | |
| storageLimitGb | int | |
| price | Decimal(10,2) | |

### Subscription

| Field | Type | Notes |
|---|---|---|
| id | UUID | PK |
| tenantId | string | FK → Tenant |
| planId | string | FK → SubscriptionPlan |
| startDate | DateTime | |
| endDate | DateTime | |
| status | SubscriptionStatus | ACTIVE / EXPIRED / CANCELLED |

### Billing

| Field | Type | Notes |
|---|---|---|
| id | UUID | PK |
| tenantId | string | FK → Tenant |
| subscriptionId | string | FK → Subscription |
| amount | Decimal(10,2) | |
| paidAt | DateTime? | |
| invoiceUrl | string? | |
| status | BillingStatus | PENDING / PAID / FAILED |

### AuditLog

| Field | Type | Notes |
|---|---|---|
| id | UUID | PK |
| tenantId | string | |
| userId | string | FK → User |
| action | string | e.g. CREATE, UPDATE, DELETE |
| entity | string | Model name |
| entityId | string | |
| oldValue | JSON? | |
| newValue | JSON? | |
| createdAt | DateTime | |

---

## Business Rules

- `tenantCode` is stored in lowercase. Must be unique across all tenants.
- Super admin users have `tenantId = 'system'` in the `users` table — this is not a real tenant row.
- Only one `setup` call is allowed per platform deployment. Subsequent calls → 409.
- When assigning a new subscription, existing ACTIVE subscriptions are cancelled first (no multi-active subscriptions per tenant).
- `DELETE /tenants/:id` is a soft-delete — no rows are hard-deleted from the database.
