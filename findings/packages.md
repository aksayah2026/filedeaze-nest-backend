# Packages & Offers

## Packages

### Overview

Packages are bundled service offerings with a defined price, discount, and feature set. They are organized under categories and can be referenced in carts and bookings.

### Base Paths

- `/api/packages` — Public and admin endpoints
- `/api/private/admin/packages` — Admin-mirrored CRUD endpoints

---

### Endpoints

#### Public Endpoints

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| GET | `/api/packages` | Public | List packages with optional filters |
| GET | `/api/packages/{id}` | Public | Get a single package by path ID or `?packageId=` query param |
| GET | `/api/packages/categories-with-packages` | Public | Hierarchical list of categories with their packages |

#### Admin Endpoints

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| POST | `/api/packages` | @IsAdmin | Create a new package |
| PUT | `/api/packages/{packageId}` | @IsAdmin | Update an existing package |
| DELETE | `/api/packages/{id}` | @IsAdmin | Soft-delete a package |

All four admin operations are also mirrored identically under `/api/private/admin/packages`.

---

### ServicePackageEntity Schema

**Table:** `service_packages`

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `id` | UUID | Primary Key, auto-generated | |
| `packageName` | String | NOT NULL, unique (case-insensitive) | Checked via `existsByPackageNameIgnoreCaseAndDeletedFalse` |
| `packagePrice` | Double | NOT NULL | List/original price |
| `packageDescription` | String | Up to 2000 characters | |
| `packageDiscount` | Double | NOT NULL | Absolute amount deducted (not a percentage) |
| `deleted` | Boolean | | Soft-delete flag |
| `tag` | String | | Categorization label, e.g. `"BASIC"`, `"PREMIUM"`, `"ENTERPRISE"` |
| `category` | CategoryEntity | ManyToOne, lazy fetch, NOT NULL | The category this package belongs to |
| `packageFeatures` | List\<String\> | `@ElementCollection` | Human-readable feature names |
| `featureServiceIds` | List\<String\> | `@ElementCollection` | Cross-references to `AppServiceEntity` IDs |
| `services` | List\<AppServiceEntity\> | OneToMany, cascade ALL | Services associated with this package |

**Final Price Calculation:**

```
finalPrice = packagePrice - packageDiscount
```

---

### Package Validations

The following validations are enforced on create and update:

| Field | Rule |
|-------|------|
| `packageName` | Required. Must be unique (case-insensitive) among non-deleted packages. |
| `packageDescription` | Required. |
| `packagePrice` | Required. Must be greater than `0`. |
| `packageDiscount` | Required. Must satisfy `0 <= discount <= packagePrice`. |
| `tag` | Required. |
| `categoryId` | Required. The referenced category must exist in the database. |
| `featureServiceIds` | Required. Must be non-empty. Every ID in the list must correspond to an existing `AppServiceEntity`. |

**Delete Constraint:**

Deletion is blocked if the package is referenced in any cart. This is checked via:

```java
CartRepository.existsByServicePackage_Id(packageId)
```

If the check returns `true`, the delete operation is rejected.

---

### GET `/api/packages` — Filter Parameters

All results are automatically filtered to `deleted = false`. Additional optional query parameters:

| Parameter | Filter Behavior |
|-----------|----------------|
| `packageName` | Case-insensitive contains match on `packageName` |
| `packageId` | Case-insensitive contains match on `id` |
| `tag` | Case-insensitive contains match on `tag` |
| `featureServiceIds` | List of service IDs — returns package if ANY of the provided IDs is present in the package's `featureServiceIds` |

---

### GET `/api/packages/categories-with-packages` — Response Shape

Returns a hierarchical view of all categories alongside their non-deleted packages.

```json
[
  {
    "categoryId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    "categoryName": "Home Appliances",
    "packages": [
      {
        "id": "1a2b3c4d-...",
        "name": "AC Service Basic",
        "price": 999,
        "discount": 100,
        "tag": "BASIC",
        "packageFeatures": [
          "Deep Cleaning",
          "Filter Replacement",
          "Gas Check"
        ]
      }
    ]
  }
]
```

---

### Repository Queries

| Method | Returns | Notes |
|--------|---------|-------|
| `findByDeletedFalse()` | `List<ServicePackageEntity>` | All active (non-deleted) packages |
| `existsByPackageNameIgnoreCaseAndDeletedFalse(String name)` | `boolean` | Used for uniqueness validation |
| `findByCategory_Id(String categoryId)` | `List<ServicePackageEntity>` | All packages in a category, including deleted |
| `findByCategory_IdAndDeletedFalse(String categoryId)` | `List<ServicePackageEntity>` | Only active packages in a category |

