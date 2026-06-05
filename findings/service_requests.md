# Service Requests — Full Service Delivery Workflow

## Overview

The Service Request module is the operational core of FieldEaze. It manages the entire lifecycle from a customer submitting a job request through technician assignment, on-site work, and final confirmation. Every field service interaction is modelled as a `ServiceRequestEntity` that moves through a well-defined status pipeline.

**Base path:** `/api/service-requests`

---

## Endpoints

### Customer / Admin Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/service-requests` | Create a service request (JSON body) |
| POST | `/api/service-requests/create` | Create with file attachments (multipart/form-data) |
| POST | `/api/service-requests/create-from-cart` | Convert an active cart to a service request |
| GET | `/api/service-requests/{id}` | Fetch a single request by ID |
| GET | `/api/service-requests` | Paginated, filtered list of requests |
| GET | `/api/service-requests/user/{userId}` | All requests for a specific customer |
| GET | `/api/service-requests/view-requests` | View-optimised list (summary projections) |
| PUT | `/api/service-requests/{id}` | Update request details |
| PUT | `/api/service-requests/{id}/status` | Update the status of a request |
| DELETE | `/api/service-requests/{id}` | Soft-delete a request |
| POST | `/api/service-requests/{id}/cancel` | Cancel a request with optional remarks |

---

### Technician Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/service-requests/assign-technician` | Assign a technician with a confirmed schedule |
| GET | `/api/service-requests/technician/{technicianId}` | All visible requests for a technician |
| GET | `/api/service-requests/technician/my-requests` | Authenticated technician's own requests |
| GET | `/api/service-requests/technician/pending-requests` | Pending requests visible to a technician |
| GET | `/api/service-requests/technician/assignments` | Current assignments for a technician |
| POST | `/api/service-requests/technician/respond` | Technician accept or reject an assignment |
| POST | `/api/service-requests/accept` | Technician accepts an assignment |
| POST | `/api/service-requests/enroute` | Technician marks themselves as ON_THE_WAY |
| POST | `/api/service-requests/arrived` | Technician marks themselves as ARRIVED |
| POST | `/api/service-requests/start` | Technician marks work as IN_PROGRESS |
| POST | `/api/service-requests/complete` | Technician marks work as AWAITING_CONFIRMATION |
| PUT | `/api/service-requests/{id}/technician-status` | Update technician-side status field |
| POST | `/api/service-requests/{id}/arrived` | Mark arrived (no authentication required) |
| POST | `/api/service-requests/{id}/confirm` | Customer confirms or rejects completion |
| GET | `/api/service-requests/technician/active-request` | Currently active job for the authenticated technician |
| GET | `/api/service-requests/technician/assigned-jobs` | In-progress and assigned jobs for the technician |

---

### Availability Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/service-requests/availability` | Fetch availability slots |
| POST | `/api/service-requests/availability` | Add a new availability slot |

---

### Feedback Endpoint

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/service-requests/feedback` | Customer submits a rating and review |

---

## ServiceRequestEntity Schema

**Table:** `service_requests`

| Field | Type | Notes |
|-------|------|-------|
| id | UUID | Primary key |
| customer | UserEntity (ManyToOne) | The customer who raised the request |
| service | Set\<AppServiceEntity\> (ManyToMany) | One or more services requested |
| description | String (max 2000 chars) | Customer's description of the issue |
| address | String | Location where service is to be performed |
| preferredDate | LocalDate | Customer's preferred date |
| preferredTime | LocalTime | Customer's preferred time |
| scheduledDate | LocalDate | Admin-confirmed scheduled date |
| scheduledTime | LocalTime | Admin-confirmed scheduled time |
| scheduleDate | LocalDate | Redundant sync field kept in parity with `scheduledDate` |
| scheduleTime | LocalTime | Redundant sync field kept in parity with `scheduledTime` |
| status | String | Current lifecycle status (see Status Lifecycle) |
| adminRemarks | String | Internal notes added by admin |
| assignedTechnician | UserEntity (ManyToOne) | The technician assigned to this request |
| startedAt | LocalDateTime | Timestamp when the technician set status to IN_PROGRESS |
| completedAt | LocalDateTime | Timestamp when the technician marked the job done |
| attachments | Set\<ServiceRequestAttachmentItemEntity\> (OneToMany) | Files attached to this request |
| totalAmount | Double | Sum of the prices of all requested services |
| bookingId | String | ID of the linked `BookingEntity` (created on tech acceptance) |
| requiredSkills | List\<String\> | Skills required to fulfill this request |
| isDeleted | boolean | Soft-delete flag |
| deletedAt | LocalDateTime | Timestamp of soft deletion |
| tenantId | String | Multi-tenancy identifier |

**Helper method:**

```java
public LocalDate getBestScheduleDate() {
    return scheduledDate != null ? scheduledDate : scheduleDate;
}
```

Returns the admin-confirmed `scheduledDate` when available, falling back to `scheduleDate`.

---

## Status Lifecycle

```
PENDING  (initial state — request submitted, awaiting admin action)
  │
  │  Admin assigns technician (POST /assign-technician)
  ▼
