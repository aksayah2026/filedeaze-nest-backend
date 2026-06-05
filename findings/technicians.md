# Technician Module — Attendance, Location, Ticket Lifecycle, Image Upload, Payment Collection

All endpoints for the technician-facing mobile app. Technicians can only access their own assigned data.

---

## Overview

- Controller: `TechnicianController`
- Service: `TechnicianService`
- Base path: `/api/v1/mobile/technician`
- Guards: `JwtAuthGuard`, `TenantGuard`, `RolesGuard`
- Roles allowed: `TECHNICIAN` only
- `tenantId` comes from JWT. `technicianId` is resolved internally from `userId` on each request.

---

## API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/mobile/technician/dashboard` | TECHNICIAN | Dashboard: counts, attendance status, rating |
| GET | `/mobile/technician/profile` | TECHNICIAN | Get my technician profile |
| POST | `/mobile/technician/attendance/checkin` | TECHNICIAN | Check in with GPS coordinates |
| POST | `/mobile/technician/attendance/checkout` | TECHNICIAN | Check out with GPS coordinates |
| GET | `/mobile/technician/attendance` | TECHNICIAN | Attendance history (last 30 records) |
| PATCH | `/mobile/technician/location` | TECHNICIAN | Update live GPS location |
| GET | `/mobile/technician/tickets` | TECHNICIAN | List my assigned tickets (excludes TICKET_CLOSED) |
| GET | `/mobile/technician/tickets/:id` | TECHNICIAN | Get ticket detail |
| PATCH | `/mobile/technician/tickets/:id/status` | TECHNICIAN | Update ticket status (forward-only) |
| POST | `/mobile/technician/tickets/:id/complete` | TECHNICIAN | Complete a ticket (before/after photos required) |
| POST | `/mobile/technician/tickets/:id/pending` | TECHNICIAN | Mark ticket as pending with reason |
| POST | `/mobile/technician/tickets/:id/reject` | TECHNICIAN | Reject ticket — returns to unassigned queue |
| POST | `/mobile/technician/tickets/:id/images` | TECHNICIAN | Upload a ticket image (multipart) |
| POST | `/mobile/technician/tickets/:id/collect-payment` | TECHNICIAN | Collect payment + auto-generate invoice |

---

## Dashboard

### GET /mobile/technician/dashboard

Response:

| Field | Description |
|---|---|
| totalTickets | All tickets ever assigned to me |
| openTickets | Active tickets (not TICKET_CLOSED, INVOICE_GENERATED, or COMPLETED) |
| todayTickets | Tickets created today |
| completedTickets | Tickets with status = TICKET_CLOSED |
| isCheckedIn | True if checked in today and no checkout yet |
| checkInTime | Today's check-in time or null |
| checkOutTime | Today's check-out time or null |
| rating | Technician rating (float, default 0) |
| totalJobs | Total job count (int) |

---

## Profile

### GET /mobile/technician/profile

Returns technician record including `user.email`, `user.isActive`, `user.createdAt`, and `_count` of tickets and attendance.

---

## Attendance

### POST /mobile/technician/attendance/checkin

**Request body (`CheckInDto`):**

| Field | Type | Validation |
|---|---|---|
| lat | number | -90 to 90 |
| lng | number | -180 to 180 |

**Process:**
1. Resolve technician from userId+tenantId.
2. Check for existing attendance where `date = today`. If found → 409 "You have already checked in today".
3. Create `Attendance` with `checkInTime = now()`, `date = today`.
4. Update `technician.currentLat/Lng` in parallel.

### POST /mobile/technician/attendance/checkout

**Request body:** Same as CheckInDto.

**Process:**
1. Find attendance where `technicianId`, `date = today`, `checkOutTime IS NULL`. Not found → 404.
2. Set `checkOutTime = now()`, `checkOutLat/Lng`.
3. Update `technician.currentLat/Lng` in parallel.

### GET /mobile/technician/attendance

Returns last 30 attendance records ordered by date DESC.

---

## Location

### PATCH /mobile/technician/location

**Request body (`UpdateLocationDto`):**

| Field | Type | Validation |
|---|---|---|
| lat | number | -90 to 90 |
| lng | number | -180 to 180 |

Updates `technician.currentLat` and `technician.currentLng` only. This is the live GPS that customers see via the tracking endpoint.

Note: The `technician_locations` history table exists in the schema but is not written to by this endpoint.

---

## Ticket Endpoints

### GET /mobile/technician/tickets

Returns tickets assigned to this technician where `status != TICKET_CLOSED`. Includes customer, subCategory with category, and `_count.images`. Ordered by updatedAt DESC.

### GET /mobile/technician/tickets/:id

Full ticket detail: customer, subCategory (with category + serviceCharges), images, statusLogs, payment.

Validates ticket is assigned to this technician → 404 otherwise.

### PATCH /mobile/technician/tickets/:id/status

**Request body (`UpdateTicketStatusDto`):**

| Field | Type | Required | Notes |
|---|---|---|---|
| status | TicketStatus | Yes | Target status |
| notes | string | No | Optional notes |
| pendingReason | PendingReason | Conditional | Required if status = PENDING |

**Allowed transitions (from `TICKET_FORWARD_TRANSITIONS`):**

| From | Allowed Next |
|---|---|
| ASSIGNED | ACCEPTED |
| ACCEPTED | TRAVELLING |
| TRAVELLING | REACHED_LOCATION |
| REACHED_LOCATION | IN_PROGRESS |
| IN_PROGRESS | PENDING, COMPLETED |
| PENDING | IN_PROGRESS |

