# Images Module — Cloudinary Upload Flow, Field Names, Types, Public ID Structure

Ticket images are uploaded to Cloudinary. All uploads are validated for MIME type and size before being sent.

---

## Overview

- Cloudinary service: `CloudinaryService` (`src/shared/cloudinary/cloudinary.service.ts`)
- Upload wrapper: `UploadService` (`src/upload/upload.service.ts`)
- Upload module: `UploadModule` — provides `UploadService` as an exported provider used by `CustomerModule` and `TechnicianModule`.
- No standalone `ImagesController` — image upload is integrated into `TechnicianController` and `CustomerController`.

---

## Image Upload Endpoints

| Method | Path | Role | Notes |
|---|---|---|---|
| POST | `/mobile/technician/tickets/:id/images` | TECHNICIAN | Upload BEFORE/AFTER/RAISED/SIGNATURE — single file |
| POST | `/mobile/customer/tickets` | CUSTOMER | Raise ticket with optional images — up to 5 files (field: `images`) |

---

## Technician Image Upload

### POST /mobile/technician/tickets/:id/images

**Content-Type:** `multipart/form-data`

**NestJS decorator:** `@UseInterceptors(FileInterceptor('file'))` — field name must be `file`.

**Query parameter:**

| Param | Type | Required | Values |
|---|---|---|---|
| type | ImageType | Yes | BEFORE, AFTER, RAISED, SIGNATURE |

**File validation (UploadService.validateFile):**

| Rule | Value |
|---|---|
| Allowed MIME types | `image/jpeg`, `image/png`, `image/webp` |
| Max file size | 10 MB (10 × 1024 × 1024 bytes) |

Fails with 400 if wrong type or too large.

**Process:**
1. Validate technician owns the ticket.
2. Validate file (MIME type + size).
3. Build Cloudinary `public_id` via `buildPublicId(tenantId, 'tickets/{ticketId}', file.originalname)`.
4. Upload to Cloudinary using `upload_stream` with `overwrite: true`.
5. Create `TicketImage` record in DB.

**Response:**
```json
{
  "message": "Image uploaded successfully",
  "data": {
    "id": "...",
    "ticketId": "...",
    "imageUrl": "https://res.cloudinary.com/{cloud}/image/upload/...",
    "type": "BEFORE"
  }
}
```

---

## Customer Image Upload (at ticket creation)

### POST /mobile/customer/tickets (multipart)

**NestJS decorator:** `@UseInterceptors(FilesInterceptor('images', 5))` — field name must be `images`, up to 5 files.

Images uploaded during ticket creation are all stored with `type = RAISED`.

Each image goes through the same `UploadService.uploadTicketImage()` flow.

---

## ImageType Enum

| Value | Purpose |
|---|---|
| RAISED | Uploaded by customer when raising the ticket — shows the initial problem |
| BEFORE | Uploaded by technician before starting work — documents starting condition |
| AFTER | Uploaded by technician after completing work — documents completion |
| SIGNATURE | Customer signature captured by technician at job completion |

**Business rules on types:**
- BEFORE + AFTER are both required before `complete` endpoint is accepted.
- SIGNATURE is optional but uploaded as part of `completeTicket` if `customerSignature` is provided in the request body.
- Technician can upload any ImageType via the `/images` endpoint.

---

## Cloudinary Public ID Structure

`buildPublicId(tenantId, folder, filename)` in `CloudinaryService`:

```
fieldeaze/tenants/{tenantId}/{folder}/{timestamp}-{filename_without_extension}
```

### Examples by upload context:

| Context | folder arg | Example public_id |
|---|---|---|
| Ticket image | `tickets/{ticketId}` | `fieldeaze/tenants/abc.../tickets/xyz.../1717488000000-photo` |
| Tenant logo | `logo` | `fieldeaze/tenants/abc.../logo/1717488000000-logo` |
| UPI QR | `upi-qr` | `fieldeaze/tenants/abc.../upi-qr/1717488000000-qr` |

---

## Cloudinary Configuration

Set via environment variables read in `CloudinaryService` constructor:

| Env Var | Description |
|---|---|
| `CLOUDINARY_CLOUD_NAME` | Cloud name from Cloudinary dashboard |
| `CLOUDINARY_API_KEY` | API key |
| `CLOUDINARY_API_SECRET` | API secret |

---

## Delete a File

`CloudinaryService.deleteFile(publicId)` calls `cloudinary.uploader.destroy(publicId, { resource_type: 'image' })`.

The `key` (publicId) returned by `uploadFile()` is stored in the `UploadedFile.key` field.

Note: No endpoint exists to delete ticket images via API. File deletion is used internally (e.g. if needed for cleanup).

---

## TicketImage Schema

| Field | Type | Notes |
|---|---|---|
| id | UUID | PK |
| tenantId | string | |
| ticketId | string | FK → Ticket |
| imageUrl | string | Full Cloudinary HTTPS URL |
| type | ImageType | BEFORE / AFTER / RAISED / SIGNATURE |
| createdAt | DateTime | |

---

## Additional Upload Methods in UploadService

| Method | Purpose |
|---|---|
| `uploadTicketImage(tenantId, ticketId, file)` | Upload a ticket image to `tickets/{ticketId}/` folder |
| `uploadTenantLogo(tenantId, file)` | Upload to `logo/` folder |
| `uploadUpiQr(tenantId, file)` | Upload to `upi-qr/` folder |
| `deleteFile(key)` | Delete by Cloudinary publicId |

---

## Summary of Field Names and Upload Limits

| Endpoint | Field Name | Max Files | Type Query Param |
|---|---|---|---|
| `POST /mobile/technician/tickets/:id/images` | `file` | 1 | Required (BEFORE/AFTER/RAISED/SIGNATURE) |
| `POST /mobile/customer/tickets` | `images` | 5 | N/A — always RAISED |
