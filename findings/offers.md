# Offers Module — Web CRUD, Mobile Public Browse, Schema

Offers are promotional discounts tied to service categories or specific services. Admins and managers create and manage them via the web panel. Customers browse active offers via the mobile API (no auth required).

---

## Overview

- Two controllers: `WebOffersController` (CRUD for admin/manager) and `MobileOffersController` (public, active only).
- Service: `OffersService`
- Web base path: `/api/v1/web/offers`
- Mobile base path: `/api/v1/mobile/offers`

---

## API Endpoints

### Web (ADMIN / MANAGER)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/web/offers` | ADMIN/MANAGER | List all offers for this tenant |
| POST | `/web/offers` | ADMIN/MANAGER | Create a new offer |
| GET | `/web/offers/:id` | ADMIN/MANAGER | Get offer details |
| PATCH | `/web/offers/:id` | ADMIN/MANAGER | Update an offer |
| DELETE | `/web/offers/:id` | ADMIN/MANAGER | Deactivate an offer |

### Mobile (Public)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/mobile/offers` | None (@Public) | List active offers (date-filtered, no auth) |

---

## Create Offer

### POST /web/offers

**Request body (`CreateOfferDto`):**

| Field | Type | Required | Notes |
|---|---|---|---|
| title | string | Yes | Offer display name |
| description | string | No | |
| offerType | string | Yes | e.g. `"SEASONAL"`, `"FESTIVAL"`, `"REFERRAL"` (free-form string) |
| discountType | DiscountType | Yes | `PERCENTAGE` or `FLAT` |
| discountValue | number | Yes | min 0 (percentage or flat INR amount) |
| serviceId | string | No | Restrict discount to a specific service |
| categoryId | string | No | Restrict discount to a specific category |
| startDate | date string | Yes | ISO date `"2026-06-01"` |
| endDate | date string | Yes | ISO date `"2026-06-30"` |
| isRecurring | boolean | No | Default false |
| daysOfWeek | string | No | Comma-separated e.g. `"MON,WED,FRI"` (for recurring offers) |

**Response:**
```json
{
  "message": "Offer created successfully",
  "data": { ... offer with service and category included ... }
}
```

---

## Update Offer

### PATCH /web/offers/:id

**Request body (`UpdateOfferDto`):** All fields optional. Same fields as create, plus:
- `isActive` (boolean) — toggle active state.

---

## Deactivate Offer

### DELETE /web/offers/:id

Sets `isActive = false`. Soft-delete. No rows removed from database.

---

## Mobile Active Offers

### GET /mobile/offers

**No authentication required.** Returns only offers that are:
- `isActive = true`
- `startDate <= today`
- `endDate >= today`

Useful for a pre-login offers screen in the mobile app. `tenantId` must still be resolvable (comes from JWT if user is logged in, otherwise the endpoint may not filter correctly — this is a potential gap since no tenantId is passed without auth).

Includes `service` and `category` objects in each offer.

---

## Offer Schema

**Table:** `offers`

| Field | Type | Notes |
|---|---|---|
| id | UUID | PK |
| tenantId | string | |
| title | string | |
| description | string? | |
| offerType | string | Free-form type label |
| discountType | DiscountType | PERCENTAGE / FLAT |
| discountValue | Decimal(10,2) | Discount amount |
| serviceId | string? | FK → Service (nullable) |
| categoryId | string? | FK → ServiceCategory (nullable) |
| startDate | Date | Inclusive start |
| endDate | Date | Inclusive end |
| isActive | boolean | Default true |
| isRecurring | boolean | Default false |
| daysOfWeek | string? | e.g. "MON,WED,FRI" |
| createdAt | DateTime | |
| updatedAt | DateTime | |

---

## Enums

### DiscountType

| Value | Meaning |
|---|---|
| PERCENTAGE | `discountValue` is a percentage (e.g. 20 = 20% off) |
| FLAT | `discountValue` is a flat INR amount (e.g. 100 = ₹100 off) |

---

## Business Rules

1. Offers are tenant-scoped — only visible to the tenant that created them.
2. `offerType` is a free-form string (not an enum). Common values: `SEASONAL`, `FESTIVAL`, `REFERRAL`, `FLASH`.
3. Both `serviceId` and `categoryId` are optional. An offer can target all services (both null) or be scoped to a specific service or category.
4. `DELETE /web/offers/:id` is a soft-delete — sets `isActive = false`, does not remove the row.
5. Mobile API (`GET /mobile/offers`) is date-filtered: only offers where `startDate <= today <= endDate` are returned.
6. Recurring offers use the `daysOfWeek` field for day filtering — this is stored as a string but the application does not currently apply day-of-week filtering in the query. It is available for client-side use.
7. Offers are informational in the current implementation — they are not automatically applied to ticket pricing. Discount application logic would need to be implemented separately.
