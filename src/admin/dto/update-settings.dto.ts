import { IsBoolean, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateSettingsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean({ message: 'gstEnabled must be a boolean' })
  gstEnabled?: boolean;

  @ApiPropertyOptional({ example: '27AAACR5055K1ZS' })
  @IsOptional()
  @IsString({ message: 'GST number must be a string' })
  gstNumber?: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 28 })
  @IsOptional()
  @IsNumber({}, { message: 'GST percent must be a number' })
  @Min(0, { message: 'GST percent cannot be negative' })
  @Max(28, { message: 'GST percent cannot exceed 28' })
  gstPercent?: number;

  @ApiPropertyOptional({ example: 'INV' })
  @IsOptional()
  @IsString({ message: 'Invoice prefix must be a string' })
  invoicePrefix?: string;

  @ApiPropertyOptional({ example: 'INV-{YEAR}-{SEQ}' })
  @IsOptional()
  @IsString({ message: 'Invoice number format must be a string' })
  invoiceNumberFormat?: string;

  @ApiPropertyOptional({ example: 'merchant@upi' })
  @IsOptional()
  @IsString({ message: 'UPI ID must be a string' })
  upiId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString({ message: 'UPI account name must be a string' })
  upiAccountName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString({ message: 'UPI QR image URL must be a string' })
  upiQrImageUrl?: string;

  @ApiPropertyOptional({ description: 'Enable push notifications for tenant events' })
  @IsOptional()
  @IsBoolean({ message: 'pushNotificationsEnabled must be a boolean' })
  pushNotificationsEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Enable email notifications for tenant events' })
  @IsOptional()
  @IsBoolean({ message: 'emailNotificationsEnabled must be a boolean' })
  emailNotificationsEnabled?: boolean;

  @ApiPropertyOptional({ example: 'noreply@example.com', description: 'Sender email for outgoing notifications' })
  @IsOptional()
  @IsString({ message: 'Sender email must be a string' })
  senderEmail?: string;
}
