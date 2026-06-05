# Email Service — SMTP, HTML Emails & Attachments

This document covers the FieldEaze email system: the public send endpoint, SMTP configuration, all `EmailService` methods, the password reset HTML email, and security considerations.

---

## Endpoint

### `POST /api/public/email/send-by-user`

> **This endpoint is PUBLIC — no authentication is required to call it.**

#### Request Body — `EmailRequestDTO`

```json
{
  "userId": "uuid",
  "subject": "string",
  "body": "string (plain text or HTML)",
  "cc": "optional@email.com",
  "serviceRequestId": "string (optional, not used in current logic)",
  "attachmentsid": []
}
```

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `userId` | UUID | Yes | Used to look up the recipient email from the database |
| `subject` | String | Yes | Email subject line |
| `body` | String | Yes | Email body — plain text or HTML |
| `cc` | String | No | Optional CC email address |
| `serviceRequestId` | String | No | Present in DTO but not used in current controller logic |
| `attachmentsid` | List | No | List of `ServiceRequestAttachmentItemEntity` — note: likely a naming error (should be `attachments`) |

> **Note:** The field name `attachmentsid` appears to be a naming error in the DTO and should arguably be named `attachments`.

#### Processing Flow

1. Look up the user by `userId` in `UserEntityRepo`.
2. If the user is not found, return `404 Not Found` with body `"User not found"`.
3. Extract `user.email` as the recipient address. The client cannot supply or override the recipient — this is intentional to prevent email injection attacks.
4. Call `EmailService.sendSimpleEmail(user.email, subject, body)`.
5. Return `200 OK` with body `"Email sent successfully to {email}"`.

---

## SMTP Configuration

The mail sender is configured via `application.properties`:

```properties
spring.mail.host=smtp.gmail.com
spring.mail.port=587
spring.mail.username=springtestmail30@gmail.com
spring.mail.password=<app_password>
spring.mail.properties.mail.smtp.auth=true
spring.mail.properties.mail.smtp.starttls.enable=true
```

| Property | Value | Notes |
|----------|-------|-------|
| Host | `smtp.gmail.com` | Google SMTP relay |
| Port | `587` | STARTTLS port |
| Username / From | `springtestmail30@gmail.com` | Hardcoded test account |
| Auth | Enabled | SMTP authentication required |
| STARTTLS | Enabled | Upgrades plain connection to TLS |

> **Important:** The `from` address is hardcoded as `springtestmail30@gmail.com` throughout the service. It is not read from a configurable property and cannot be changed per environment without modifying the source code. This appears to be a test/development account.

---

## EmailService Methods

All four methods return a `boolean`:
- `true` — email was sent successfully
- `false` — an exception occurred

Exceptions are **always caught internally and logged** — they are never propagated to the caller.

---

### 1. `sendSimpleEmail(toEmail, subject, body)`

A convenience overload. Delegates immediately to the two-argument CC variant:

```
sendSimpleEmail(toEmail, subject, body, null)
```

---

### 2. `sendSimpleEmail(toEmail, subject, body, cc[])`

Sends a **plain-text** email using `SimpleMailMessage`.

**Steps:**
1. Create a `SimpleMailMessage` instance.
2. Set `from`, `to`, `subject`, and `text` (plain text content).
3. If the `cc` array is non-null and non-empty, call `setCc(cc)`.
4. Send via `JavaMailSender`.

**Logging:**
- Success: `"Simple email sent successfully to {toEmail}"`
- Failure: `"Failed to send simple email to {email} | Error: {message}"`, returns `false`

---

### 3. `sendHtmlEmail(toEmail, subject, htmlBody)`

Sends an **HTML email** using `MimeMessage`.

**Steps:**
1. Create a `MimeMessage`.
2. Wrap with `MimeMessageHelper(isMultipart=true, charset="UTF-8")`.
3. Set `from`, `to`, and `subject`.
4. Call `helper.setText(htmlBody, isHtml=true)` — the email client renders the body as HTML.
5. Send via `JavaMailSender`.

**Logging:**
- Success: `"HTML email sent successfully to {toEmail}"`
- Failure: logged, returns `false`

**Usage:** This method is called by `AuthService.forgotPassword()` to send the password reset email.

