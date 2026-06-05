# Bookings — Booking Lifecycle & Reschedule

## Overview

The Bookings module manages the full lifecycle of a customer service booking — from creation through technician assignment, on-site execution, and final completion or cancellation. It also supports rescheduling with a validated request flow.

---

## Base Path

`/api/bookings`

---

## Endpoints

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| POST | `/create` | @IsAdminOrSelf | Create a new booking |
| GET | `/{id}` | Public | Get a single booking by ID |
| PUT | `/{id}/status?status=` | Public | Update the payment status of a booking |
| GET | `/user/{userId}` | Public | Get all bookings for a specific customer |
| GET | `/technician/{technicianId}` | Public | Get all bookings assigned to a technician |
| GET | `/` | Public | List all active (non-deleted) bookings |
| DELETE | `/{id}` | Public | Soft-delete / cancel a booking |
| PUT | `/{id}/reschedule` | Public | Reschedule a booking to a new date |

---

## BookingEntity Schema

**Table:** `bookings`

| Field | Type | Relationship / Constraints | Notes |
|-------|------|---------------------------|-------|
| `id` | UUID | Primary Key (from BaseEntity) | |
| `customer` | UserEntity | ManyToOne | The customer who made the booking |
| `assignedTechnician` | UserEntity | ManyToOne | The technician assigned to fulfil the booking |
| `status` | BookingStatus (enum) | | Current lifecycle status |
| `paymentStatus` | String | | `"PENDING"`, `"PAID"`, or `"FAILED"` |
| `paymentMethod` | String | Default: `"UPI"` | `"UPI"`, `"CARD"`, `"CASH"`, `"RAZORPAY"`, etc. |
| `totalAmount` | Double | | Total charge for the booking |
| `bookingDate` | LocalDateTime | | Timestamp of when the booking was created |
| `startTime` | LocalDateTime | Default: next day from creation | Scheduled service start time |
| `endTime` | LocalDateTime | | Scheduled service end time |
| `bookingItems` | List\<BookingItemEntity\> | OneToMany | Individual line items within the booking |
| `serviceAddress` | AddressEntity | ManyToOne | Location where service is to be delivered |
| `servicePackage` | ServicePackageEntity | ManyToOne | Package selected for the booking, if any |
| `isDeleted` | boolean | | Soft-delete flag |
| `deletedAt` | LocalDateTime | | Timestamp of soft deletion |
| `rescheduleReason` | String | | Reason provided when rescheduling |
| `tenantId` | String | | Multi-tenancy identifier |
| `payment` | PaymentEntity | OneToOne | Linked payment record |
| `feedback` | FeedbackEntity | OneToOne | Post-service feedback record |

---

## BookingItemEntity Schema

**Table:** `booking_items`

Each row represents one line item within a booking — typically a single service or sub-service.

| Field | Type | Relationship / Constraints | Notes |
|-------|------|---------------------------|-------|
| `id` | UUID | Primary Key (from BaseEntity) | |
| `booking` | BookingEntity | ManyToOne | Parent booking |
| `service` | AppServiceEntity | ManyToOne | The specific service in this line item |
| `servicePackage` | ServicePackageEntity | ManyToOne | Package context for the item, if applicable |
| `issueDescription` | String | | Customer-provided description of the issue |
| `quantity` | int | | Number of units for this service |
| `price` | double | | Unit price at the time of booking (price-locked) |
| `subTotal` | double | | Computed as `price × quantity` |

> **Price Lock:** The `price` field captures the service price at the moment of booking. Future price changes on `AppServiceEntity` do not affect existing booking items.

---

## BookingStatus Enum

The following statuses are defined in the `BookingStatus` enum:

| Status | Description |
|--------|-------------|
| `PENDING` | Booking has been submitted; awaiting payment or admin action |
| `ACCEPTED` | Payment confirmed; booking is accepted |
| `CONFIRMED` | Admin has confirmed the schedule |
| `ASSIGNED` | A technician has been assigned |
| `ON_THE_WAY` | Assigned technician is in transit |
| `ARRIVED` | Technician has arrived at the service address |
| `IN_PROGRESS` | Service is actively being performed |
| `AWAITING_CONFIRMATION` | Work completed; waiting for customer to confirm |
| `COMPLETED` | Customer has confirmed completion |
| `REJECTED` | Technician rejected the assignment |
| `CANCELLED` | Booking was cancelled by the user or system |