Invalid transition → 400 "Cannot transition ticket from X to Y".

If status = PENDING and pendingReason is missing → 400.

When PENDING is set: `ticket.pendingReason` and `ticket.pendingNotes` are stored.

**Side effects:** Status log created. Customer FCM notification sent (fire-and-forget).

### POST /mobile/technician/tickets/:id/complete

**Request body (`CompleteTicketDto`):**

| Field | Type | Required | Notes |
|---|---|---|---|
| customerSignature | string | Yes | URL or base64 of customer signature |
| notes | string | No | Completion notes |

**Validation:**
1. Ticket must be `IN_PROGRESS` → 400 otherwise.
2. At least one `BEFORE` image must exist → 400.
3. At least one `AFTER` image must exist → 400.

**Process:**
1. If `customerSignature` provided: create `TicketImage` with `type = SIGNATURE`.
2. Update `ticket.status = COMPLETED`.
3. Create status log.
4. Send customer FCM notification ("Work Completed").

### POST /mobile/technician/tickets/:id/pending

**Request body (`MarkPendingDto`):**

| Field | Type | Required |
|---|---|---|
| reason | PendingReason | Yes |
| notes | string | Yes |

**PendingReason values:**
- `SPARE_PARTS_NEEDED`
- `CUSTOMER_NOT_AVAILABLE`
- `ADDITIONAL_VISIT_REQUIRED`

**Validation:** Ticket must be `IN_PROGRESS` → 400 otherwise.

### POST /mobile/technician/tickets/:id/reject

**Request body (`RejectTicketDto`):**

| Field | Type | Required |
|---|---|---|
| reason | string | Yes |

**Validation:** Ticket must be in `ASSIGNED` or `ACCEPTED` → 400 otherwise.

Sets `ticket.status = NEW_TICKET`, `ticket.technicianId = null`. Ticket returns to unassigned queue.

---

## Image Upload

### POST /mobile/technician/tickets/:id/images

**Content-Type:** `multipart/form-data`

**Query parameter:**

| Param | Type | Required | Values |
|---|---|---|---|
| type | ImageType | Yes | BEFORE, AFTER, RAISED, SIGNATURE |

**Form field name:** `file` (single file)

**File validation (UploadService):**
- Allowed MIME types: `image/jpeg`, `image/png`, `image/webp`
- Max file size: 10 MB

**Cloudinary public_id pattern:**
```
fieldeaze/tenants/{tenantId}/tickets/{ticketId}/{timestamp}-{originalFilename}
```

**Response:**
```json
{
  "message": "Image uploaded successfully",
  "data": {
    "id": "...",
    "ticketId": "...",
    "imageUrl": "https://res.cloudinary.com/...",
    "type": "BEFORE"
  }
}
```

---

## Payment Collection

### POST /mobile/technician/tickets/:id/collect-payment

**Request body (`CollectPaymentDto`):**

| Field | Type | Required | Notes |
|---|---|---|---|
| amount | number | Yes | INR, minimum 1 |
| method | PaymentMethod | Yes | CASH, UPI, UPI_QR, RAZORPAY, etc. |

**Validation:**
- Ticket must be `COMPLETED` → 400.
- No existing payment for this ticket → 409 if already recorded.

**Process (single transaction):**
1. `InvoiceService.generateInvoiceData(tenantId, amount)`:
   - Reads `TenantSetting` for `gstEnabled`, `gstPercent`, `invoicePrefix`.
   - Counts existing invoices: `invoiceCount + 1` → sequence number.
   - `invoiceNumber = "{prefix}-{year}-{seq:5 digits}"` (e.g. `INV-2026-00001`).
   - Calculates `gstAmount = (subtotal * gstPercent) / 100`, `total = subtotal + gstAmount`.
2. Create `Payment`: `status = COLLECTED`, `collectedAt = now()`, `confirmedBy = technician.id`.
3. Create `Invoice` with generated data.
4. Update ticket: `status = INVOICE_GENERATED`.
5. Create status log: "Payment collected via {method}".
6. Send FCM notification to customer ("Invoice Ready").

---

## Data Models

### Attendance

| Field | Type | Notes |
|---|---|---|
| id | UUID | |
| tenantId | string | |
| technicianId | string | FK → Technician |
| checkInTime | DateTime | |
| checkInLat | float | |
| checkInLng | float | |
| checkOutTime | DateTime? | Null until checkout |
| checkOutLat | float? | |
| checkOutLng | float? | |
| date | Date | Date only (no time) |
| createdAt | DateTime | |

### Technician

| Field | Type | Default |
|---|---|---|
| id | UUID | |
| tenantId | string | |
| userId | string | Unique FK → User |
| name | string | |
| email | string? | |
| phone | string? | |
| isActive | boolean | true |
| currentLat | float? | Updated on checkin/checkout/location push |
| currentLng | float? | |
| rating | float | 0 |
| totalJobs | int | 0 |

---

## Business Rules

- One check-in per day per technician. Duplicate check-in → 409.
- Checkout requires an active check-in (no checkOutTime set) for today.
- Ticket status transitions are strictly forward-only per `TICKET_FORWARD_TRANSITIONS`.
- Both BEFORE and AFTER images must be uploaded before `complete` is allowed.
- `collect-payment` auto-generates invoice atomically in the same transaction.
- Rejecting a ticket returns it to NEW_TICKET with `technicianId = null`.
- PENDING is resumable — can go back to IN_PROGRESS.
- The `customerSignature` field in CompleteTicketDto is stored as a `TicketImage` with `type = SIGNATURE` (not a separate field on the ticket).
