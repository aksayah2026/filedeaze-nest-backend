import { IsEmail, IsString, IsUUID, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyOtpDto {
  @ApiProperty({ example: 'bc802c99-e88f-4952-82af-8a16f48aa61b' })
  @IsUUID('4', { message: 'tenantId must be a valid UUID' })
  tenantId: string;

  @ApiProperty({ example: 'jane@example.com' })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email: string;

  @ApiProperty({ example: '482910', description: '6-digit OTP sent to email' })
  @IsString({ message: 'OTP must be a string' })
  @Length(6, 6, { message: 'OTP must be exactly 6 digits' })
  otp: string;
}