---

## Status Lifecycle

```
PENDING
  |
  | (payment confirmed)
  v
ACCEPTED
  |
  | (admin confirms schedule)
  v
CONFIRMED
  |
  | (technician arrives)
  v
ARRIVED --> IN_PROGRESS --> AWAITING_CONFIRMATION
                                    |
                                    | (customer confirms)
                                    v
                                COMPLETED

Alternate paths:
  Any stage --> REJECTED    (technician rejects assignment)
  Any stage --> CANCELLED   (user cancels booking)
```

---

## Auto-Created Booking on Technician Accept

When a technician accepts a service request, a `BookingEntity` is automatically created by the system. The newly created booking's ID is then linked back to the originating request via:

```java
request.bookingId = newBooking.id
```

This ensures traceability between the service request and the resulting booking without requiring manual admin intervention.

---

## Default Values on Booking Creation

| Field | Default |
|-------|---------|
| `paymentMethod` | `"UPI"` |
| `paymentStatus` | `"PENDING"` |
| `startTime` | Next calendar day from the time of creation (`now + 1 day`) |

---

## Soft Delete Rules

Cancelling/deleting a booking performs a soft delete rather than a hard database removal:

```java
booking.isDeleted = true
booking.deletedAt = LocalDateTime.now()
```

- All list/query endpoints automatically filter out records where `isDeleted = true`.
- Rescheduling a deleted booking is not permitted (see validation rules below).

---

## Reschedule Flow

**Endpoint:** `PUT /api/bookings/{id}/reschedule`

### Request Body — RescheduleRequestEntity

| Field | Type | Description |
|-------|------|-------------|
| `userId` | String | ID of the user requesting the reschedule |
| `packageId` | String | Package ID associated with the booking |
| `serviceId` | String | Service ID associated with the booking |
| `bookingId` | String | ID of the booking to reschedule |
| `newDate` | LocalDate | The requested new date for the booking |

### Validation Steps (in order)

1. **Booking existence** — The booking identified by `bookingId` must exist.
2. **Date not in the past** — `newDate` must be greater than or equal to today's date.
3. **Ownership check** — The booking's `customer.id` must match the provided `userId`.
4. **Package match** — The `packageId` in the request must match `booking.servicePackage.id`.
5. **Service match** — The `serviceId` in the request must match the booking's associated service ID.
6. **Not deleted** — `booking.isDeleted` must be `false`.
7. **Not cancelled** — `booking.status` must not be `CANCELLED`.

If all validations pass, the booking date is updated:

```java
booking.bookingDate = newDate.atStartOfDay()
```

---

## Repository Queries

All queries use `LEFT JOIN FETCH` on `bookingItems`, their associated `services`, and `packages` to prevent N+1 query problems.

| Method | Description | Sort Order |
|--------|-------------|------------|
| `findAllActive()` | All non-deleted bookings | — |
| `findActiveByCustomerUserId(userId)` | Non-deleted bookings for a specific customer | — |
| `findActiveByTechnicianUserId(techId)` | Non-deleted bookings assigned to a specific technician | — |
| `findUpcomingBookings(LocalDateTime now)` | Non-deleted bookings where `bookingDate >= now` | Ascending by `bookingDate` |
| `findPreviousBookings(LocalDateTime now)` | Non-deleted bookings where `bookingDate < now` | Descending by `bookingDate` |

### Example Query Pattern

```java
// Upcoming bookings — used for scheduling views
@Query("""
    SELECT b FROM BookingEntity b
    LEFT JOIN FETCH b.bookingItems bi
    LEFT JOIN FETCH bi.service
    LEFT JOIN FETCH bi.servicePackage
    WHERE b.isDeleted = false
    AND b.bookingDate >= :now
    ORDER BY b.bookingDate ASC
""")
List<BookingEntity> findUpcomingBookings(@Param("now") LocalDateTime now);
```
