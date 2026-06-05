# Admin Dashboard — Stats, Revenue & Live Activity

This document covers the FieldEaze admin dashboard API: the aggregated statistics endpoint, live activity feed, revenue queries, and cross-references to related admin features.

---

## Access Control

All endpoints documented here are under the base path `/api/private/admin/dashboard` and are protected by the `@IsAdmin` annotation. Only authenticated users with the `ADMIN` role can access them.

---

## Endpoints Overview

| Method | Endpoint | Response Type | Purpose |
|--------|----------|---------------|---------|
| GET | `/api/private/admin/dashboard/stats` | `DashboardStatsDTO` | Aggregated operational statistics |
| GET | `/api/private/admin/dashboard/live-activity` | `List<Map>` | 5 most recent service request activities |

---

## GET `/api/private/admin/dashboard/stats`

Returns a single `DashboardStatsDTO` object containing all key operational metrics for the admin dashboard. All values are **calculated at request time** — there is no caching layer.

### DashboardStatsDTO Fields

| Field | Type | Source / Calculation |
|-------|------|----------------------|
| `totalCustomers` | Integer | Count of all users with role `CUSTOMER` |
| `totalTechnicians` | Integer | Count of all users with role `TECHNICIAN` |
| `totalServiceRequests` | Integer | Count of all service request records |
| `pendingTickets` | Integer | Count of service requests with status `PENDING` |
| `completedTickets` | Integer | Count of service requests with status `COMPLETED` |
| `totalRevenue` | Double | `PaymentRepository.sumTotalRevenue()` — sum of `amount` for all payments with status `SUCCESS` |
| `monthlyRevenue` | Double | `PaymentRepository.sumRevenueAfter(monthAgo)` — sum of `amount` for `SUCCESS` payments in the last 30 days |
| `categoryWiseBookings` | List | Each entry: `{ categoryName, bookingCount }` — service requests grouped by service category |
| `revenueTrend` | List | Each entry: `{ date, revenue }` — daily revenue totals for a recent period |

### Notes on Revenue Fields

- `totalRevenue` includes all time successful payments with no date filter.
- `monthlyRevenue` uses a rolling 30-day window calculated from the current timestamp at request time (`now - 30 days`).
- Both fields return `null` (not `0.0`) if there are no matching payment records, since they rely on SQL `SUM()` which returns `NULL` on an empty result set. Callers should handle the null case.

---

## GET `/api/private/admin/dashboard/live-activity`

Returns a list of up to **5 activity objects** derived from the 5 most recently updated service requests.

### Response Structure

```json
[
  {
    "type": "BOOKING_CREATED | BOOKING_ASSIGNED | BOOKING_COMPLETED | BOOKING_UPDATED",
    "message": "Human-readable description of the activity",
    "customer": "Customer name or identifier",
    "technician": "Assigned technician name or identifier",
    "service": "Service name",
    "timestamp": "ISO 8601 datetime string"
  }
]
```

### Status-to-Activity-Type Mapping

The `type` field is derived from the service request's current `status` value:

| Service Request Status | Activity Type |
|------------------------|---------------|
| `PENDING` | `BOOKING_CREATED` |
| `ASSIGNED` | `BOOKING_ASSIGNED` |
| `COMPLETED` | `BOOKING_COMPLETED` |
| Any other status | `BOOKING_UPDATED` |

### Behaviour Details

- The query fetches the 5 most recent service requests ordered by their last update timestamp (descending).
- Each service request is mapped to a flat `Map<String, Object>` — no dedicated DTO class.
- The `message` field contains a human-readable string constructed from the request's data (e.g. customer name, service type, and status).

---

## PaymentRepository Queries Used by Dashboard

The two revenue metrics on the stats endpoint are powered by the following JPQL repository queries:

```java
// Sum of all payments with status SUCCESS — used for totalRevenue
@Query("SELECT SUM(p.amount) FROM PaymentEntity p WHERE p.status = 'SUCCESS'")
Double sumTotalRevenue();

// Sum of SUCCESS payments after a given date — used for monthlyRevenue
@Query("SELECT SUM(p.amount) FROM PaymentEntity p WHERE p.status = 'SUCCESS' AND p.paidAt >= :since")
Double sumRevenueAfter(@Param("since") LocalDateTime since);
```

The `since` parameter for `sumRevenueAfter` is supplied by the service layer as `LocalDateTime.now().minusDays(30)` at the time of each request.

---

## Related Admin Features

The dashboard endpoints are part of a broader set of admin-only APIs. The sections below list related endpoints and point to their respective documentation files.

---

### Technician Location Tracking

Live technician location data is available via two separate endpoints:

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/private/admin/live-technicians` | All location records for all technicians |
| GET | `/api/admin/technician/live-locations` | Live status map for all technicians |

See `technicians.md` for detailed location tracking documentation.

---

### Admin Customer Management

Customer administration is handled through a dedicated set of endpoints:

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/private/admin/customers` | Customer list with filters and pagination |
| GET | `/api/private/admin/customers/{id}` | Full customer profile including bookings and stats |
| PATCH | `/api/private/admin/customers/status` | Enable or disable a customer account |

See `users.md` for detailed customer management documentation.

---

### Admin Service / Category / Package / Offer CRUD

Admin-only create, update, and delete operations for the service catalogue are available under `/api/private/admin/*` paths that mirror their public read counterparts:

| Resource | Admin Base Path |
|----------|----------------|
| Services | `/api/private/admin/services` |
| Categories | `/api/private/admin/categories` |
| Packages | `/api/private/admin/packages` |
| Offers | `/api/private/admin/offers` |

See `services.md` and `packages.md` for full CRUD documentation.
