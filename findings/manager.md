# Manager Module — Technician CRUD, Service Catalog, Ticket Management, Attendance, Payments, Feedback

The manager module is the primary operational interface for day-to-day field service management. Both ADMIN and MANAGER roles have full access.

---

## Overview

- Controller: `ManagerController`
- Service: `ManagerService`
- Base path: `/api/v1/web/manager`
- Guards: `JwtAuthGuard`, `TenantGuard`, `RolesGuard`
- Roles allowed: `ADMIN`, `MANAGER`

---

## API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/web/manager/dashboard` | ADMIN/MANAGER | Manager dashboard statistics |
| GET | `/web/manager/technicians` | ADMIN/MANAGER | List all technicians with ticket/attendance counts |
| POST | `/web/manager/technicians` | ADMIN/MANAGER | Create technician (plan limit enforced) |
| GET | `/web/manager/technicians/:id` | ADMIN/MANAGER | Get technician detail |
| PATCH | `/web/manager/technicians/:id` | ADMIN/MANAGER | Update technician (name, phone, isActive) |
| DELETE | `/web/manager/technicians/:id` | ADMIN/MANAGER | Deactivate technician |
| GET | `/web/manager/technicians/:id/location` | ADMIN/MANAGER | Get live GPS location |
| GET | `/web/manager/service-categories` | ADMIN/MANAGER | List service categories |
| POST | `/web/manager/service-categories` | ADMIN/MANAGER | Create service category |
| PATCH | `/web/manager/service-categories/:id` | ADMIN/MANAGER | Update service category |
| DELETE | `/web/manager/service-categories/:id` | ADMIN/MANAGER | Deactivate service category |
| GET | `/web/manager/service-sub-categories` | ADMIN/MANAGER | List sub-categories (filterable by categoryId) |
| POST | `/web/manager/service-sub-categories` | ADMIN/MANAGER | Create sub-category |
| PATCH | `/web/manager/service-sub-categories/:id` | ADMIN/MANAGER | Update sub-category |
| DELETE | `/web/manager/service-sub-categories/:id` | ADMIN/MANAGER | Deactivate sub-category |
| POST | `/web/manager/service-charges/:subCategoryId` | ADMIN/MANAGER | Upsert service charge for a sub-category |
| GET | `/web/manager/customers` | ADMIN/MANAGER | List customers (with optional search) |
| GET | `/web/manager/customers/:id/history` | ADMIN/MANAGER | Customer ticket history |
| GET | `/web/manager/tickets` | ADMIN/MANAGER | List tickets (filterable) |
| GET | `/web/manager/tickets/:id` | ADMIN/MANAGER | Full ticket detail |
| PATCH | `/web/manager/tickets/:id/assign` | ADMIN/MANAGER | Assign technician to ticket |
| PATCH | `/web/manager/tickets/:id/reassign` | ADMIN/MANAGER | Reassign ticket to different technician |
| PATCH | `/web/manager/tickets/:id/close` | ADMIN/MANAGER | Close ticket (must be INVOICE_GENERATED) |
| PATCH | `/web/manager/tickets/:id/cancel` | ADMIN/MANAGER | Cancel ticket |
| GET | `/web/manager/attendance` | ADMIN/MANAGER | View attendance records (filterable) |
| GET | `/web/manager/feedback` | ADMIN/MANAGER | View customer feedback |
| GET | `/web/manager/payments` | ADMIN/MANAGER | Payment collection report |
| PATCH | `/web/manager/payments/:id/verify` | ADMIN/MANAGER | Verify a collected payment |

---

## Dashboard

**GET /web/manager/dashboard**

Counts computed in parallel:

| Field | Description |
|---|---|
| totalTickets | All tickets for tenant |
| newTickets | Count in NEW_TICKET status |
| assignedTickets | Count in ASSIGNED status |
| inProgressTickets | Count in IN_PROGRESS status |
| pendingTickets | Count in PENDING status |
| completedTickets | Count in TICKET_CLOSED status |
| totalTechnicians | Active technician count |
| pendingPayments | Payments with status = PENDING |

---

## Technician Management

### POST /web/manager/technicians

**Request body (`CreateTechnicianDto`):**

| Field | Type | Required |
|---|---|---|
| name | string | Yes |
| email | string | Yes (valid email, unique per tenant) |
| phone | string | No |
| password | string | Yes (min 8 chars) |

**Process:**
1. `PlanLimitService.checkLimit(tenantId, 'technician')` — enforces plan's `technicianLimit`.
2. Check email uniqueness within tenant → 409 if taken.
3. Transaction: create `User` (role=TECHNICIAN), then create `Technician` profile.

### PATCH /web/manager/technicians/:id

**Request body (`UpdateTechnicianDto`):** Optional: `name`, `phone`, `isActive` (boolean).

When `isActive` is provided, both `technician.isActive` and `user.isActive` are updated in parallel.

### DELETE /web/manager/technicians/:id

Sets both `technician.isActive = false` and `user.isActive = false`.

### GET /web/manager/technicians/:id/location

Returns current lat/lng from the `technicians` table:
```json
{ "id": "...", "name": "...", "currentLat": 12.9716, "currentLng": 77.5946, "updatedAt": "..." }
```

---

## Service Catalog

### GET /web/manager/service-categories

Returns all categories with count of sub-categories.

### POST /web/manager/service-categories

**Request body (`CreateCategoryDto`):**

| Field | Type | Required |
|---|---|---|
| name | string | Yes |

### PATCH /web/manager/service-categories/:id

**Request body (`UpdateCategoryDto`):** Optional fields (name, description, imageUrl, isActive, etc.).

### GET /web/manager/service-sub-categories

**Query param:** `categoryId` (optional) — filters sub-categories by parent category.

