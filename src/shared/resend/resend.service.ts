import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { Transporter } from 'nodemailer';

@Injectable()
export class ResendService {
  private readonly transporter: Transporter;
  private readonly from: string;
  private readonly logger = new Logger(ResendService.name);

  constructor(config: ConfigService) {
    const user = config.get<string>('GMAIL_USER');
    const pass = config.get<string>('GMAIL_APP_PASSWORD');

    this.from = `FieldEaze <${user}>`;

    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass },
    });
  }

  async sendEmail(to: string | string[], subject: string, html: string): Promise<void> {
    const recipients = Array.isArray(to) ? to.join(', ') : to;
    try {
      const info = await this.transporter.sendMail({
        from: this.from,
        to: recipients,
        subject,
        html,
      });
      this.logger.log(`Email sent to ${recipients} — messageId: ${info.messageId}`);
    } catch (error) {
      this.logger.error(`Email failed to ${recipients}: ${(error as Error).message}`);
      throw new InternalServerErrorException('Failed to send email. Please try again.');
    }
  }

  async sendOtpEmail(email: string, name: string, otp: string): Promise<void> {
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Verify Your Email Address</title>
  <style>
    body { margin: 0; padding: 0; background-color: #f4f6f9; font-family: 'Segoe UI', Arial, sans-serif; }
    .wrapper { max-width: 560px; margin: 40px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08); }
    .header { background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%); padding: 36px 40px; text-align: center; }
    .header h1 { margin: 0; color: #ffffff; font-size: 26px; font-weight: 700; letter-spacing: -0.5px; }
    .header p  { margin: 6px 0 0; color: rgba(255,255,255,0.85); font-size: 14px; }
    .body { padding: 36px 40px; }
    .greeting { font-size: 16px; color: #374151; margin: 0 0 16px; }
    .message  { font-size: 15px; color: #6B7280; line-height: 1.6; margin: 0 0 28px; }
    .otp-box  { background: #F3F4F6; border: 2px dashed #4F46E5; border-radius: 10px; padding: 24px; text-align: center; margin: 0 0 28px; }
    .otp-label { font-size: 12px; font-weight: 600; color: #6B7280; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 10px; }
    .otp-code  { font-size: 42px; font-weight: 800; color: #4F46E5; letter-spacing: 10px; margin: 0; font-family: 'Courier New', monospace; }
    .expiry    { font-size: 13px; color: #9CA3AF; margin: 10px 0 0; }
    .divider   { border: none; border-top: 1px solid #E5E7EB; margin: 28px 0; }
    .note      { font-size: 13px; color: #9CA3AF; line-height: 1.6; margin: 0; }
    .footer    { background: #F9FAFB; padding: 20px 40px; text-align: center; border-top: 1px solid #E5E7EB; }
    .footer p  { margin: 0; font-size: 12px; color: #9CA3AF; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <h1>FieldEaze</h1>
      <p>Email Verification</p>
    </div>
    <div class="body">
      <p class="greeting">Hello ${name},</p>
      <p class="message">
        Thank you for registering with FieldEaze. To complete your registration,
        please use the verification code below.
      </p>
      <div class="otp-box">
        <p class="otp-label">Your Verification Code</p>
        <p class="otp-code">${otp}</p>
        <p class="expiry">⏱ This code expires in <strong>5 minutes</strong></p>
      </div>
      <hr class="divider" />
      <p class="note">
        If you did not request this verification, please ignore this email.
        Your account will not be created until the code is verified.
      </p>
    </div>
    <div class="footer">
      <p>© ${new Date().getFullYear()} FieldEaze · Support Team</p>
    </div>
  </div>
</body>
</html>`;

    return this.sendEmail(email, 'Verify Your Email Address', html);
  }

  async sendForgotPasswordOtp(email: string, name: string, otp: string): Promise<void> {
    const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/><title>Reset Password OTP</title>
<style>
  body{margin:0;padding:0;background:#f4f6f9;font-family:'Segoe UI',Arial,sans-serif;}
  .wrapper{max-width:560px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,.08);}
  .header{background:linear-gradient(135deg,#DC2626,#B91C1C);padding:36px 40px;text-align:center;}
  .header h1{margin:0;color:#fff;font-size:26px;font-weight:700;}
  .header p{margin:6px 0 0;color:rgba(255,255,255,.85);font-size:14px;}
  .body{padding:36px 40px;}
  .otp-box{background:#FEF2F2;border:2px dashed #DC2626;border-radius:10px;padding:24px;text-align:center;margin:20px 0;}
  .otp-label{font-size:12px;font-weight:600;color:#6B7280;text-transform:uppercase;letter-spacing:1px;margin:0 0 10px;}
  .otp-code{font-size:42px;font-weight:800;color:#DC2626;letter-spacing:10px;margin:0;font-family:'Courier New',monospace;}
  .expiry{font-size:13px;color:#9CA3AF;margin:10px 0 0;}
  .footer{background:#F9FAFB;padding:20px 40px;text-align:center;border-top:1px solid #E5E7EB;}
  .footer p{margin:0;font-size:12px;color:#9CA3AF;}
</style></head><body>
<div class="wrapper">
  <div class="header"><h1>FieldEaze</h1><p>Password Reset</p></div>
  <div class="body">
    <p style="font-size:16px;color:#374151;margin:0 0 12px;">Hello ${name},</p>
    <p style="font-size:15px;color:#6B7280;line-height:1.6;margin:0 0 4px;">
      We received a request to reset your password. Use the OTP below — it is valid for <strong>5 minutes</strong>.
    </p>
    <div class="otp-box">
      <p class="otp-label">Password Reset OTP</p>
      <p class="otp-code">${otp}</p>
      <p class="expiry">⏱ Expires in <strong>5 minutes</strong> &nbsp;·&nbsp; Max 5 attempts</p>
    </div>
    <p style="font-size:13px;color:#9CA3AF;">If you did not request a password reset, ignore this email. Your password will remain unchanged.</p>
  </div>
  <div class="footer"><p>© ${new Date().getFullYear()} FieldEaze · Support Team</p></div>
</div></body></html>`;
    return this.sendEmail(email, 'Reset Your FieldEaze Password — OTP', html);
  }

  async sendTicketAssigned(email: string, technicianName: string, ticketId: string): Promise<void> {
    return this.sendEmail(
      email,
      'New Ticket Assigned - FieldEaze',
      `<h2>New Ticket Assigned</h2><p>Hi ${technicianName}, you have been assigned ticket #${ticketId}.</p>`,
    );
  }

  async sendInvoice(email: string, customerName: string, invoiceUrl: string): Promise<void> {
    return this.sendEmail(
      email,
      'Your Invoice - FieldEaze',
      `<h2>Invoice Ready</h2><p>Hi ${customerName}, your invoice is ready. <a href="${invoiceUrl}">Download Invoice</a></p>`,
    );
  }
}