ASSIGNED
  │
  │  Technician accepts (POST /technician/respond  accept=true)
  ▼
ACCEPTED  ──────────────────────────── BookingEntity auto-created here
  │
  │  Technician departs (POST /enroute)
  ▼
ON_THE_WAY
  │
  │  Technician arrives on site (POST /arrived)
  ▼
ARRIVED
  │
  │  Technician starts work (POST /start)
  ▼
IN_PROGRESS  (startedAt captured)
  │
  │  Technician marks job done (POST /complete)
  ▼
AWAITING_CONFIRMATION  (completedAt captured)
  │
  │  Customer confirms (POST /{id}/confirm  isCompleted=true)
  ▼
COMPLETED

Alternate paths:
  ASSIGNED  ──► REJECTED   (tech rejected via /technician/respond  accept=false)
                            System auto-searches for next available technician
                            and notifies customer

  Any status ──► CANCELLED  (customer or admin cancels via POST /{id}/cancel)
                             Push notifications sent to all parties
```

Status transitions are **one-directional** — no rollbacks are permitted with the single exception that `AWAITING_CONFIRMATION → IN_PROGRESS` is allowed when a customer rejects completion (`isCompleted = false`).

---

## Three Creation Flows

### Flow 1 — Direct JSON POST

**Endpoint:** `POST /api/service-requests`

**Request body:**

```json
{
  "customerId": "uuid-of-customer",
  "services": [
    { "id": "uuid-of-service", "serviceName": "AC Repair", "price": 500 }
  ],
  "attachments": [
    { "id": "uuid-of-attachment", "fileUrl": "/uploads/attachments/file.jpg", "fileType": "IMAGE" }
  ],
  "preferredDate": "2024-06-15",
  "preferredTime": "10:00",
  "address": "123 Main St",
  "description": "The unit is not cooling properly"
}
```

The new request is persisted with `status = PENDING`.

---

### Flow 2 — Multipart with File Uploads

**Endpoint:** `POST /api/service-requests/create`

- Content-Type: `multipart/form-data`
- Parts: a JSON request object (`requestPart`) + one or more `MultipartFile` entries.
- Uploaded files are saved to `uploads/requests/`.
- `ServiceRequestAttachmentItemEntity` records are created and linked to the new request automatically.

---

### Flow 3 — From Cart

**Endpoint:** `POST /api/service-requests/create-from-cart`

**Request body:**

```json
{
  "userId": "uuid-of-user",
  "address": "123 Main St",
  "preferredDate": "2024-06-15",
  "preferredTime": "10:00",
  "description": "Optional description"
}
```

**Processing steps:**

1. The user's cart is loaded and all `CartItemEntity` records are read.
2. Services (and/or packages) referenced in the cart items are extracted to populate the `ServiceRequestEntity.service` set.
3. Any `ServiceRequestAttachmentItemEntity` records owned by the user that are not yet assigned to a request (`serviceRequest = null`) are automatically linked to the new request.
4. All `CartItemEntity` rows are deleted and the cart's `totalAmount` is reset to `0`.
5. Exactly one `ServiceRequestEntity` is created per call, returning with `status = PENDING`.

---

## Technician Assignment Flow

### Step 1 — Admin Assigns Technician

**Endpoint:** `POST /api/service-requests/assign-technician`

**Request body:**

```json
{
  "requestId": "uuid-of-request",
  "technicianId": "uuid-of-technician",
  "scheduledDate": "2024-06-15",
  "scheduledTime": "10:00"
}
```

**Processing:**

1. Validate that the target user has `role = TECHNICIAN`.
2. Check `TechnicianAvailabilityEntity` for a slot on the requested date/time; the slot must be at least 30 minutes long.
3. Set `request.assignedTechnician`, `request.status = ASSIGNED`, and persist the confirmed `scheduledDate`/`scheduledTime`.
4. Send a push notification to the technician.

---

### Step 2a — Technician Accepts

**Endpoint:** `POST /api/service-requests/technician/respond`  (body: `{ "requestId": "...", "accept": true }`)

**Processing:**

1. Re-validate the technician's availability for the scheduled date/time.
2. Set `request.status = ACCEPTED`.
3. Auto-create a `BookingEntity` from the request details.
4. Set `request.bookingId = booking.id`.
5. Send push notifications to both the customer and the technician.

---

### Step 2b — Technician Rejects

**Endpoint:** `POST /api/service-requests/technician/respond`  (body: `{ "requestId": "...", "accept": false }`)

**Processing:**

1. Set `request.status = REJECTED` and clear `request.assignedTechnician`.
2. Automatically search for the next available technician that has an availability slot matching the same date and time.
3. Send a push notification to the customer informing them of the rejection and re-assignment attempt.

---

## Specifications Pattern

`ServiceRequestSpecifications` provides reusable JPA `Specification` predicates. Multiple predicates are chained with `.and()` to build a dynamic query.

```java
hasCustomerId(String customerId)          // WHERE customer.userId = ?
hasStatus(String status)                  // WHERE status = ?
hasTechnicianId(String technicianId)      // WHERE assignedTechnician.userId = ?
hasServiceIds(List<String> serviceIds)    // WHERE EXISTS (service.id IN (?))
isNotDeleted()                            // WHERE isDeleted = false
createdAfter(LocalDate date)              // WHERE createdAt >= ?
createdBefore(LocalDate date)             // WHERE createdAt <= ?
```

**Paginated list query parameters for `GET /api/service-requests`:**

| Parameter | Default | Description |
|-----------|---------|-------------|
| customerId | — | Filter by customer |
| status | — | Filter by status string |
| technicianId | — | Filter by assigned technician |
| serviceIds | — | Filter by one or more service IDs |
| page | `0` | Page index (zero-based) |
| size | `20` | Records per page |
| sortBy | `createdAt` | Sort field |
| direction | `desc` | Sort direction (`asc` or `desc`) |

---

## Attachment Items

### ServiceRequestAttachmentItemEntity

**Table:** `service_request_attachment_items`

| Field | Type | Notes |
|-------|------|-------|
| id | UUID | Primary key |
| fileUrl | String | Relative path, e.g. `/uploads/attachments/userId_uuid.jpg` |
| fileType | FileType enum | `IMAGE`, `VIDEO`, or `PDF` |
| description | String | Optional description of the file |
| user | UserEntity (ManyToOne) | The user who uploaded the file |
| serviceRequest | ServiceRequestEntity (ManyToOne, nullable) | `null` = unassigned; set once linked to a request |

**File type detection logic:**

- Extension `.mp4` or `.mov` → `VIDEO`
- Any other extension → `IMAGE`

**Storage path pattern:** `uploads/attachments/{userId}_{uuid}.{ext}`

---

### Attachment Endpoints

**Base path:** `/api/service-request-attachments`

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/service-request-attachments/upload` | Upload a file (multipart/form-data) |
| GET | `/api/service-request-attachments/all` | List all attachment records |
| GET | `/api/service-request-attachments/{attachmentId}` | Fetch a single attachment |
| GET | `/api/service-request-attachments/user/{userId}` | List a user's unassigned attachments |
| GET | `/api/service-request-attachments/request/{requestId}` | List all attachments for a request |
| PUT | `/api/service-request-attachments/{attachmentId}` | Update attachment metadata |
| PUT | `/api/service-request-attachments/assign-to-request?serviceRequestId=` | Bulk-assign all of a user's unassigned attachments to a request |
| DELETE | `/api/service-request-attachments/{attachmentId}` | Delete an attachment record and file |