Returns sub-categories with their parent `category` and `serviceCharges` included.

### POST /web/manager/service-sub-categories

**Request body (`CreateSubCategoryDto`):**

| Field | Type | Required |
|---|---|---|
| categoryId | string | Yes |
| name | string | Yes |

Validates that `categoryId` belongs to this tenant.

### POST /web/manager/service-charges/:subCategoryId

Upsert (create or update) the charge record for a sub-category.

**Request body (`UpsertServiceChargeDto`):**

| Field | Type | Notes |
|---|---|---|
| serviceCharge | Decimal | Base service fee |
| inspectionCharge | Decimal | Inspection visit fee |
| emergencyCharge | Decimal | Emergency call-out fee |

---

## Customer Management

### GET /web/manager/customers

**Query param:** `search` (optional) — matches against name, phone, email (case-insensitive).

Returns customers with `_count.tickets`.

### GET /web/manager/customers/:id/history

Returns full customer record with all tickets, including technician, feedback, payment, and invoice on each ticket.

---

## Ticket Management

### GET /web/manager/tickets

**Query params (`TicketFilterDto`):**

| Param | Type | Notes |
|---|---|---|
| status | TicketStatus enum | Filter by status |
| technicianId | string | Filter by assigned technician |
| customerId | string | Filter by customer |
| from | date string | createdAt >= from |
| to | date string | createdAt <= to |

Returns tickets with customer, technician, subCategory (with category), and image count included.

### GET /web/manager/tickets/:id

Full ticket detail including: customer, technician, subCategory (with charges), images, status logs (with changer name/role), payment, invoice, feedback.

### PATCH /web/manager/tickets/:id/assign

**Request body (`AssignTechnicianDto`):**

| Field | Type | Required |
|---|---|---|
| technicianId | string | Yes |
| scheduledAt | ISO datetime string | No |

**Validation:**
- Ticket must allow `ASSIGNED` as next status (per `TICKET_FORWARD_TRANSITIONS` — only NEW_TICKET can be assigned).
- Technician must be active and belong to this tenant.

**Side effects:**
- Ticket status → ASSIGNED.
- Status log created with note "Assigned to {name}".
- FCM push notification sent to technician's device tokens.

### PATCH /web/manager/tickets/:id/reassign

**Request body:** Same as assign.

**Validation:** Ticket must be in ASSIGNED or ACCEPTED status.

Sets status back to ASSIGNED with new technicianId.

### PATCH /web/manager/tickets/:id/close

**Request body (`CloseTicketDto`):**

| Field | Type | Required |
|---|---|---|
| notes | string | No |

**Validation:** Ticket must be in `INVOICE_GENERATED` status. → 400 otherwise.

Sets `status = TICKET_CLOSED`, `closedAt = now()`. Sends FCM notification to customer.

### PATCH /web/manager/tickets/:id/cancel

**Request body:**

| Field | Type | Required |
|---|---|---|
| reason | string | Yes |

**Cannot cancel tickets in:** `COMPLETED`, `INVOICE_GENERATED`, `TICKET_CLOSED`, `CANCELLED`.

---

## Attendance View

### GET /web/manager/attendance

**Query params:**

| Param | Notes |
|---|---|
| technicianId | Filter to one technician |
| from | Date string (date field) |
| to | Date string (date field) |

Returns up to 200 records, ordered by date DESC, including technician name.

---

## Feedback View

### GET /web/manager/feedback

**Query params:** `from`, `to` (createdAt range).

Returns feedback with customer name, ticket info (subCategory with category), and technician name.

---

## Payment Management

### GET /web/manager/payments

**Query params:** `status`, `from`, `to` (collectedAt range).

Returns payment list with ticket/customer and technician, plus `totalVerified` (sum of all VERIFIED payments in the filtered set).

### PATCH /web/manager/payments/:id/verify

**Validation:** Payment must be in `COLLECTED` status → 400 otherwise.

**Process:**
1. Set `payment.status = VERIFIED`.
2. Create a TicketStatusLog entry for the ticket with status `INVOICE_GENERATED` and notes "Payment verified by manager".

---

## Data Models

### ServiceCategory

| Field | Type | Default |
|---|---|---|
| id | UUID | PK |
| tenantId | string | |
| name | string | |
| description | string? | |
| imageUrl | string? | |
| rating | float | 0 |
| price | string? | |
| isActive | boolean | true |
| isDeleted | boolean | false |

### ServiceSubCategory

| Field | Type |
|---|---|
| id | UUID |
| tenantId | string |
| categoryId | string |
| name | string |
| isActive | boolean |

### ServiceCharge

| Field | Type | Default |
|---|---|---|
| id | UUID | PK |
| tenantId | string | |
| subCategoryId | string | Unique |
| serviceCharge | Decimal(10,2) | 0 |
| inspectionCharge | Decimal(10,2) | 0 |
| emergencyCharge | Decimal(10,2) | 0 |

---

## Business Rules

- Technician creation is gated by `PlanLimitService.checkLimit(tenantId, 'technician')`.
- Only tickets in `NEW_TICKET` status can be assigned (per `TICKET_FORWARD_TRANSITIONS`).
- Reassignment is only allowed in `ASSIGNED` or `ACCEPTED` status.
- Closing a ticket requires it to be in `INVOICE_GENERATED` status.
- Cancellation is blocked for `COMPLETED`, `INVOICE_GENERATED`, `TICKET_CLOSED`, and `CANCELLED`.
- Payment verification triggers a TicketStatusLog entry (for audit trail) but does NOT move the ticket status — the ticket should already be in `INVOICE_GENERATED`.
- `ServiceCharge` is a 1:1 with `ServiceSubCategory` (upsert semantics).
- Sub-category creation validates that the parent `categoryId` belongs to the same tenant.
