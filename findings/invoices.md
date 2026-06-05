# Invoices — Auto-Generation, Schema, Number Format

Invoices are auto-generated when a technician collects payment at the job site. There is no manual invoice creation endpoint.

---

## Overview

- `InvoiceService` (`src/invoice/invoice.service.ts`) — generates invoice data (number, GST, totals).
- Called internally by `TechnicianService.collectPayment()`.
- `InvoiceModule` is imported by `TechnicianModule` as a dependency.
- No dedicated InvoiceController — invoices are read via Customer and Manager endpoints.

---

## How Invoice Generation Works

When `POST /mobile/technician/tickets/:id/collect-payment` is called:

```
TechnicianService.collectPayment()
  → InvoiceService.generateInvoiceData(tenantId, amount)
    → Read TenantSetting for gstEnabled, gstPercent, invoicePrefix
    → Count existing invoices for tenant (for sequence number)
    → Build invoiceNumber
    → Calculate subtotal, gstAmount, total
  → Create Payment (COLLECTED)
  → Create Invoice
  → Move ticket to INVOICE_GENERATED
```

Everything happens atomically in a single Prisma transaction.

---

## Invoice Number Format

```
{invoicePrefix}-{year}-{5-digit-sequence}
```

**Examples:**
- `INV-2026-00001` (first invoice, default prefix)
- `INV-2026-00025` (25th invoice)
- `FLD-2026-00001` (custom prefix "FLD")

**Sequence logic:**
```typescript
const invoiceCount = await prisma.invoice.count({ where: { tenantId } });
const year = new Date().getFullYear();
const invoiceNumber = `${prefix}-${year}-${String(invoiceCount + 1).padStart(5, '0')}`;
```

`invoiceCount + 1` is the next sequence number. Sequences are per-tenant and per-year is NOT reset (the year appears in the number but does not reset the count).

---

## GST Calculation

```typescript
const subtotal = amount;  // amount passed by technician (what customer pays)
const gstAmount = gstEnabled
  ? Math.round((subtotal * gstPercent) / 100 * 100) / 100
  : 0;
const total = Math.round((subtotal + gstAmount) * 100) / 100;
```

**If GST disabled** (default): `gstAmount = 0`, `total = subtotal`.

**If GST enabled** (e.g. 18%): `gstAmount = 0.18 × subtotal`, `total = 1.18 × subtotal`.

Rounding: two decimal places using `Math.round(x * 100) / 100`.

---

## Invoice Schema

**Table:** `invoices`

| Field | Type | Notes |
|---|---|---|
| id | UUID | PK |
| tenantId | string | |
| ticketId | string | Unique FK → Ticket (1:1) |
| paymentId | string | Unique FK → Payment (1:1) |
| invoiceNumber | string | e.g. "INV-2026-00001" |
| prefix | string | The prefix used, e.g. "INV" |
| subtotal | Decimal(10,2) | Amount before GST |
| gstPercent | Decimal(5,2) | GST percentage applied (0 if disabled) |
| gstAmount | Decimal(10,2) | GST amount in INR |
| total | Decimal(10,2) | Final total (subtotal + gstAmount) |
| pdfUrl | string? | Reserved for future PDF generation |
| generatedAt | DateTime | Auto-set to now() on creation |

---

## Invoice Read Endpoints

Invoices are returned embedded in other endpoints — no standalone invoice list endpoint exists (except via Customer):

| Endpoint | Access |
|---|---|
| `GET /mobile/customer/invoices` | Customer — their own invoices |
| `GET /mobile/customer/tickets/:id` | Customer — invoice embedded in ticket detail |
| `GET /web/manager/tickets/:id` | Manager — invoice embedded in ticket detail |

### GET /mobile/customer/invoices

Returns all invoices for this customer's tickets with:
- `ticket.description`
- `ticket.subCategory.name` + `ticket.subCategory.category.name`
- `payment.method`
- `payment.collectedAt`

---

## InvoiceData Interface (Internal)

```typescript
interface InvoiceData {
  invoiceNumber: string;
  prefix: string;
  subtotal: number;
  gstPercent: number;
  gstAmount: number;
  total: number;
}
```

---

## Business Rules

1. One invoice per ticket (enforced by `@unique ticketId` in Prisma schema).
2. Invoice is created atomically with the Payment in a single transaction.
3. Invoice is never edited after creation — no update endpoint exists.
4. `pdfUrl` field is null in current implementation — PDF generation is not yet implemented.
5. `invoicePrefix` defaults to `"INV"` and is tenant-specific (from `TenantSetting.invoicePrefix`).
6. If `TenantSetting` does not exist for a tenant, `gstEnabled = false` and `invoicePrefix = "INV"` are used as fallbacks.
7. Sequence numbers are not reset per year — they are a running count of all invoices ever generated for the tenant. Year appears in the number string but does not affect the sequence logic.
8. The `invoiceNumberFormat` field in `TenantSetting` is stored but not used in the current generation logic (hardcoded format).

---

## Example Invoice Generation

**Scenario:** 3rd invoice for a tenant with GST enabled at 18%.

```
TenantSetting: { invoicePrefix: "ABC", gstEnabled: true, gstPercent: 18 }
invoiceCount (before this one): 2
amount: 1000

invoiceNumber = "ABC-2026-00003"
subtotal = 1000.00
gstPercent = 18
gstAmount = round(1000 * 18 / 100 * 100) / 100 = 180.00
total = round((1000 + 180) * 100) / 100 = 1180.00
```

**Stored in invoices table:**
```json
{
  "invoiceNumber": "ABC-2026-00003",
  "prefix": "ABC",
  "subtotal": 1000.00,
  "gstPercent": 18.00,
  "gstAmount": 180.00,
  "total": 1180.00
}
```
