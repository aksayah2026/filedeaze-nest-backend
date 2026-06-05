# Services Module — NOT ACTIVE (404 on all /services routes)

This document explains the gap between the services-related code that exists in the codebase and what is actually reachable at runtime.

---

## Critical Finding: ServicesModule Is NOT Imported in AppModule

`src/app.module.ts` does **not** import `ServicesModule`. As a result, any routes that would be registered by a `ServicesController` (e.g. `/api/v1/services`, `/api/v1/web/services`) return **404 Not Found** at runtime.

This is confirmed by reading `app.module.ts` — it imports only:

```
AuthModule, SuperAdminModule, AdminModule, ManagerModule,
TechnicianModule, CustomerModule, NotificationsModule,
UploadModule, InvoiceModule, OffersModule, AvailabilityModule
```

No `ServicesModule`, `BookingsModule`, `CartModule`, or `PackagesModule`.

---

## What Exists in the Code

The following directories exist under `src/` but are not connected to the running application:

```
src/services/       — ServicesModule (not imported)
src/bookings/       — BookingsModule (not imported)
src/categories/     — likely part of ServicesModule
src/packages/       — PackagesModule (not imported)
```

---

## What IS Active: Service Catalog via Manager Module

The service catalog (categories, sub-categories, charges) IS implemented and working — but through the `ManagerModule`, not a dedicated ServicesModule. These routes are fully functional:

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/web/manager/service-categories` | ADMIN/MANAGER | List service categories |
| POST | `/web/manager/service-categories` | ADMIN/MANAGER | Create category |
| PATCH | `/web/manager/service-categories/:id` | ADMIN/MANAGER | Update category |
| DELETE | `/web/manager/service-categories/:id` | ADMIN/MANAGER | Deactivate category |
| GET | `/web/manager/service-sub-categories` | ADMIN/MANAGER | List sub-categories |
| POST | `/web/manager/service-sub-categories` | ADMIN/MANAGER | Create sub-category |
| PATCH | `/web/manager/service-sub-categories/:id` | ADMIN/MANAGER | Update sub-category |
| DELETE | `/web/manager/service-sub-categories/:id` | ADMIN/MANAGER | Deactivate sub-category |
| POST | `/web/manager/service-charges/:subCategoryId` | ADMIN/MANAGER | Upsert service charge |

Customers select `categoryId` + `subCategoryId` when raising a ticket.

---

## Prisma Models for Service Catalog (Active)

These models exist in `prisma/schema.prisma` and are used by the manager module:

### ServiceCategory

| Field | Type |
|---|---|
| id | UUID |
| tenantId | string |
| name | string |
| description | string? |
| imageUrl | string? |
| rating | float (default 0) |
| price | string? |
| isActive | boolean (default true) |
| isDeleted | boolean (default false) |

### ServiceSubCategory

| Field | Type |
|---|---|
| id | UUID |
| tenantId | string |
| categoryId | string |
| name | string |
| isActive | boolean (default true) |

### ServiceCharge

| Field | Type | Default |
|---|---|---|
| id | UUID | |
| tenantId | string | |
| subCategoryId | string | Unique (1:1 with sub-category) |
| serviceCharge | Decimal(10,2) | 0 |
| inspectionCharge | Decimal(10,2) | 0 |
| emergencyCharge | Decimal(10,2) | 0 |

---

## Prisma Models That Exist But Are Unused by Active Endpoints

These models are in the schema and have been seeded/available but no active controller exposes them via registered routes:

### Service

| Field | Type |
|---|---|
| id | UUID |
| tenantId | string |
| categoryId | string |
| name | string |
| description | string? |
| price | Decimal(10,2) |
| originalPrice | Decimal(10,2) |
| imageUrl | string? |
| warranty | string? |
| rating | float (default 0) |
| numberOfRatings | int (default 0) |
| totalBookings | int (default 0) |
| isPopular | boolean (default false) |
| displayOrder | int? |
| isActive | boolean (default true) |
| isDeleted | boolean (default false) |
| features | string[] |

### ServicePackage

| Field | Type |
|---|---|
| id | UUID |
| tenantId | string |
| categoryId | string |
| name | string |
| description | string? |
| price | Decimal(10,2) |
| discount | Decimal(10,2) |
| tag | string? |
| features | string[] |
| isDeleted | boolean |

### ServicePackageService (join table)

Links `ServicePackage` to `Service` (many-to-many).

---

## Intended Design (from Schema)

The full intended service catalog design visible from the schema:

```
ServiceCategory
  └── ServiceSubCategory (used by tickets)
        └── ServiceCharge (pricing for sub-category)
  └── Service (detailed service items — NOT YET CONNECTED TO TICKETS)
        └── ServicePackage (bundles of services — NOT YET CONNECTED)
  └── Offer (discount on category or service)
```

The **current working path** is: `ServiceCategory → ServiceSubCategory → Ticket`. The `Service` and `ServicePackage` models exist in the schema but are not yet integrated into the ticket creation flow.

---

## Summary

| Component | Status |
|---|---|
| ServicesModule (src/services/) | EXISTS IN CODE — NOT IMPORTED IN AppModule — all routes 404 |
| ServiceCategory / ServiceSubCategory | FULLY ACTIVE — managed via ManagerModule |
| ServiceCharge | FULLY ACTIVE — managed via ManagerModule |
| Service model (Prisma) | EXISTS — not exposed via any active endpoint |
| ServicePackage model (Prisma) | EXISTS — not exposed via any active endpoint |
| Tickets use ServiceSubCategory | YES — `subCategoryId` on Ticket model |
| Tickets use Service directly | NO |

---

## Action Items (if ServicesModule is to be enabled)

1. Import `ServicesModule` in `AppModule`.
2. Verify all service controller routes are tenant-scoped.
3. Connect `serviceId` to ticket creation if individual service selection is needed.
4. Implement plan limit check for service creation if applicable.
