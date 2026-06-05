# Cart — Shopping Cart Management

## Overview

The Cart module provides a persistent shopping cart for authenticated users. A user has at most one active cart at any time. Cart items are price-locked at the moment of addition, and the cart survives across sessions until it is explicitly cleared or converted into a service request.

**Base path:** `/api/cart`

---

## Endpoints

### POST `/api/cart/add`

Add one or more items to the authenticated user's cart.

- The `userId` is resolved from the JWT token — callers do not pass it in the request body.
- If no cart exists for the user yet, one is created automatically (one cart per user rule).
- If the same service or package already exists in the cart the quantity is incremented rather than creating a duplicate line item.
- The unit price is captured from the service/package at the moment of addition and will not change if the service price is updated later (price-lock).

**Request body example:**

```json
{
  "serviceId": "uuid-of-service",
  "servicePackageId": null,
  "quantity": 2
}
```

---

### GET `/api/cart/`

Retrieve the authenticated user's cart together with a full financial breakdown.

Returns a `CartDTO` that includes every line item and all computed totals (subtotal, discounts, charges, tax, and grand total). See the [CartDTO](#cartdto) section for the complete field list and the [Financial Breakdown](#financial-breakdown) section for calculation logic.

---

### PUT `/api/cart/update`

Update the quantity of an existing cart item.

- The `subTotal` for the affected item is recalculated as `price × newQuantity`.
- The cart `totalAmount` is updated to reflect the new item subtotal.

**Request body example:**

```json
{
  "cartItemId": "uuid-of-cart-item",
  "quantity": 3
}
```

---

### DELETE `/api/cart/remove/{cartItemId}`

Remove a single item from the cart by its `cartItemId`.

- The cart `totalAmount` is reduced by the removed item's `subTotal`.
- The cart itself remains active; only the specified line item is deleted.

---

### DELETE `/api/cart/clear`

Remove all items from the authenticated user's cart and reset `totalAmount` to `0`.

- The cart entity itself is retained with `status = "ACTIVE"` and an empty items list.

---

## Entity Schemas

### CartEntity

**Table:** `user_cart`

| Field | Type | Relationship | Notes |
|-------|------|-------------|-------|
| id | UUID | — | Primary key, inherited from `BaseEntity` |
| user | UserEntity | ManyToOne (lazy) | The cart owner |
| items | List\<CartItemEntity\> | OneToMany (cascade ALL) | Line items in this cart |
| booking | BookingEntity | OneToOne | Populated when the cart has been converted to a booking |
| servicePackage | ServicePackageEntity | ManyToOne | Set when the cart is tied to a specific package |
| status | String | — | Always `"ACTIVE"` |
| totalAmount | double | — | Running sum of all item `subTotal` values |

---

### CartItemEntity

**Table:** `user_cart_items`

| Field | Type | Relationship | Notes |
|-------|------|-------------|-------|
| id | UUID | — | Primary key, inherited from `BaseEntity` |
| cart | CartEntity | ManyToOne | Parent cart |
| service | AppServiceEntity | ManyToOne | Populated when the item is a standalone service; `null` if a package was selected |
| servicePackage | ServicePackageEntity | ManyToOne | Populated when the item is a service package; `null` if a service was selected |
| quantity | Integer | — | Number of units |
| price | Double | — | Unit price captured at add time (price-locked) |
| subTotal | Double | — | `price × quantity`; recalculated whenever quantity changes |

---

## Cart Rules

1. **One cart per user.** A cart is created automatically on the user's first `add` call and reused for all subsequent operations.
2. **No duplicate line items.** Adding a service or package that already exists in the cart increments the existing item's quantity instead of creating a new row.
3. **Price lock.** `price` is captured from the service or package at the time the item is added. Subsequent price changes on the service do not affect existing cart items.
4. **Subtotal recalculation.** `subTotal = price × quantity`. It is recomputed every time quantity is updated.
5. **Cart total.** `totalAmount` on `CartEntity` equals the sum of all item `subTotal` values.
6. **Status is always `"ACTIVE"`.** There is no "archived" or "checked-out" state on the cart; conversion to a service request simply empties the cart.
7. **Cart persistence.** The cart and its items survive until the user explicitly calls `DELETE /clear` or converts the cart to a service request via `POST /api/service-requests/create-from-cart`.

---

## Financial Breakdown

The `GET /api/cart/` endpoint returns a `CartDTO` that includes the following computed financial fields. All monetary values are in the application's base currency.

```
subtotal            = totalAmount
                      (sum of all CartItemEntity.subTotal values)

discount            = sum of applicable offer discounts per line item
                      (calculated from active promotional offers on each service/package)

globalDiscount      = daily discount + weekly discount + monthly discount
                      (sourced from AppSettings)

discountedSubtotal  = subtotal - discount - globalDiscount

shipping            = AppSettings.shippingCharge
                      (included only when AppSettings.shippingEnabled = true, else 0)

handling            = AppSettings.handlingCharge
                      (included only when AppSettings.handlingEnabled = true, else 0)

platformFee         = AppSettings.platformFee

taxableAmount       = discountedSubtotal + shipping + handling + platformFee

taxAmount           = (taxableAmount × AppSettings.taxPercentage) / 100

grandTotal          = taxableAmount + taxAmount
```

---

## CartDTO

The response object for `GET /api/cart/`.

| Field | Type | Description |
|-------|------|-------------|
| userId | String | ID of the cart owner |
| items | List\<CartItemDTO\> | All line items with their details |
| subtotal | Double | Raw sum of item subtotals |
| discount | Double | Sum of item-level offer discounts |
| globalDiscount | Double | Site-wide discount from AppSettings |
| discountedSubtotal | Double | `subtotal - discount - globalDiscount` |
| shipping | Double | Shipping charge (0 if disabled) |
| handling | Double | Handling charge (0 if disabled) |
| platformFee | Double | Platform fee from AppSettings |
| taxableAmount | Double | Base amount subject to tax |
| taxAmount | Double | Computed tax |
| grandTotal | Double | Final amount payable |
| status | String | Always `"ACTIVE"` |

---

## Cart to Service Request Conversion

When a user is ready to book, call the service-request creation endpoint — do **not** call `DELETE /clear` separately; the conversion clears the cart automatically.

**Endpoint:** `POST /api/service-requests/create-from-cart`

**Request body:**

```json
{
  "userId": "uuid-of-user",
  "address": "123 Main Street, City",
  "preferredDate": "2024-06-15",
  "preferredTime": "10:00",
  "description": "Optional description of the issue"
}
```

**What happens internally:**

1. The user's cart is loaded and all `CartItemEntity` records are read.
2. The services (and/or packages) referenced by the cart items are extracted to populate the new `ServiceRequestEntity`.
3. Any `ServiceRequestAttachmentItemEntity` records that belong to the user and are not yet assigned to a request (`serviceRequest = null`) are automatically linked to the new service request.
4. All `CartItemEntity` rows are deleted and the cart's `totalAmount` is reset to `0`.
5. A new `ServiceRequestEntity` is returned with status `PENDING`.

---

## Repository Queries

**Interface:** `CartRepository`

```java
// Find the active cart for a user entity
Optional<CartEntity> findByUser(UserEntity user);

// Find the active cart by user ID string
Optional<CartEntity> findByUser_UserId(String userId);

// Check whether any cart references a given package
// Used to guard against deleting a package that is in an active cart
boolean existsByServicePackage_Id(String packageId);
```

The `existsByServicePackage_Id` query is called during package deletion to prevent removing a package that is currently sitting in a user's cart, preserving referential integrity.