---

### 4. `sendEmailWithAttachments(toEmail, subject, body, cc, attachments)`

Sends an HTML email with one or more file attachments. Uses a multipart `MimeMessage`.

**Steps:**
1. Create a `MimeMessage` with `multipart=true`.
2. Set `from`, `to`, `subject`, and `body` (HTML rendering enabled).
3. If `cc` is non-empty, call `setCc(cc)` — note: `cc` is a single `String`, not an array.
4. Iterate over each attachment in the list:

#### Remote URL Attachments (`http://` or `https://`)

- Open an input stream via `url.openStream()` and read **all bytes** into memory with `readAllBytes()`.
- Extract the filename from the URL path; fall back to the attachment's description field, then to the literal string `"attachment"`.
- Wrap bytes in a `ByteArrayDataSource` with MIME type `"application/octet-stream"`.
- Log: `"Added attachment from URL: {fileName}"`

> **Warning:** The entire remote file is loaded into JVM heap memory. Very large files can cause `OutOfMemoryError`.

#### Local File Path Attachments

- Create a `FileSystemResource` from the path.
- Validate that `file.exists()`. If the file does not exist, log a warning `"Attachment not found: {fileUrl}"` and skip that attachment.
- Log: `"Added local attachment: {filename}"`

#### Attachment Error Handling

- Any `IOException` thrown while processing an individual attachment is caught, logged, and skipped. The email continues to send with the remaining attachments.
- If `fileUrl` is null or empty, the attachment entry is skipped silently.

**Failure conditions:**
- A `MessagingException` or any other `Exception` during the final send step is caught, logged, and causes the method to return `false`.

---

## Password Reset Email (HTML)

The password reset flow is triggered via `AuthService.forgotPassword()`. It calls `sendHtmlEmail()` with the following content:

**Subject:** `"Password Reset Request – FieldEaze"`

**Body:** An HTML email containing two reset mechanisms:

1. **"Reset Password" button** — a clickable HTML anchor styled as a button, pointing to:
   ```
   http://192.168.1.11:8080/api/public/auth/reset-redirect?token={token}
   ```

2. **Mobile deep link** — a plain-text or linked URI for copy-paste or mobile app deep linking:
   ```
   fieldeaze://reset-password?token={token}
   ```

> **Note:** The reset URL uses a hardcoded local IP address (`192.168.1.11`). This must be updated to a public hostname or load-balanced address before production deployment.

---

## Capabilities Summary

| Feature | Supported | Notes |
|---------|-----------|-------|
| Plain text emails | Yes | Via `SimpleMailMessage` |
| HTML emails | Yes | Via `MimeMessageHelper` with `isHtml=true` |
| CC addresses | Yes | String (not array) in `sendEmailWithAttachments`; array in `sendSimpleEmail` |
| BCC | No | Not implemented |
| File attachments — local path | Yes | Validated via `FileSystemResource.exists()` |
| File attachments — remote URL | Yes | Entire file downloaded into heap memory |
| Reply-To header | No | Not set anywhere |
| Email templating engine | No | HTML is constructed as raw Java strings |
| Bulk / multi-recipient `to` | No | Single `to` address per call |
| Async sending | No | Blocks the HTTP response thread during SMTP I/O |
| Scheduling | No | Not implemented |

---

## Security Notes

| Concern | Detail |
|---------|--------|
| No authentication on endpoint | Any caller with network access can trigger emails to any registered user by supplying their `userId`. |
| Recipient always fetched from DB | The client cannot inject an arbitrary recipient email. The `to` address is always resolved via `userId` in the database, preventing direct email injection. |
| No rate limiting | The endpoint has no rate limiting. A caller can send unlimited emails to any user. |
| Remote attachment memory risk | Remote URL attachments are fully loaded into JVM heap via `readAllBytes()`. A sufficiently large file (or malicious URL) can exhaust available memory. |
| SMTP credentials in properties file | `spring.mail.username` and `spring.mail.password` are stored in `application.properties`. In production, these should be injected via environment variables or a secrets manager. |
| Hardcoded reset URL IP | The password reset link targets `192.168.1.11` — a local network address. This will not work outside the development LAN. |
