import { IsEmail, IsString, IsUUID, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CustomerForgotPasswordDto {
  @ApiProperty({ example: 'bc802c99-e88f-4952-82af-8a16f48aa61b' })
  @IsUUID('4', { message: 'tenantId must be a valid UUID' })
  tenantId: string;

  @ApiProperty({ example: 'customer@example.com' })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email: string;
}

export class VerifyForgotPasswordOtpDto {
  @ApiProperty({ example: 'bc802c99-e88f-4952-82af-8a16f48aa61b' })
  @IsUUID('4', { message: 'tenantId must be a valid UUID' })
  tenantId: string;

  @ApiProperty({ example: 'customer@example.com' })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email: string;

  @ApiProperty({ example: '482910', description: '6-digit OTP from email' })
  @IsString()
  otp: string;
}

export class CustomerResetPasswordDto {
  @ApiProperty({ description: 'Reset token received after OTP verification (valid 15 minutes)' })
  @IsString()
  resetToken: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  newPassword: string;

  @ApiProperty({ description: 'Must match newPassword' })
  @IsString()
  @MinLength(8)
  confirmNewPassword: string;
}
