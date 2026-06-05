# Attendance Module — Check-in/Checkout Rules, Schema, Manager View

Daily attendance tracking for technicians. One check-in and one checkout allowed per day.

---

## Overview

Attendance is split across two modules:
- `TechnicianController` — check-in, checkout, my attendance history (mobile, TECHNICIAN role)
- `ManagerController` — view all attendance records (web, ADMIN/MANAGER role)

---

## Endpoints

### Technician (Mobile)

| Method | Path | Role | Description |
|---|---|---|---|
| POST | `/mobile/technician/attendance/checkin` | TECHNICIAN | Check in with GPS coordinates |
| POST | `/mobile/technician/attendance/checkout` | TECHNICIAN | Check out with GPS coordinates |
| GET | `/mobile/technician/attendance` | TECHNICIAN | My attendance history (last 30 records) |

### Manager (Web)

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/web/manager/attendance` | ADMIN/MANAGER | View attendance records (filterable by technician + date range) |

---

## Check-In

### POST /mobile/technician/attendance/checkin

**Request body (`CheckInDto`):**

| Field | Type | Validation |
|---|---|---|
| lat | number | -90 to 90 |
| lng | number | -180 to 180 |

**Process:**
1. Resolve technician from `userId` + `tenantId`.
2. Compute today: `new Date()` with hours set to `00:00:00.000`.
3. Query: find any existing attendance where `technicianId = tech.id AND date = today`.
4. If found → 409 "You have already checked in today".
5. Create `Attendance`:
   - `checkInTime = now()`
   - `checkInLat = dto.lat`, `checkInLng = dto.lng`
   - `date = today` (date-only field)
6. Update `technician.currentLat/Lng` in parallel.

**Response:**
```json
{
  "message": "Checked in successfully",
  "data": {
    "id": "...",
    "tenantId": "...",
    "technicianId": "...",
    "checkInTime": "2026-06-04T09:00:00.000Z",
    "checkInLat": 12.9716,
    "checkInLng": 77.5946,
    "checkOutTime": null,
    "checkOutLat": null,
    "checkOutLng": null,
    "date": "2026-06-04T00:00:00.000Z",
    "createdAt": "..."
  }
}
```

---

## Check-Out

### POST /mobile/technician/attendance/checkout

**Request body:** Same as `CheckInDto` (lat, lng).

**Process:**
1. Resolve technician.
2. Find attendance where `technicianId`, `date = today`, `checkOutTime IS NULL`.
3. Not found → 404 "No active check-in found for today".
4. Update:
   - `checkOutTime = now()`
   - `checkOutLat = dto.lat`, `checkOutLng = dto.lng`
5. Update `technician.currentLat/Lng` in parallel.

---

## My Attendance History

### GET /mobile/technician/attendance

Returns last 30 attendance records for this technician, ordered by `date` DESC.

---

## Manager Attendance View

### GET /web/manager/attendance

**Query params:**

| Param | Type | Notes |
|---|---|---|
| technicianId | string | Filter to one technician |
| from | date string | Filter `date >= from` |
| to | date string | Filter `date <= to` |

Returns up to **200 records** ordered by `date` DESC. Includes `technician.id` and `technician.name` on each record.

**Example response item:**
```json
{
  "id": "...",
  "tenantId": "...",
  "technicianId": "...",
  "checkInTime": "2026-06-04T08:55:00.000Z",
  "checkInLat": 12.9716,
  "checkInLng": 77.5946,
  "checkOutTime": "2026-06-04T18:05:00.000Z",
  "checkOutLat": 12.9750,
  "checkOutLng": 77.5960,
  "date": "2026-06-04T00:00:00.000Z",
  "technician": { "id": "...", "name": "Ravi Kumar" }
}
```

---

## Attendance Schema

**Table:** `attendance`

| Field | Type | Notes |
|---|---|---|
| id | UUID | PK |
| tenantId | string | |
| technicianId | string | FK → Technician |
| checkInTime | DateTime | Timestamp of check-in |
| checkInLat | float | GPS latitude at check-in |
| checkInLng | float | GPS longitude at check-in |
| checkOutTime | DateTime? | Null until checkout |
| checkOutLat | float? | GPS latitude at checkout |
| checkOutLng | float? | GPS longitude at checkout |
| date | Date | Date-only field (time stripped) |
| createdAt | DateTime | |

**Indexes:**
```
@@index([tenantId])
@@index([technicianId, date])
```

---

## Business Rules

1. **One check-in per day**: Enforced by querying for existing record with `date = today`. If found → 409.
2. **Checkout requires active check-in**: Must find a record for today with `checkOutTime = null`. If no open check-in → 404.
3. **GPS is required**: `lat` and `lng` are required fields with range validation.
4. **Location updated on both events**: `technician.currentLat/currentLng` is updated on both check-in and checkout.
5. **No correction endpoint**: There is no API to edit or delete an attendance record. Corrections require direct database intervention.
6. **Historical records preserved**: Records are never deleted.
7. **Dashboard integration**: `TechnicianService.getDashboard()` reads today's attendance to determine `isCheckedIn` and `checkInTime/checkOutTime`.

---

## Dashboard Attendance Fields

The technician dashboard (`GET /mobile/technician/dashboard`) includes:

| Field | Source |
|---|---|
| isCheckedIn | `!!todayAttendance && !todayAttendance.checkOutTime` |
| checkInTime | `todayAttendance?.checkInTime ?? null` |
| checkOutTime | `todayAttendance?.checkOutTime ?? null` |
