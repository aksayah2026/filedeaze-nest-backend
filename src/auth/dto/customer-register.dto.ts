import { IsEmail, IsString, IsUUID, MinLength, IsOptional, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CustomerRegisterDto {
  @ApiProperty({ example: 'bc802c99-e88f-4952-82af-8a16f48aa61b' })
  @IsUUID('4', { message: 'tenantId must be a valid UUID' })
  tenantId: string;

  @ApiProperty({ example: 'Jane Doe' })
  @IsString({ message: 'Name must be a string' })
  name: string;

  @ApiProperty({ example: 'jane@example.com' })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email: string;

  @ApiPropertyOptional({ example: '+919876543210' })
  @IsOptional()
  @IsString({ message: 'Phone must be a string' })
  phone?: string;

  @ApiProperty({ minLength: 6 })
  @IsString({ message: 'Password must be a string' })
  @MinLength(6, { message: 'Password must be at least 6 characters' })
  password: string;

  @ApiProperty({ minLength: 6, description: 'Must match password' })
  @IsString({ message: 'Confirm password must be a string' })
  @MinLength(6, { message: 'Confirm password must be at least 6 characters' })
  confirmPassword: string;
}
