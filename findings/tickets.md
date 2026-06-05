# Tickets — Full Lifecycle, Status Flow, Business Rules

Tickets are the core entity in FieldEaze. One ticket = one field service job from creation to closure.

---

## Overview

Tickets are created by customers, assigned by managers, worked by technicians, and closed by managers. The lifecycle is enforced via a forward-only status transition map.

No separate `TicketsController` exists — ticket operations are distributed across:
- `CustomerController` → raise, list, view, cancel, track
- `ManagerController` → list, view, assign, reassign, close, cancel
- `TechnicianController` → list, view, update status, complete, pending, reject, upload images, collect payment

---

## Ticket Status Flow

```
         [Customer]
             |
         NEW_TICKET
             |
         [Manager assigns]
             |
          ASSIGNED
             |
         [Technician accepts]
             |
          ACCEPTED
             |
         [Technician traveling]
             |
          TRAVELLING
             |
         [Technician arrives]
             |
        REACHED_LOCATION
             |
         [Technician starts work]
             |
          IN_PROGRESS ←──────────┐
             |                    |
     ┌───────┴───────┐            |
     |               |            |
  PENDING         COMPLETED       |
     |               |            |
     └───────────────┘            |
         (resume)             (pending resume)
                  |
         [Technician collects payment]
                  |
         INVOICE_GENERATED
                  |
         [Manager closes]
                  |
          TICKET_CLOSED

         [Any early stage] → CANCELLED
```

---

## Status Transition Table

| From Status | Allowed Next Status | Who Triggers |
|---|---|---|
| NEW_TICKET | ASSIGNED | Manager (assign endpoint) |
| ASSIGNED | ACCEPTED | Technician (status update) |
| ACCEPTED | TRAVELLING | Technician (status update) |
| TRAVELLING | REACHED_LOCATION | Technician (status update) |
| REACHED_LOCATION | IN_PROGRESS | Technician (status update) |
| IN_PROGRESS | PENDING | Technician (mark-pending endpoint) |
| IN_PROGRESS | COMPLETED | Technician (complete endpoint) |
| PENDING | IN_PROGRESS | Technician (status update endpoint) |
| COMPLETED | INVOICE_GENERATED | Technician (collect-payment endpoint — auto-transitions) |
| INVOICE_GENERATED | TICKET_CLOSED | Manager (close endpoint) |

### Special Transitions

| Transition | Who | Conditions |
|---|---|---|
| Any → CANCELLED | Manager or Customer | Manager: not COMPLETED/INVOICE_GENERATED/TICKET_CLOSED/CANCELLED. Customer: not IN_PROGRESS/COMPLETED/INVOICE_GENERATED/TICKET_CLOSED/CANCELLED |
| ASSIGNED/ACCEPTED → NEW_TICKET | Technician | Reject endpoint. Clears technicianId. |
| ASSIGNED → ASSIGNED (reassign) | Manager | Changes technicianId, keeps ASSIGNED status |

---

## Ticket Schema (Prisma Model)

| Field | Type | Notes |
|---|---|---|
| id | UUID | PK |
| tenantId | string | Tenant scope |
| customerId | string | FK → Customer |
| technicianId | string? | FK → Technician (null until assigned) |
| categoryId | string | FK → ServiceCategory |
| subCategoryId | string | FK → ServiceSubCategory |
| description | string? | Problem description |
| scheduledAt | DateTime? | Customer's preferred service time |
| status | TicketStatus | Current status |
| pendingReason | PendingReason? | Set when status = PENDING |
| pendingNotes | string? | Notes for pending reason |
| closedAt | DateTime? | Set when TICKET_CLOSED |
| createdAt | DateTime | |
| updatedAt | DateTime | |

### TicketStatus Enum

```
NEW_TICKET        — Just raised by customer
ASSIGNED          — Technician assigned by manager
ACCEPTED          — Technician has accepted the job
TRAVELLING        — Technician en route
REACHED_LOCATION  — Technician at customer site
IN_PROGRESS       — Work in progress
PENDING           — Work paused (spare parts, etc.)
COMPLETED         — Work done, awaiting payment
INVOICE_GENERATED — Payment collected, invoice created
TICKET_CLOSED     — Final state, manager closed
CANCELLED         — Cancelled by manager or customer
```

### PendingReason Enum

```
SPARE_PARTS_NEEDED
CUSTOMER_NOT_AVAILABLE
ADDITIONAL_VISIT_REQUIRED
```

---

## TicketStatusLog Schema

Every status change creates a log entry:

| Field | Type | Notes |
|---|---|---|
| id | UUID | |
| tenantId | string | |
| ticketId | string | FK → Ticket |
| status | TicketStatus | The status set |
| changedBy | string | FK → User (userId of who changed) |
| changedAt | DateTime | Timestamp |
| notes | string? | Optional notes |

Status logs are append-only and never modified. They provide a full audit trail.

---

## TicketImage Schema

