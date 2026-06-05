# Payments — Collection, Verification, Status Transitions, Schema

Payments are collected by technicians at the job site after completing work. Managers verify collected payments.

---

## Overview

No dedicated PaymentsController exists. Payment operations are in:
- `TechnicianController` → `POST /mobile/technician/tickets/:id/collect-payment`
- `ManagerController` → `GET /web/manager/payments`, `PATCH /web/manager/payments/:id/verify`
- `CustomerController` → `GET /mobile/customer/payments`

One `Payment` record per ticket (1:1 unique constraint on `ticketId`).

---

## Payment Endpoints Reference

| Method | Path | Role | Description |
|---|---|---|---|
| POST | `/mobile/technician/tickets/:id/collect-payment` | TECHNICIAN | Collect payment at job site (COMPLETED tickets only) |
| GET | `/web/manager/payments` | ADMIN/MANAGER | List all payments with filters |
| PATCH | `/web/manager/payments/:id/verify` | ADMIN/MANAGER | Verify a collected payment |
| GET | `/mobile/customer/payments` | CUSTOMER | My payment history |

---

## Collect Payment (Technician)

### POST /mobile/technician/tickets/:id/collect-payment

**Request body (`CollectPaymentDto`):**

| Field | Type | Required | Notes |
|---|---|---|---|
| amount | number | Yes | INR amount, minimum 1 |
| method | PaymentMethod | Yes | CASH, UPI, UPI_QR, RAZORPAY, CARD, NET_BANKING, WALLET |

**Validation:**
- Ticket must belong to this technician.
- Ticket status must be `COMPLETED` → 400 otherwise.
- No existing payment for this ticket → 409 if duplicate.

**Process (single transaction):**

1. `InvoiceService.generateInvoiceData(tenantId, amount)`:
   - Reads `TenantSetting.gstEnabled`, `gstPercent`, `invoicePrefix`.
   - Counts existing invoices in tenant to get sequence: `invoiceCount + 1`.
   - Builds `invoiceNumber = "{prefix}-{year}-{seq:00000}"` (e.g. `INV-2026-00001`).
   - `subtotal = amount`
   - `gstAmount = round((subtotal * gstPercent) / 100, 2)` (only if gstEnabled)
   - `total = subtotal + gstAmount`

2. Create `Payment`:
   - `status = COLLECTED`
   - `collectedAt = now()`
   - `confirmedBy = technician.id` (Technician record UUID, not User UUID)
   - `method = dto.method`
   - `amount = dto.amount`

3. Create `Invoice` with generated data.

4. Update `ticket.status = INVOICE_GENERATED`.

5. Create `TicketStatusLog` entry: notes = "Payment collected via {method}".

6. Send FCM notification to customer ("Invoice Ready").

**Response:**
```json
{ "message": "Payment collected and invoice generated successfully" }
```

---

## List Payments (Manager)

### GET /web/manager/payments

**Query params:**

| Param | Notes |
|---|---|
| status | PaymentStatus enum: PENDING, COLLECTED, VERIFIED, FAILED, REFUNDED |
| from | Filter by `collectedAt >= from` |
| to | Filter by `collectedAt <= to` |

Returns:
- `payments` — list with ticket (customer), technician info
- `totalVerified` — sum of all VERIFIED payments matching the filter

---

## Verify Payment (Manager)

### PATCH /web/manager/payments/:id/verify

**Validation:** Payment must be in `COLLECTED` status → 400 "Only COLLECTED payments can be verified".

**Process:**
1. Set `payment.status = VERIFIED`.
2. Create `TicketStatusLog` entry for the associated ticket:
   - Status: `INVOICE_GENERATED` (redundant, ticket already there — serves as audit log)
   - Notes: "Payment verified by manager"
   - `changedBy`: actorId (manager's userId)

---

## Customer Payments View

### GET /mobile/customer/payments

Returns all payments for the customer's tickets, including:
- Ticket description and service category
- Invoice number and total

---

## PaymentStatus Enum

| Status | Meaning | Set By |
|---|---|---|
| PENDING | Payment record exists but not yet collected | N/A — not used in current flow (Payment created directly as COLLECTED) |
| COLLECTED | Technician has collected payment on-site | `collect-payment` endpoint |
| VERIFIED | Manager has confirmed the collection | `verify` endpoint |
| FAILED | Payment failed (e.g. UPI failure) | Reserved, not set by current code |
| REFUNDED | Payment was refunded | Reserved, not set by current code |

Note: The current flow creates payments directly with `status = COLLECTED`. There is no intermediate PENDING state in the payment workflow — PENDING in the payments table is reserved for future online payment flows.

---

## PaymentMethod Enum

```
CASH        — Physical cash at job site
UPI         — Generic UPI transfer
UPI_QR      — Customer scans a QR code (from TenantSetting.upiQrImageUrl)
RAZORPAY    — Online payment via Razorpay SDK
CARD        — Credit/debit card
NET_BANKING — Bank transfer
WALLET      — Wallet payment
```

Currently only `CASH` and `UPI_QR` are actively used in the field. `RAZORPAY` integration is partially configured via TenantSetting fields but no Razorpay order creation endpoint exists yet.

---

## Payment Schema

**Table:** `payments`

| Field | Type | Notes |
|---|---|---|
| id | UUID | PK |
| tenantId | string | |
| ticketId | string | Unique FK → Ticket (1:1) |
| amount | Decimal(10,2) | Collected amount |
| method | PaymentMethod | |
| status | PaymentStatus | PENDING/COLLECTED/VERIFIED/FAILED/REFUNDED |
| collectedAt | DateTime? | When the technician collected |
| confirmedBy | string? | FK → Technician.id (not userId) |
| createdAt | DateTime | |
| updatedAt | DateTime | |

---

## Status Transition Diagram

```
[Ticket COMPLETED]
        |
collect-payment
        |
    COLLECTED
        |
manager verify
        |
    VERIFIED (terminal for normal flow)
```

`FAILED` and `REFUNDED` exist in the enum for future use. No automated path to them in current code.

---

## Link to Invoice

When a payment is created via `collect-payment`, an `Invoice` record is simultaneously created in the same transaction:

```
Payment (COLLECTED) ──1:1──► Invoice (auto-generated)
```

The invoice stores the payment breakdown: subtotal, gstPercent, gstAmount, total.

---

## Business Rules

1. One payment per ticket (enforced by `@unique ticketId` in Prisma schema). Duplicate collection → 409.
2. Payment can only be collected when the ticket is `COMPLETED`.
3. Manager can only verify `COLLECTED` payments. Attempting to verify a non-COLLECTED payment → 400.
4. The `confirmedBy` field stores the `Technician.id` (not `User.id`) of the technician who collected.
5. GST calculation is tenant-specific. If `gstEnabled = false`, `gstAmount = 0` and `total = subtotal`.
6. Invoice number is sequential per tenant: `{prefix}-{year}-{padded5digit sequence}`.
7. There is no refund endpoint in the current implementation.

---

## TenantSetting Payment Config

| Field | Purpose |
|---|---|
| upiId | UPI merchant address |
| upiAccountName | Display name for UPI |
| upiQrImageUrl | Cloudinary URL of UPI QR code image |
| razorpayKeyId | Razorpay API key (not yet used in current flow) |
| razorpayKeySecret | Razorpay secret (not yet used) |
| razorpayWebhookSecret | Webhook verification (not yet used) |
| upiMerchantId | UPI merchant ID (not yet used) |
| upiMerchantName | UPI merchant name (not yet used) |
