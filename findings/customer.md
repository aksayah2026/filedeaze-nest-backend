# Customer Module — Profile, Tickets, Addresses, Invoices, Payments, Feedback

All endpoints for the customer-facing mobile app. Customers can only access their own data.

---

## Overview

- Controller: `CustomerController`
- Service: `CustomerService`
- Base path: `/api/v1/mobile/customer`
- Guards: `JwtAuthGuard`, `TenantGuard`, `RolesGuard`
- Roles allowed: `CUSTOMER` only
- All data is scoped to `tenantId` from JWT + `customerId` resolved from `userId`.

---

## API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/mobile/customer/profile` | CUSTOMER | Get my profile |
| PATCH | `/mobile/customer/profile` | CUSTOMER | Update my profile |
| POST | `/mobile/customer/tickets` | CUSTOMER | Raise a new service ticket |
| GET | `/mobile/customer/tickets` | CUSTOMER | List my tickets |
| GET | `/mobile/customer/tickets/:id` | CUSTOMER | Get ticket detail |
| PATCH | `/mobile/customer/tickets/:id/cancel` | CUSTOMER | Cancel a ticket |
| GET | `/mobile/customer/tickets/:id/track` | CUSTOMER | Live ticket tracking (technician location + status history) |
| GET | `/mobile/customer/payments` | CUSTOMER | My payment history |
| GET | `/mobile/customer/feedback` | CUSTOMER | My submitted feedback |
| GET | `/mobile/customer/invoices` | CUSTOMER | List my invoices |
| POST | `/mobile/customer/feedback` | CUSTOMER | Submit feedback for a closed ticket |
| GET | `/mobile/customer/addresses` | CUSTOMER | List my saved addresses |
| POST | `/mobile/customer/addresses` | CUSTOMER | Add a new address |
| PATCH | `/mobile/customer/addresses/:id` | CUSTOMER | Update an address |
| DELETE | `/mobile/customer/addresses/:id` | CUSTOMER | Remove an address (soft-delete) |

---

## Profile Endpoints

### GET /mobile/customer/profile

Resolves `customerId` from `userId` in JWT. Returns the `Customer` record with `_count` of tickets and feedback.

### PATCH /mobile/customer/profile

**Request body (`UpdateProfileDto`):**

| Field | Type | Notes |
|---|---|---|
| name | string | Optional |
| email | string | Optional |
| phone | string | Optional |
| address | string | Optional (freeform address string on Customer record) |

Updates both the `customers` row and the `users` row in parallel.

---

## Ticket Endpoints

### POST /mobile/customer/tickets

**Content-Type:** `multipart/form-data` (supports optional images)

**Form fields:**

| Field | Type | Required | Notes |
|---|---|---|---|
| categoryId | string | Yes | Must match subCategory's parent |
| subCategoryId | string | Yes | Must be active and belong to tenant |
| description | string | Yes | Problem description |
| scheduledAt | ISO datetime | No | Preferred service time |
| images | file(s) | No | Up to 5 images (field name: `images`) |

**Process:**
1. `PlanLimitService.checkLimit(tenantId, 'ticket')` — enforces plan's `ticketLimit`.
2. Resolve customer from userId.
3. Validate `subCategoryId` is active and belongs to tenant.
4. Validate `subCategory.categoryId === dto.categoryId` → 400 if mismatch.
5. Transaction: create `Ticket` (status=NEW_TICKET) + `TicketStatusLog` entry.
6. If images uploaded: each image is uploaded to Cloudinary, then `TicketImage` record created with `type = RAISED`.
7. Fire-and-forget: notify all managers/admins of the tenant via FCM.

**Response:**
```json
{
  "message": "Ticket raised successfully",
  "data": { "id": "...", "status": "NEW_TICKET", "tenantId": "...", ... }
}
```

### GET /mobile/customer/tickets

Returns all tickets for this customer, including:
- `technician` (id, name, phone)
- `subCategory` with parent `category`
- `feedback`
- `payment` (status, amount, method)

Ordered by createdAt DESC.

### GET /mobile/customer/tickets/:id

Returns full ticket detail for this customer:
- technician (id, name, phone)
- subCategory with category + serviceCharges
- images (all)
- statusLogs (ordered asc)
- payment (full)
- invoice (full)
- feedback