---

## Business Rules

1. **Status is forward-only.** Status transitions follow the defined lifecycle order. Rollbacks are not permitted, except that a customer rejection (`isCompleted = false` on `POST /{id}/confirm`) reverts status from `AWAITING_CONFIRMATION` back to `IN_PROGRESS`.
2. **Availability check.** A technician must have a `TechnicianAvailabilityEntity` record for the scheduled date and time, and the slot must be at least 30 minutes long, both at assignment time and when the technician accepts.
3. **Entity validation.** The customer must exist in the database and all service IDs supplied must correspond to existing `AppServiceEntity` records.
4. **Auto-booking on acceptance.** A `BookingEntity` is automatically created when the technician accepts the assignment; no separate booking call is needed.
5. **Cancellation notifications.** Cancelling a request (via `POST /{id}/cancel`) triggers push notifications to all involved parties — customer, assigned technician (if any), and admin.
6. **Soft delete.** Deletion sets `isDeleted = true` and records `deletedAt`. Soft-deleted records are excluded from all standard list and count queries.
7. **Completion confirmation flow.** When the technician calls `POST /complete` the status becomes `AWAITING_CONFIRMATION` and `completedAt` is captured. The customer must then call `POST /{id}/confirm`.
   - `{ "isCompleted": true }` → status becomes `COMPLETED`.
   - `{ "isCompleted": false }` → status reverts to `IN_PROGRESS` for further work.
8. **One request per cart checkout.** A single call to `POST /create-from-cart` creates exactly one `ServiceRequestEntity`, regardless of how many cart items are present.

---

## Repository Custom Queries

**Interface:** `ServiceRequestRepo`

```java
// Eagerly fetch customer, attachments, and services for a single request
findFullRequestById(String id)

// Filtered list (used internally by Specifications)
findByFilters(String customerId, String status, List<String> serviceIds, ...)

// Requests assigned to a technician with a specific status
findByAssignedTechnician_UserIdAndStatus(String techId, String status)

// Requests assigned to a technician with any of several statuses
findByAssignedTechnician_UserIdAndStatusIn(String techId, List<String> statuses)

// Requests visible to a technician: excludes COMPLETED/CANCELLED, due date <= today
findVisibleRequestsForTechnician(String techId)

// The technician's currently active job: ASSIGNED but not yet COMPLETED
findActiveRequestByTechnician(String techId)

// Non-deleted requests for a given customer
findByCustomer_UserId(String userId)

// Aggregate counts used in dashboard/reporting
countByTechnicianIdAndStatus(String techId, String status)
countByTechnicianIdAndStatusIn(String techId, List<String> statuses)
countTotalAssignedByTechnicianId(String techId)
```
