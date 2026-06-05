# Multi-Tenancy — How tenantId Flows, TenantGuard, Query Scoping

FieldEaze uses a shared database, shared schema multi-tenancy model. All tenants share the same tables. Isolation is enforced entirely at the application layer.

---

## Architecture Overview

| Aspect | Approach |
|---|---|
| Database model | Shared schema — single PostgreSQL DB, all tenants in same tables |
| Isolation mechanism | Application-layer: all queries include `WHERE tenantId = ?` |
| Tenant identity carrier | JWT `tenantId` claim (UUID string) |
| Framework enforcement | `TenantGuard` NestJS guard on every protected route |
| ORM | Prisma — no built-in multi-tenancy; filtering done manually in service code |

---

## How tenantId Gets Into the JWT

1. **Technician / Customer login**: `tenantId` UUID sent in request body → validated against DB → included in JWT payload.
2. **Admin / Manager login**: `tenantCode` slug in URL path → resolved to tenant UUID → included in JWT payload.
3. **Super Admin**: No `tenantId` in JWT (claim is absent / undefined).

### JWT Payload (`JwtPayload` TypeScript type)

```typescript
{
  sub: string;       // userId
  email: string;
  role: UserRole;
  tenantId?: string; // absent for SUPER_ADMIN
}
```

---

## TenantGuard — Request Lifecycle

`TenantGuard` (`src/common/guards/tenant.guard.ts`) runs after `JwtAuthGuard` on every non-`@Public()` route in the tenant-scoped modules.

```typescript
canActivate(context: ExecutionContext): boolean {
  // 1. Skip if @Public() decorator is present
  // 2. SUPER_ADMIN role bypasses tenantId requirement
  // 3. If user.tenantId is missing → throw ForbiddenException
  // 4. Set request.tenantId = user.tenantId (for @TenantId() decorator)
}
```

**Effect:** Every controller that uses `TenantGuard` has `request.tenantId` populated from the JWT before the handler runs.

---

## @TenantId() Decorator

`@TenantId()` is a custom parameter decorator (`src/common/decorators/current-user.decorator.ts`) that extracts `request.tenantId` set by the guard. Used in every controller handler:

```typescript
getDashboard(@TenantId() tenantId: string) {
  return this.service.getDashboard(tenantId);
}
```

---

## How Queries Are Scoped

Every Prisma query in a service includes `tenantId` in the `where` clause:

```typescript
// Always like this:
await this.prisma.ticket.findMany({
  where: { tenantId, status: filter.status }
});

// Never like this:
await this.prisma.ticket.findMany({
  where: { status: filter.status }  // Missing tenantId — cross-tenant leak risk
});
```

There is no ORM-level automatic tenant injection (no Prisma middleware or extension for this). Developers must add `tenantId` to every query manually.

---

## Module-by-Module Tenant Scoping

| Module | URL prefix | Guards Applied | tenantId Source |
|---|---|---|---|
| AdminModule | `/web/admin` | JwtAuthGuard + TenantGuard + RolesGuard | JWT |
| ManagerModule | `/web/manager` | JwtAuthGuard + TenantGuard + RolesGuard | JWT |
| CustomerModule | `/mobile/customer` | JwtAuthGuard + TenantGuard + RolesGuard | JWT |
| TechnicianModule | `/mobile/technician` | JwtAuthGuard + TenantGuard + RolesGuard | JWT |
| NotificationsModule | `/mobile/notifications` | JwtAuthGuard + TenantGuard | JWT |
| OffersModule (web) | `/web/offers` | JwtAuthGuard + TenantGuard + RolesGuard | JWT |
| OffersModule (mobile) | `/mobile/offers` | None (public endpoint) | N/A |
| AvailabilityModule | `/availability` | JwtAuthGuard + TenantGuard | JWT |
| SettingsModule | `/web/settings` | Mixed (GET is public, POST has guards) | JWT (POST only) |
| SuperAdminModule | `/web/super-admin` | JwtAuthGuard + RolesGuard (NO TenantGuard) | N/A — cross-tenant |

---

## SUPER_ADMIN vs Tenant Users

| Aspect | SUPER_ADMIN | Tenant Users |
|---|---|---|
| `tenantId` in JWT | Not present | UUID string |
| `TenantGuard` check | Bypassed (`role === SUPER_ADMIN`) | Must have tenantId |
| Query scope | Cross-tenant (platform-wide) | `WHERE tenantId = ?` |
| `tenantId` in users table | `'system'` literal string | Real tenant UUID |

---

## Tenant Provisioning

When `SuperAdminService.createTenant()` runs, it creates:
1. `Tenant` row.
2. `User` (ADMIN) row with `tenantId = tenant.id`.
3. `TenantSetting` row with `tenantId = tenant.id` (GST defaults, invoice prefix `INV`).

From this point on, all data for this tenant uses the tenant's UUID as the `tenantId` discriminator.

---

## Master Tables (No tenantId)

Some tables are platform-level and do not have `tenantId`:

| Table | Why No tenantId |
|---|---|
| `tenants` | Tenant itself |
| `subscription_plans` | Platform plans, shared |
| `subscriptions` | Has `tenantId` via FK |
| `billing` | Has `tenantId` via FK |
| `refresh_tokens` | Linked to userId, not tenant-scoped |

---

## Risk: No Automatic Filtering

There is no Prisma middleware, extension, or PostgreSQL RLS policy enforcing tenant isolation at the database level. If a developer writes a query without `tenantId`, it will silently return records from all tenants.

**Mitigations currently in place:**
- `@TenantId()` decorator makes it easy to pass tenantId to every service method.
- `TenantGuard` ensures tenantId is always set before any handler runs.
- All service methods consistently accept `tenantId` as a parameter.

**Gaps to watch:**
- Any new query added to service files must manually include `WHERE tenantId = ?`.
- The `ServicesModule` is not imported in AppModule — its routes 404. If re-enabled, tenant scoping must be verified.

---

## Indexes for Multi-Tenancy Performance

The Prisma schema defines `@@index([tenantId])` on all tenant-scoped models to ensure WHERE tenantId = ? filters are efficient:

```
@@index([tenantId])       — on tickets, users, technicians, customers, payments, invoices, etc.
@@index([tenantId, status]) — on tickets (common filter)
@@index([tenantId, customerId]) — on tickets
@@index([tenantId])       — on notifications, device_tokens, attendance, etc.
```

---

## Example Request Flow

```
POST /api/v1/mobile/technician/tickets/abc123/status
Authorization: Bearer eyJ...(JWT with tenantId = "tenant-uuid")

1. JwtAuthGuard   → verifies JWT signature, sets request.user = { sub, email, role: TECHNICIAN, tenantId }
2. TenantGuard    → reads user.tenantId, sets request.tenantId = "tenant-uuid"
3. RolesGuard     → verifies role = TECHNICIAN
4. Controller     → @TenantId() extracts "tenant-uuid", @CurrentUser() extracts userId
5. Service        → resolveTechnician(userId, tenantId) → Prisma WHERE { userId, tenantId }
6. Service        → updateTicketStatus → Prisma WHERE { id: ticketId, tenantId, technicianId }
7. All queries    → scoped to "tenant-uuid" — no cross-tenant access possible
```
