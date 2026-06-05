# Feedback Module — Submission Rules, Schema, Manager View

Customers submit a rating (1–5) and optional review after a ticket is closed. Managers can view all feedback for their tenant.

---

## Overview

Feedback is tied to a ticket (1:1 unique constraint). Submission is only allowed after the ticket reaches `TICKET_CLOSED` status. There is no dedicated FeedbackController — feedback is handled by:

- `CustomerController` — `POST /mobile/customer/feedback`, `GET /mobile/customer/feedback`
- `ManagerController` — `GET /web/manager/feedback`

---

## Endpoints

| Method | Path | Role | Description |
|---|---|---|---|
| POST | `/mobile/customer/feedback` | CUSTOMER | Submit feedback for a TICKET_CLOSED ticket |
| GET | `/mobile/customer/feedback` | CUSTOMER | List my submitted feedback |
| GET | `/web/manager/feedback` | ADMIN/MANAGER | View all tenant feedback |

---

## Submit Feedback

### POST /mobile/customer/feedback

**Request body (`SubmitFeedbackDto`):**

| Field | Type | Required | Validation |
|---|---|---|---|
| ticketId | string | Yes | Must be customer's own ticket |
| rating | integer | Yes | 1 to 5 (min 1, max 5) |
| review | string | No | Optional text review |

**Process:**
1. Resolve customer from JWT userId.
2. Find ticket by `ticketId` where `tenantId` and `customerId` match → 404 if not found.
3. Validate ticket `status === TICKET_CLOSED` → 400 "Feedback can only be submitted after the ticket is closed".
4. Check for existing feedback for this ticket → 409 "You have already submitted feedback for this ticket".
5. Create `Feedback` record.

**Response:**
```json
{
  "message": "Feedback submitted successfully",
  "data": {
    "id": "...",
    "tenantId": "...",
    "ticketId": "...",
    "customerId": "...",
    "rating": 5,
    "review": "Excellent work!",
    "createdAt": "2026-06-04T10:00:00.000Z"
  }
}
```

---

## Get My Feedback (Customer)

### GET /mobile/customer/feedback

Returns all feedback submitted by this customer, including the associated ticket's subCategory and category. Ordered by createdAt DESC.

**Response includes:**
- All `Feedback` fields
- `ticket.subCategory.name` and `ticket.subCategory.category.name`

---

## View Feedback (Manager)

### GET /web/manager/feedback

**Query params:**

| Param | Notes |
|---|---|
| from | Filter by `createdAt >= from` |
| to | Filter by `createdAt <= to` |

Returns all feedback for the tenant with:
- `customer.name`
- `ticket.subCategory.name` with `category.name`
- `ticket.technician.name`

Ordered by createdAt DESC.

**Sample response item:**
```json
{
  "id": "...",
  "tenantId": "...",
  "ticketId": "...",
  "customerId": "...",
  "rating": 4,
  "review": "Good service, arrived a bit late.",
  "createdAt": "2026-06-04T11:00:00.000Z",
  "customer": { "name": "Jane Doe" },
  "ticket": {
    "subCategory": {
      "name": "Fan Repair",
      "category": { "name": "Electrical" }
    },
    "technician": { "name": "Ravi Kumar" }
  }
}
```

---

## Feedback Schema

**Table:** `feedback`

| Field | Type | Notes |
|---|---|---|
| id | UUID | PK |
| tenantId | string | |
| ticketId | string | Unique FK → Ticket (1:1) |
| customerId | string | FK → Customer |
| rating | int | 1 to 5 |
| review | string? | Optional review text |
| createdAt | DateTime | |

Unique constraint: `ticketId` — one feedback per ticket, enforced at the database level.

---

## Business Rules

1. **Status gate**: Feedback can only be submitted after the ticket status is `TICKET_CLOSED`. Attempting to submit on any other status → 400.
2. **One-per-ticket**: Only one feedback per ticket. Duplicate submission → 409.
3. **Ownership**: Customer can only submit feedback for their own tickets. Cross-tenant or cross-customer submission is blocked by the query filter.
4. **No edit/delete**: There is no endpoint to update or delete feedback after submission.
5. **Rating range**: Integer 1–5. Validated via `@Min(1)` and `@Max(5)` on the DTO.
6. **Review is optional**: Only `ticketId` and `rating` are required.

---

## Relationship to Technician Rating

The `Technician` model has `rating` (float) and `totalJobs` (int) fields. However, there is no automatic logic to update `technician.rating` when feedback is submitted. These fields exist for future use or manual seeding. The `feedback` table is the source of truth for actual ratings submitted.