| Field | Type | Notes |
|---|---|---|
| id | UUID | |
| tenantId | string | |
| ticketId | string | FK → Ticket |
| imageUrl | string | Cloudinary HTTPS URL |
| type | ImageType | BEFORE / AFTER / RAISED / SIGNATURE |
| createdAt | DateTime | |

### ImageType Usage

| Type | Uploaded By | When |
|---|---|---|
| RAISED | Customer (at ticket creation) | When raising the ticket |
| BEFORE | Technician | Before starting work — required for completion |
| AFTER | Technician | After completing work — required for completion |
| SIGNATURE | Technician | Customer signature captured at job completion |

---

## Ticket Endpoints Reference

### Customer Endpoints (mobile/customer)

| Method | Path | Description |
|---|---|---|
| POST | `/mobile/customer/tickets` | Raise ticket (multipart, up to 5 RAISED images) |
| GET | `/mobile/customer/tickets` | List my tickets |
| GET | `/mobile/customer/tickets/:id` | Full ticket detail |
| PATCH | `/mobile/customer/tickets/:id/cancel` | Cancel (blocked after IN_PROGRESS) |
| GET | `/mobile/customer/tickets/:id/track` | Live tracking (tech GPS + status history) |

### Manager Endpoints (web/manager)

| Method | Path | Description |
|---|---|---|
| GET | `/web/manager/tickets` | List all tickets (filterable) |
| GET | `/web/manager/tickets/:id` | Full ticket detail |
| PATCH | `/web/manager/tickets/:id/assign` | Assign technician (NEW_TICKET only) |
| PATCH | `/web/manager/tickets/:id/reassign` | Reassign (ASSIGNED or ACCEPTED only) |
| PATCH | `/web/manager/tickets/:id/close` | Close (INVOICE_GENERATED only) |
| PATCH | `/web/manager/tickets/:id/cancel` | Cancel (blocked for COMPLETED and beyond) |

### Technician Endpoints (mobile/technician)

| Method | Path | Description |
|---|---|---|
| GET | `/mobile/technician/tickets` | List my assigned tickets |
| GET | `/mobile/technician/tickets/:id` | Full ticket detail |
| PATCH | `/mobile/technician/tickets/:id/status` | Update status (forward-only per TICKET_FORWARD_TRANSITIONS) |
| POST | `/mobile/technician/tickets/:id/complete` | Complete (requires BEFORE + AFTER images) |
| POST | `/mobile/technician/tickets/:id/pending` | Mark PENDING with reason |
| POST | `/mobile/technician/tickets/:id/reject` | Reject → back to NEW_TICKET |
| POST | `/mobile/technician/tickets/:id/images` | Upload BEFORE/AFTER/RAISED/SIGNATURE image |
| POST | `/mobile/technician/tickets/:id/collect-payment` | Collect payment (COMPLETED only) → INVOICE_GENERATED |

---

## Business Rules

1. **Forward-only transitions**: The `TICKET_FORWARD_TRANSITIONS` constant defines the only valid next states from each status. Any attempt to skip a step or go backward is rejected with 400 (except PENDING→IN_PROGRESS which is allowed).

2. **Completion requires photos**: Both at least one BEFORE and at least one AFTER image must be uploaded before `complete` is accepted.

3. **Customer cancellation window**: Customers can cancel up to and including `REACHED_LOCATION`. Once `IN_PROGRESS` is reached, only managers can cancel.

4. **Manager cancellation window**: Managers can cancel up to and including `ACCEPTED`. Cannot cancel `COMPLETED`, `INVOICE_GENERATED`, `TICKET_CLOSED`, or `CANCELLED`.

5. **Payment locks the ticket**: Once `collect-payment` is called → `INVOICE_GENERATED`. Only a manager can move it to `TICKET_CLOSED`.

6. **Rejection**: Technician can reject in ASSIGNED or ACCEPTED state. The ticket returns to NEW_TICKET with `technicianId = null`.

7. **Reassignment**: Manager can reassign in ASSIGNED or ACCEPTED state. Sets new technicianId and resets to ASSIGNED status.

8. **Plan limit**: `ticketLimit` from the subscription plan is enforced on ticket creation. Exceeding it blocks new tickets.

9. **FCM notifications**: Every status change notifies the customer (and assignment notifies the technician) via FCM, fire-and-forget.

10. **tenantId scoping**: All ticket queries include `WHERE tenantId = ?`. Cross-tenant ticket access is impossible.

---

## Ticket Filter Options (Manager)

`GET /web/manager/tickets` accepts:
- `status` — TicketStatus enum value
- `technicianId` — filter to one technician
- `customerId` — filter to one customer
- `from` / `to` — date range on `createdAt`

---

## Notification Events per Status

| Status Change | Notification Recipient | Trigger |
|---|---|---|
| NEW_TICKET created | All ADMIN + MANAGER users | customer.raiseTicket() |
| ASSIGNED | Assigned technician | manager.assignTechnician() |
| ACCEPTED through TICKET_CLOSED | Customer | technician.updateTicketStatus(), completeTicket(), collectPayment(), manager.closeTicket() |
| CANCELLED | Customer | manager.cancelTicket() |
