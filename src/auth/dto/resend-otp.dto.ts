import { IsEmail, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResendOtpDto {
  @ApiProperty({ example: 'bc802c99-e88f-4952-82af-8a16f48aa61b' })
  @IsUUID('4', { message: 'tenantId must be a valid UUID' })
  tenantId: string;

  @ApiProperty({ example: 'jane@example.com' })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email: string;
}
