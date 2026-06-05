# FieldEaze NestJS Backend — Platform Overview

SaaS field service management platform. Connects customers who need home/field services with technicians who deliver them. A single backend hosts multiple business tenants, each with their own admin, managers, technicians, and customers.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js (NestJS framework) |
| Language | TypeScript (strict) |
| Database | PostgreSQL via Prisma ORM |
| Auth | JWT HS256 — 15m access token / 7d refresh token |
| File Storage | Cloudinary |
| Push Notifications | Firebase Admin SDK (FCM) |
| Email | Resend |
| Rate Limiting | @nestjs/throttler (120 req/min global; tighter per auth route) |
| Security | Helmet, CORS, global ValidationPipe (whitelist + forbidNonWhitelisted) |
| API Docs | Swagger/OpenAPI at `/api/docs` (non-production only) |

---

## Global API Prefix

All endpoints are prefixed with `/api/v1`.

Example: `POST /api/v1/auth/customer/register`

---

## Response Format

A global `ResponseInterceptor` wraps all successful responses:

```json
{
  "success": true,
  "data": { ... },
  "message": "Optional human-readable string"
}
```

A `GlobalExceptionFilter` wraps errors:

```json
{
  "success": false,
  "statusCode": 400,
  "message": "Validation error details",
  "timestamp": "2026-06-04T10:00:00.000Z",
  "path": "/api/v1/..."
}
```

---

## User Roles

| Role | Scope | Login Method |
|---|---|---|
| SUPER_ADMIN | Platform-wide, no tenantId | `POST /auth/super-admin/login` |
| ADMIN | Tenant-scoped, created by super admin | `POST /auth/tenant/:tenantCode/login` |
| MANAGER | Tenant-scoped, created by admin | `POST /auth/tenant/:tenantCode/login` |
| TECHNICIAN | Tenant-scoped, created by manager | `POST /auth/technician/login` |
| CUSTOMER | Tenant-scoped, self-registers | `POST /auth/customer/register` |

---

## URL Namespace Convention

| Prefix | Intended For |
|---|---|
| `/api/v1/auth/...` | All authentication flows |
| `/api/v1/web/super-admin/...` | Super admin only |
| `/api/v1/web/admin/...` | Admin role |
| `/api/v1/web/manager/...` | Admin + Manager roles |
| `/api/v1/web/offers/...` | Admin + Manager offer management |
| `/api/v1/web/settings/...` | Admin platform settings |
| `/api/v1/mobile/customer/...` | Customer mobile app |
| `/api/v1/mobile/technician/...` | Technician mobile app |
| `/api/v1/mobile/notifications/...` | In-app notifications (all mobile users) |
| `/api/v1/mobile/offers/...` | Public active offers (no auth needed) |
| `/api/v1/availability/...` | Technician availability slots |

---

## Modules Registered in AppModule

```
AuthModule, SuperAdminModule, AdminModule, ManagerModule,
TechnicianModule, CustomerModule, NotificationsModule,
UploadModule, InvoiceModule, OffersModule, AvailabilityModule,
PrismaModule, SharedModule
```

> NOTE: `ServicesModule`, `BookingsModule`, `CartModule`, `PackagesModule` are NOT imported in AppModule. Routes under `/services`, `/bookings`, `/cart`, `/packages` return 404. See `findings/services.md`.

---

## Core Data Flow

```
Customer registers (self) or is created by admin
        |
Customer raises a ticket (NEW_TICKET) — optionally uploads RAISED images
        |
Manager/Admin assigns a technician → status: ASSIGNED
        |
Technician accepts → ACCEPTED → TRAVELLING → REACHED_LOCATION → IN_PROGRESS
        |
Technician uploads BEFORE photos, does the work, uploads AFTER photos
        |
Technician completes ticket (customerSignature required) → COMPLETED
        |
Technician collects payment (CASH or UPI_QR) → Payment COLLECTED + Invoice auto-generated → INVOICE_GENERATED
        |
Manager verifies payment → Payment VERIFIED
        |
Manager closes ticket → TICKET_CLOSED
        |
Customer submits feedback (rating 1–5, optional review)
```

---

## Project Directory Structure