---

## Offers

### Overview

Offers define time-bound or recurring discounts that can be applied to specific services or entire categories. They are managed by admins and consumed by public-facing views such as Popular Services.

### Base Paths

- `/api/private/admin/offers` — Admin mutation endpoints
- `/api/public/offers` — Public read endpoints

---

### Endpoints

#### Admin Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/private/admin/offers` | Create a new offer |
| PUT | `/api/private/admin/offers/{id}` | Update an existing offer |
| DELETE | `/api/private/admin/offers/{id}` | Hard delete an offer |

#### Public Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/public/offers` | All currently active offers (date-filtered) |
| GET | `/api/public/offers/daily` | Active offers with `offerType = "DAILY"` |
| GET | `/api/public/offers/weekly` | Active offers with `offerType = "WEEKLY"` |

---

### OfferEntity Schema

**Table:** `offers`

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| `id` | UUID | Auto-generated | |
| `title` | String | | Display title of the offer |
| `description` | String | | Offer description |
| `offerType` | String | | `"DAILY"` or `"WEEKLY"` |
| `discountType` | String | | `"PERCENTAGE"` or `"FLAT"` |
| `discountValue` | Double | | The discount amount or percentage |
| `service` | AppServiceEntity | ManyToOne, lazy, nullable | Offer applies to a specific service |
| `category` | CategoryEntity | ManyToOne, lazy, nullable | Offer applies to all services in the category |
| `startDate` | LocalDate | | Start of validity window |
| `endDate` | LocalDate | | End of validity window |
| `active` | Boolean | Default `true` via `@PrePersist` | Whether the offer is enabled |
| `recurring` | Boolean | Default `false` | If `true`, offer repeats on specified days instead of a date range |
| `daysOfWeek` | String | | Comma-separated day abbreviations, e.g. `"MON,WED,FRI"` |
| `createdAt` | LocalDateTime | Auto-set in `@PrePersist` | Set to `LocalDateTime.now()` on creation |

---

### Offer Active Logic

Whether an offer is considered "active" depends on the `recurring` flag:

**Non-recurring offer:**

```
active = true
AND startDate <= today
AND endDate >= today
```

**Recurring offer:**

```
active = true
AND daysOfWeek LIKE %<DAY_ABBREVIATION>%
```

The day abbreviation is derived from the current day name's first 3 characters in uppercase.

**Day abbreviation reference:**

| Day | Abbreviation |
|-----|-------------|
| Monday | `MON` |
| Tuesday | `TUE` |
| Wednesday | `WED` |
| Thursday | `THU` |
| Friday | `FRI` |
| Saturday | `SAT` |
| Sunday | `SUN` |

---

### OfferRepository Custom Queries

```java
// Fetch DAILY or WEEKLY offers that are currently active
@Query("""
    SELECT o FROM OfferEntity o
    WHERE o.active = true
    AND (
        (o.recurring = false AND o.startDate <= :currentDate AND o.endDate >= :currentDate)
        OR
        (o.recurring = true AND o.daysOfWeek LIKE %:dayOfWeek%)
    )
    AND o.offerType = :offerType
""")
List<OfferEntity> findActiveOffersByTypeAndDate(
    String offerType,
    LocalDate currentDate,
    String dayOfWeek
);

// Fetch all active offers regardless of type
@Query("""
    SELECT o FROM OfferEntity o
    WHERE o.active = true
    AND (
        (o.recurring = false AND o.startDate <= :currentDate AND o.endDate >= :currentDate)
        OR
        (o.recurring = true AND o.daysOfWeek LIKE %:dayOfWeek%)
    )
""")
List<OfferEntity> findAllActiveOffers(LocalDate currentDate, String dayOfWeek);
```

---

### Discount Application in Popular Services

When building the Popular Services listing, the system looks up any active offer associated with a given service. The lookup checks:

1. An offer targeting the **service directly** (`offer.service.id = service.id`)
2. An offer targeting the **service's category** (`offer.category.id = service.category.id`)

Once an applicable offer is found, the discount is calculated as follows:

| `discountType` | Formula |
|---------------|---------|
| `PERCENTAGE` | `discount = service.price * offerValue / 100` |
| `FLAT` | `discount = offerValue` |
| No offer found | `discount = originalPrice - price` (uses stored price differential) |

The final price is then:

```
finalPrice = originalPrice - discount
```
