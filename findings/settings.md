# Settings Module — Tenant Settings (GST, UPI, Invoice Format) and AppSettings

There are two settings models: `TenantSetting` (GST, invoicing, UPI config per tenant, managed by Admin) and `AppSettings` (platform fee, tax, discounts, managed by Admin via SettingsModule).

---

## Overview

### TenantSetting

Managed via `AdminController` at `/api/v1/web/admin/tenant-settings`. Controls GST on invoices, invoice numbering, and UPI payment details.

### AppSettings

Managed via `SettingsController` at `/api/v1/web/settings/charges`. Controls platform fee, tax percentage, shipping/handling charges, and discount toggles.

---

## TenantSetting Endpoints

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/web/admin/tenant-settings` | ADMIN | Get GST, invoice, UPI settings |
| PATCH | `/web/admin/tenant-settings` | ADMIN | Update GST, invoice, UPI settings |

### GET /web/admin/tenant-settings

Returns the `TenantSetting` record for the current tenant. Returns 404 if not yet configured (should be auto-created on tenant provisioning).

### PATCH /web/admin/tenant-settings

**Request body (`UpdateSettingsDto` in AdminModule):**

| Field | Type | Validation | Notes |
|---|---|---|---|
| gstEnabled | boolean | optional | Toggle GST on invoices |
| gstPercent | number | 0–28 | GST percentage, used when gstEnabled |
| invoicePrefix | string | optional | e.g. `"INV"`, `"ABC"` |
| invoiceNumberFormat | string | optional | e.g. `"INV-{YEAR}-{SEQ}"` |
| upiId | string | optional | UPI merchant address |
| upiAccountName | string | optional | Display name shown on UPI screen |
| upiQrImageUrl | string | optional | Cloudinary URL to UPI QR image |

Uses `upsert` — creates record if it does not exist.

---

## TenantSetting Schema

**Table:** `tenant_settings`

| Field | Type | Default |
|---|---|---|
| id | UUID | PK |
| tenantId | string | Unique |
| gstEnabled | boolean | false |
| gstPercent | Decimal(5,2) | 0 |
| invoicePrefix | string | "INV" |
| invoiceNumberFormat | string | "INV-{YEAR}-{SEQ}" |
| upiId | string? | |
| upiAccountName | string? | |
| upiQrImageUrl | string? | |
| razorpayKeyId | string? | |
| razorpayKeySecret | string? | |
| razorpayWebhookSecret | string? | |
| upiMerchantId | string? | |
| upiMerchantName | string? | |
| createdAt | DateTime | |
| updatedAt | DateTime | |

---

## AppSettings Endpoints

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/web/settings/charges` | Public (no auth) | Get current platform fee, tax, discounts |
| POST | `/web/settings/charges` | ADMIN | Create or update platform settings |

### GET /web/settings/charges

**Public endpoint** — no auth required. Uses `upsert` to auto-create settings with defaults if the record doesn't exist.

**Returns:**
```json
{
  "data": {
    "id": "...",
    "tenantId": "...",
    "shippingCharge": 50.00,
    "handlingCharge": 20.00,
    "taxPercentage": 18.00,
    "platformFee": 10.00,
    "dailyDiscount": 0.00,
    "weeklyDiscount": 0.00,
    "monthlyDiscount": 0.00,
    "shippingEnabled": false,
    "handlingEnabled": false,
    "dailyDiscountEnabled": false,
    "weeklyDiscountEnabled": false,
    "monthlyDiscountEnabled": false,
    "updatedAt": "..."
  }
}
```

### POST /web/settings/charges

**Requires `ADMIN` role.**

**Request body (`UpdateSettingsDto` in SettingsModule):**

| Field | Type | Default | Validation |
|---|---|---|---|
| shippingCharge | number | 50 | min 0 |
| handlingCharge | number | 20 | min 0 |
| taxPercentage | number | 18 | min 0, max 100 |
| platformFee | number | 10 | min 0 |
| dailyDiscount | number | 0 | min 0, max 100 |
| weeklyDiscount | number | 0 | min 0, max 100 |
| monthlyDiscount | number | 0 | min 0, max 100 |
| shippingEnabled | boolean | false | |
| handlingEnabled | boolean | false | |
| dailyDiscountEnabled | boolean | false | |
| weeklyDiscountEnabled | boolean | false | |
| monthlyDiscountEnabled | boolean | false | |

All fields are optional. Uses `upsert` semantics.

---

## AppSettings Schema

**Table:** `app_settings`

| Field | Type | Default |
|---|---|---|
| id | UUID | PK |
| tenantId | string | Unique |
| shippingCharge | Decimal(10,2) | 50 |
| handlingCharge | Decimal(10,2) | 20 |
| taxPercentage | Decimal(5,2) | 18 |
| platformFee | Decimal(10,2) | 10 |
| dailyDiscount | Decimal(5,2) | 0 |
| weeklyDiscount | Decimal(5,2) | 0 |
| monthlyDiscount | Decimal(5,2) | 0 |
| shippingEnabled | boolean | false |
| handlingEnabled | boolean | false |
| dailyDiscountEnabled | boolean | false |
| weeklyDiscountEnabled | boolean | false |
| monthlyDiscountEnabled | boolean | false |
| updatedAt | DateTime | auto-updated |

---

## How TenantSetting Flows to Invoices

When a technician collects payment, `InvoiceService.generateInvoiceData(tenantId, amount)` is called:

1. Reads `TenantSetting` for the tenant.
2. If `gstEnabled = true`: applies `gstPercent` to compute `gstAmount`.
3. `invoiceNumber = "{invoicePrefix}-{currentYear}-{5-digit-sequence}"`.
4. Invoice is created with `subtotal = amount`, `gstPercent`, `gstAmount`, `total = subtotal + gstAmount`.

**Example:** If `invoicePrefix = "FLD"`, `gstEnabled = true`, `gstPercent = 18`, and this is the 3rd invoice:
```
invoiceNumber = "FLD-2026-00003"
subtotal = 1000.00
gstPercent = 18
gstAmount = 180.00
total = 1180.00
```

---

## Business Rules

- `TenantSetting` is auto-created with defaults when a new tenant is provisioned (in `SuperAdminService.createTenant()`).
- `AppSettings` is auto-created with defaults on first `GET /web/settings/charges` call (upsert with empty update).
- Only `ADMIN` role can update settings. `MANAGER` has no settings write access.
- `GET /web/settings/charges` is public — no token required. This allows client apps to load fee config before login.
- GST is disabled by default (`gstEnabled = false`). When disabled, `gstAmount = 0` and `total = subtotal`.
- The `invoiceNumberFormat` field is stored but the actual invoice generation uses a hardcoded format: `{prefix}-{year}-{seq:00000}`. The format field may be intended for future configurable formatting.