```
src/
  auth/               JWT auth, all login/register/forgot-password flows
  super-admin/        Tenant CRUD, plan management, subscriptions, billing, audit logs
  admin/              Company settings, tenant settings, manager CRUD, revenue/ticket reports
  manager/            Technician CRUD, service catalog, ticket management, attendance, payments, feedback
  customer/           Profile, tickets, addresses, invoices, payments, feedback (mobile)
  technician/         Attendance check-in/out, location update, ticket lifecycle, image upload, payment collection (mobile)
  notifications/      In-app notifications + FCM device token management
  offers/             Web offer CRUD (admin/manager) + public active offers (mobile)
  invoice/            Invoice number generation service (called internally)
  settings/           AppSettings (platform fee, tax, discount toggles)
  availability/       TechnicianAvailability slots
  upload/             Cloudinary upload wrapper (ticket images, logos, UPI QR)
  shared/
    cloudinary/       CloudinaryService — upload/delete files, buildPublicId
    firebase/         FirebaseService — FCM single + multicast push
    resend/           ResendService — transactional email
    plan-limit/       PlanLimitService — enforces subscription plan limits
  common/
    decorators/       @CurrentUser, @TenantId, @Roles, @Public
    guards/           JwtAuthGuard, RolesGuard, TenantGuard
    filters/          GlobalExceptionFilter
    interceptors/     ResponseInterceptor, LoggingInterceptor
    constants/        TICKET_FORWARD_TRANSITIONS map, roles constant
    pipes/            ParseUUIDPipe
  prisma/             PrismaService
  config/             app.config, jwt.config, cloudinary.config
  main.ts             Bootstrap — helmet, CORS, global prefix, swagger, port 3000
prisma/
  schema.prisma       All model definitions + enums
```

---

## Database Schema — Model Summary

| Model | Purpose |
|---|---|
| Tenant | Registered business. Has tenantCode (unique slug for login URL). |
| SubscriptionPlan | Platform plans (STARTER/PROFESSIONAL/ENTERPRISE) with limits. |
| Subscription | Links tenant to a plan with start/end date. |
| Billing | Billing records per subscription. |
| User | All user accounts. Discriminated by `role` enum. |
| Customer | Customer profile linked 1:1 to User. |
| Address | Multiple saved addresses per user (unique per label). |
| Technician | Technician profile linked 1:1 to User. Stores live GPS. |
| TechnicianAvailability | Date+time slots for scheduling. |
| TechnicianLocation | GPS history log (updated on each location push). |
| Attendance | Daily check-in/check-out record per technician. |
| ServiceCategory | Top-level service grouping (e.g. Electrical, Plumbing). |
| ServiceSubCategory | Sub-grouping under category (e.g. Fan Repair). |
| ServiceCharge | Charges for a sub-category (service/inspection/emergency fee). |
| Ticket | Core entity. One ticket = one service job. |
| TicketImage | Photos attached to a ticket (BEFORE/AFTER/RAISED/SIGNATURE). |
| TicketStatusLog | Audit trail of every status change, who changed it, when. |
| Payment | One payment record per ticket (1:1). |
| Invoice | One invoice per ticket (1:1), auto-generated on payment collection. |
| Feedback | One feedback per ticket (1:1), submitted by customer after TICKET_CLOSED. |
| Notification | In-app notification records. |
| AppSettings | Platform fee, tax, discount toggles per tenant. |
| TenantSetting | GST, invoice format, UPI/Razorpay config per tenant. |
| AuditLog | Generic action audit trail per tenant. |
| DeviceToken | FCM device tokens for push notifications. |
| RefreshToken | Stored JWT refresh tokens for token rotation. |

---

## Key Enums

| Enum | Values |
|---|---|
| TenantStatus | ACTIVE, SUSPENDED, EXPIRED |
| PlanName | STARTER, PROFESSIONAL, ENTERPRISE |
| SubscriptionStatus | ACTIVE, EXPIRED, CANCELLED |
| BillingStatus | PENDING, PAID, FAILED |
| UserRole | SUPER_ADMIN, ADMIN, MANAGER, TECHNICIAN, CUSTOMER |
| TicketStatus | NEW_TICKET, ASSIGNED, ACCEPTED, TRAVELLING, REACHED_LOCATION, IN_PROGRESS, PENDING, COMPLETED, INVOICE_GENERATED, TICKET_CLOSED, CANCELLED |
| ImageType | BEFORE, AFTER, RAISED, SIGNATURE |
| PaymentMethod | CASH, UPI, UPI_QR, RAZORPAY, CARD, NET_BANKING, WALLET |
| PaymentStatus | PENDING, COLLECTED, VERIFIED, FAILED, REFUNDED |
| PendingReason | SPARE_PARTS_NEEDED, CUSTOMER_NOT_AVAILABLE, ADDITIONAL_VISIT_REQUIRED |
| DiscountType | PERCENTAGE, FLAT |

---

## Security Notes

- Passwords hashed with bcrypt (10 salt rounds).
- JWT secret for access tokens: `JWT_SECRET` env var. Refresh token uses a separate `JWT_REFRESH_SECRET`.
- Super admin has `tenantId = 'system'` in the `users` table (no actual tenant row).
- `TenantGuard` blocks requests where JWT has no `tenantId` (except SUPER_ADMIN).
- Rate limits: 5/min on super admin login, 3/min on forgot-password, 10/min on other logins.
- Swagger is disabled in production (`NODE_ENV=production`).
