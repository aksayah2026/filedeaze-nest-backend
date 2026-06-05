# Notifications Module — In-App Notifications, FCM Push, Device Token Management

Handles in-app notification storage, FCM push delivery, device token registration, and unread counting.

---

## Overview

- Controller: `NotificationsController`
- Service: `NotificationsService`
- Base path: `/api/v1/mobile/notifications`
- Guards: `JwtAuthGuard`, `TenantGuard` (no role restriction — any authenticated user)
- Firebase Admin SDK used for FCM push delivery.

---

## API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/mobile/notifications` | Any auth user | Get my notifications (last 50) |
| GET | `/mobile/notifications/unread-count` | Any auth user | Get unread notification count |
| PATCH | `/mobile/notifications/:id/read` | Any auth user | Mark a notification as read |
| PATCH | `/mobile/notifications/read-all` | Any auth user | Mark all my notifications as read |
| POST | `/mobile/notifications/device-token` | Any auth user | Register FCM device token |
| DELETE | `/mobile/notifications/device-token/:token` | Any auth user | Unregister a device token |

---

## Endpoint Details

### GET /mobile/notifications

Returns last 50 notifications for the current user, ordered by createdAt DESC.

**No pagination.** Returns all 50 directly.

**Response:**
```json
{
  "data": [
    {
      "id": "...",
      "tenantId": "...",
      "userId": "...",
      "title": "Ticket Closed",
      "body": "Your service ticket has been closed. Please share your feedback!",
      "type": "TICKET_TICKET_CLOSED",
      "isRead": false,
      "createdAt": "2026-06-04T10:00:00.000Z"
    }
  ]
}
```

---

### GET /mobile/notifications/unread-count

Returns count of unread notifications for the current user.

**Response:**
```json
{ "data": { "count": 3 } }
```

---

### PATCH /mobile/notifications/:id/read

Marks a single notification as read (`isRead = true`). Uses `updateMany` with both `id` and `userId` filter to prevent unauthorized access.

---

### PATCH /mobile/notifications/read-all

Marks all unread notifications for this user as read.

---

### POST /mobile/notifications/device-token

Registers an FCM device token for push notifications.

**Request body (`RegisterDeviceTokenDto`):**

| Field | Type | Required | Notes |
|---|---|---|---|
| token | string | Yes | FCM registration token from device |
| platform | string | No | Default: `"ANDROID"`. Also accepts `"IOS"`, `"WEB"` |

**Logic:**
- If token already exists in `device_tokens`:
  - If the `userId` is different (device transferred to new user): update owner.
  - If same user: return existing record without change.
- If token is new: create new `DeviceToken` record.

---

### DELETE /mobile/notifications/device-token/:token

Removes a device token on logout. Validates that the token belongs to the current user → 404 if not found.

---

## Internal Notification Triggers

`NotificationsService` is injected into other modules and called internally:

### onTicketRaised(tenantId, customerId)

Notifies all ADMIN and MANAGER users of the tenant:
- Title: "New Ticket Raised"
- Body: "A customer has raised a new service ticket."
- Type: `TICKET_RAISED`

### onTicketAssigned(tenantId, technicianUserId, ticketId)

Notifies the assigned technician:
- Title: "New Ticket Assigned"
- Body: "You have been assigned a new service ticket. Ticket #{last6chars}."
- Type: `TICKET_ASSIGNED`

### onTicketStatusChanged(tenantId, customerUserId, status, ticketId)

Notifies the customer when technician updates ticket status:

| Status | Title | Body |
|---|---|---|
| ACCEPTED | Technician Accepted | "Your technician has accepted the job and will arrive soon." |
| TRAVELLING | Technician En Route | "Your technician is on the way to your location." |
| REACHED_LOCATION | Technician Arrived | "Your technician has arrived at your location." |
| IN_PROGRESS | Work Started | "The technician has started working on your ticket." |
| PENDING | Ticket On Hold | "Your ticket is temporarily on hold. The technician will update you soon." |
| COMPLETED | Work Completed | "The technician has completed the job. Please confirm and proceed with payment." |
| INVOICE_GENERATED | Invoice Ready | "Your invoice has been generated. Please check your invoices section." |
| TICKET_CLOSED | Ticket Closed | "Your service ticket has been closed. Please share your feedback!" |
| CANCELLED | Ticket Cancelled | "Your service ticket has been cancelled." |

---

## Internal Send Flow (notifyUser)

```
notifyUser(tenantId, userId, title, body, type, data?)
  1. Create Notification record in DB (always, regardless of FCM)
  2. Fetch all DeviceTokens for userId
  3. If tokens exist: call firebase.sendMulticast(tokens, title, body, data)
     - Uses sendEachForMulticast() API
     - Logs success/failure count
  4. Errors are caught and logged — notifications are fire-and-forget
```

All internal notification calls are `void` and fire-and-forget (prefixed with `void` to suppress unhandled promise warnings).

---

## Firebase FCM Integration

### Initialization

`FirebaseService` is initialized via `onModuleInit()`:
- Reads service account from `FIREBASE_SERVICE_ACCOUNT_PATH` env var (path to JSON file).
- Falls back to `admin.credential.applicationDefault()` if path not set.
- Checks `admin.apps.length === 0` to prevent double-init.

### Single Send

`sendPushNotification(token, title, body, data?)`:
- Sends to single FCM token.
- Android priority: `high`.
- APNS: `sound = 'default'`.
- Errors are caught and logged, not thrown.

### Multicast Send

`sendMulticast(tokens[], title, body, data?)`:
- Sends to multiple tokens using `sendEachForMulticast()`.
- Logs `successCount/totalCount`.
- Errors are caught and logged.

---

## Data Models

### Notification

| Field | Type | Default |
|---|---|---|
| id | UUID | PK |
| tenantId | string | |
| userId | string | FK → User |
| title | string | |
| body | string | |
| type | string | Event type string |
| isRead | boolean | false |
| createdAt | DateTime | now() |

### DeviceToken

| Field | Type | Default |
|---|---|---|
| id | UUID | PK |
| tenantId | string | |
| userId | string | FK → User |
| token | string | Unique |
| platform | string | "ANDROID" |
| createdAt | DateTime | |
| updatedAt | DateTime | |

---

## Business Rules

- A user can have multiple device tokens (multi-device support).
- Notification delivery is fire-and-forget — failures are logged but not retried.
- Notifications are always persisted to the DB before FCM is attempted. If FCM fails, the in-app notification is still visible.
- There is no batch/broadcast endpoint — each notification targets one userId.
- Notifications are never deleted from the database.
- The `type` field stores event type strings like `TICKET_RAISED`, `TICKET_ASSIGNED`, `TICKET_ACCEPTED`, etc.
- `PATCH /read-all` uses `updateMany` with `isRead = false` filter (efficient, only touches unread records).
