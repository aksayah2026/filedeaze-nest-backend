# Admin Module — Dashboard, Company Settings, Manager CRUD, Reports

Admin role manages the company profile, tenant settings, and creates managers. Admin shares the manager module endpoints too.

---

## Overview

- Controller: `AdminController`
- Service: `AdminService`
- Base path: `/api/v1/web/admin`
- Guards: `JwtAuthGuard`, `TenantGuard`, `RolesGuard`
- Roles allowed: `ADMIN` only
- `TenantId` is extracted from the JWT payload and injected via the `@TenantId()` decorator.

---

## API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/web/admin/dashboard` | ADMIN | Dashboard overview with plan usage |
| GET | `/web/admin/company-settings` | ADMIN | Get company/tenant profile |
| PATCH | `/web/admin/company-settings` | ADMIN | Update company profile |
| GET | `/web/admin/tenant-settings` | ADMIN | Get GST, UPI, invoice format settings |
| PATCH | `/web/admin/tenant-settings` | ADMIN | Update GST, UPI, invoice settings |
| GET | `/web/admin/managers` | ADMIN | List all managers for this tenant |
| POST | `/web/admin/managers` | ADMIN | Create a new manager (plan limit enforced) |
| PATCH | `/web/admin/managers/:id` | ADMIN | Update manager info |
| DELETE | `/web/admin/managers/:id` | ADMIN | Deactivate a manager (soft-delete) |
| GET | `/web/admin/reports/revenue` | ADMIN | Revenue report (date range optional) |
| GET | `/web/admin/reports/tickets` | ADMIN | Ticket statistics (date range optional) |
| GET | `/web/admin/reports/technicians` | ADMIN | Technician performance report |

---

## Endpoint Details

### GET /web/admin/dashboard

Returns aggregate counts computed in parallel. Also fetches plan usage via `PlanLimitService`.

**Response data:**

| Field | Description |
|---|---|
| totalTickets | All tickets for this tenant |
| openTickets | Tickets not in TICKET_CLOSED or INVOICE_GENERATED status |
| totalTechnicians | Active technicians |
| totalCustomers | Total customers |
| monthlyRevenue | Sum of VERIFIED payments this calendar month |
| planUsage | Object with current usage vs plan limits |

---

### GET /web/admin/company-settings

Returns the `Tenant` record for this tenant.

**Response:** Full `Tenant` object (companyName, tenantCode, email, phone, logoUrl, address, status).

---

### PATCH /web/admin/company-settings

**Request body (`UpdateCompanyDto`):** Any updatable Tenant fields (companyName, phone, address, etc.).

Updates the `tenants` row directly.

---

### GET /web/admin/tenant-settings

Returns the `TenantSetting` record. 404 if not yet configured.

**Response:** Full `TenantSetting` object including GST config, invoice format, UPI config.

---

### PATCH /web/admin/tenant-settings

**Request body (`UpdateSettingsDto`):**

| Field | Type | Notes |
|---|---|---|
| gstEnabled | boolean | Toggle GST on invoices |
| gstPercent | number | 0-28, used if gstEnabled |
| invoicePrefix | string | e.g. `"INV"` |
| invoiceNumberFormat | string | e.g. `"INV-{YEAR}-{SEQ}"` |
| upiId | string | UPI merchant ID |
| upiAccountName | string | Display name for UPI |
| upiQrImageUrl | string | URL to UPI QR image |

Uses `upsert` — creates `TenantSetting` if it does not exist.

---

### GET /web/admin/managers

Lists all users with `role = MANAGER` for this tenant, ordered by createdAt DESC.

**Response fields per manager:** `id`, `name`, `email`, `phone`, `isActive`, `createdAt`.

---

### POST /web/admin/managers

**Request body (`CreateManagerDto`):**

| Field | Type | Required |
|---|---|---|
| name | string | Yes |
| email | string | Yes (valid email) |
| phone | string | No |
| password | string | Yes (min 8 chars) |

**Process:**
1. `PlanLimitService.checkLimit(tenantId, 'manager')` — enforces subscription plan manager limit. Throws if over limit.
2. Check email uniqueness within tenant → 409 if taken.
3. bcrypt hash password.
4. Create `User` with `role = MANAGER`.

---

### PATCH /web/admin/managers/:id

**Request body (`UpdateManagerDto`):** Optional fields: `name`, `phone`, `isActive` (boolean).

Verifies manager belongs to this tenant before updating.

---

### DELETE /web/admin/managers/:id

Sets `isActive = false` on the manager's user record. Does not delete the row.

---

### GET /web/admin/reports/revenue

**Query params:**

| Param | Example |
|---|---|
| from | `2026-01-01` |
| to | `2026-12-31` |

Returns:
- `payments` — list of VERIFIED payments (with ticket + customer).
- `total` — total verified amount.
- `byMethod` — breakdown grouped by PaymentMethod.

---

### GET /web/admin/reports/tickets

**Query params:** `from`, `to` (optional date strings).

Returns:
- `total` — total ticket count in range.
- `byStatus` — count per TicketStatus.

---

### GET /web/admin/reports/technicians

Returns all technicians with `_count` of their tickets and attendance records, ordered by name.

---

## Data Models Used

### User (Manager records)

| Field | Returned |
|---|---|
| id | Yes |
| name | Yes |
| email | Yes |
| phone | Yes |
| isActive | Yes |
| createdAt | Yes |
| passwordHash | Never returned |

### TenantSetting

| Field | Type | Default |
|---|---|---|
| id | UUID | PK |
| tenantId | string | Unique |
| gstEnabled | boolean | false |
| gstPercent | Decimal(5,2) | 0 |
| invoicePrefix | string | "INV" |
| invoiceNumberFormat | string | "INV-{YEAR}-{SEQ}" |
| upiId | string? | |
| upiAccountName | string? | |
| upiQrImageUrl | string? | |
| razorpayKeyId | string? | |
| razorpayKeySecret | string? | |
| razorpayWebhookSecret | string? | |
| upiMerchantId | string? | |
| upiMerchantName | string? | |

---

## Business Rules

- Manager creation is gated by the subscription plan's `managerLimit`. Exceeding the limit returns an error.
- Manager deletion is a soft-delete (`isActive = false`); the user row is preserved.
- Admin can update tenant GST config and invoice format which flows through to all invoices generated in the tenant.
- Revenue report only counts `status = VERIFIED` payments.
- The `monthlyRevenue` on the dashboard counts verified payments from the first day of the current calendar month.