### PATCH /mobile/customer/tickets/:id/cancel

**Request body (`CancelTicketDto`):**

| Field | Type | Required |
|---|---|---|
| reason | string | Yes |

**Cannot cancel tickets in status:** `COMPLETED`, `INVOICE_GENERATED`, `TICKET_CLOSED`, `CANCELLED`, `IN_PROGRESS`.

Note: Customer cannot cancel once the technician is `IN_PROGRESS` — manager can cancel up to `COMPLETED` (excluding COMPLETED and after).

### GET /mobile/customer/tickets/:id/track

Real-time tracking response:

```json
{
  "ticketId": "...",
  "status": "TRAVELLING",
  "technician": {
    "id": "...",
    "name": "...",
    "phone": "...",
    "currentLat": 12.9716,
    "currentLng": 77.5946,
    "rating": 4.5
  },
  "statusHistory": [
    { "status": "NEW_TICKET", "changedAt": "...", "notes": null },
    { "status": "ASSIGNED", "changedAt": "...", "notes": "Assigned to Ravi" }
  ]
}
```

---

## Payment Endpoints

### GET /mobile/customer/payments

Returns all payments for this customer's tickets with:
- ticket description + subCategory/category
- invoice (invoiceNumber, total)

---

## Feedback Endpoints

### POST /mobile/customer/feedback

**Request body (`SubmitFeedbackDto`):**

| Field | Type | Required | Notes |
|---|---|---|---|
| ticketId | string | Yes | Must be customer's own ticket |
| rating | number | Yes | 1 to 5 (integer) |
| review | string | No | Text review |

**Validation:**
- Ticket must belong to this customer.
- Ticket must be in `TICKET_CLOSED` status → 400 if not.
- Feedback must not already exist for this ticket → 409 if duplicate.

### GET /mobile/customer/feedback

Returns all feedback submitted by this customer with ticket subCategory/category info.

---

## Invoice Endpoints

### GET /mobile/customer/invoices

Returns all invoices for this customer's tickets with:
- ticket description + subCategory/category
- payment method + collectedAt

---

## Address Endpoints

### GET /mobile/customer/addresses

Returns all active (`isActive = true`) addresses for this user, ordered by createdAt ASC.

### POST /mobile/customer/addresses

**Request body (`CreateAddressDto`):**

| Field | Type | Required | Notes |
|---|---|---|---|
| label | string | No | Defaults to `"home"`. Must be unique per user. |
| street | string | Yes | |
| city | string | Yes | |
| state | string | No | |
| country | string | No | Defaults to `"India"` |
| postalCode | string | No | |

**Logic:**
- If a soft-deleted address with the same label exists → reactivate and update it.
- If an active address with same label already exists → 409.

### PATCH /mobile/customer/addresses/:id

**Request body (`UpdateAddressDto`):** Any address fields (all optional).

Validates address belongs to this user.

### DELETE /mobile/customer/addresses/:id

Soft-delete: sets `isActive = false`. Address record is preserved.

---

## Data Models

### Customer

| Field | Type |
|---|---|
| id | UUID |
| tenantId | string |
| userId | string (unique, FK → User) |
| name | string |
| email | string? |
| phone | string? |
| address | string? (freeform) |
| createdAt | DateTime |

### Address

| Field | Type | Default |
|---|---|---|
| id | UUID | |
| tenantId | string | |
| userId | string | |
| label | string | "home" |
| street | string | |
| city | string | |
| state | string? | |
| country | string | "India" |
| postalCode | string? | |
| isActive | boolean | true |

Unique constraint: `(userId, label)`.

---

## Business Rules

- Customer profile (Customer record) is separate from User record — both are updated on `PATCH /profile`.
- Ticket plan limit is enforced at raise time via `PlanLimitService`.
- Customer can only cancel tickets in `NEW_TICKET`, `ASSIGNED`, or `ACCEPTED`, `TRAVELLING`, `REACHED_LOCATION` status. Once `IN_PROGRESS` or beyond, cancellation is blocked.
- Feedback is strictly gated to `TICKET_CLOSED` status and is a one-time submission per ticket.
- The tracking endpoint exposes the technician's live GPS coordinates (`currentLat`, `currentLng`) from the `technicians` table.
- Up to 5 images can be uploaded during ticket creation (field name: `images`). All are stored with `type = RAISED`.
