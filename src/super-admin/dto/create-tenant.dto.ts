import { IsString, IsEmail, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PlanName } from '@prisma/client';

export class CreateTenantDto {
  @ApiProperty({ example: 'ABC Services Ltd' })
  @IsString({ message: 'Company name must be a string' })
  companyName: string;

  @ApiProperty({ example: 'abc', description: 'Unique lowercase identifier' })
  @IsString({ message: 'Tenant code must be a string' })
  tenantCode: string;

  @ApiPropertyOptional({ example: 'Ravi Kumar' })
  @IsOptional()
  @IsString({ message: 'Contact person must be a string' })
  contactPerson?: string;

  @ApiProperty({ example: 'info@abc.com' })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email: string;

  @ApiPropertyOptional({ example: '+919876543210' })
  @IsOptional()
  @IsString({ message: 'Phone must be a string' })
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString({ message: 'Address must be a string' })
  address?: string;

  @ApiPropertyOptional({ example: 'Chennai' })
  @IsOptional()
  @IsString({ message: 'City must be a string' })
  city?: string;

  @ApiPropertyOptional({ example: 'Tamil Nadu' })
  @IsOptional()
  @IsString({ message: 'State must be a string' })
  state?: string;

  @ApiPropertyOptional({ example: '600001' })
  @IsOptional()
  @IsString({ message: 'Pincode must be a string' })
  pincode?: string;

  @ApiProperty({ example: 'Admin User' })
  @IsString({ message: 'Admin name must be a string' })
  adminName: string;

  @ApiProperty({ example: 'admin@abc.com' })
  @IsEmail({}, { message: 'Please provide a valid admin email address' })
  adminEmail: string;

  @ApiProperty({ example: 'StrongPass@123', minLength: 8 })
  @IsString({ message: 'Password must be a string' })
  adminPassword: string;

  @ApiPropertyOptional({ enum: PlanName })
  @IsOptional()
  @IsEnum(PlanName, { message: 'Plan must be STARTER, PROFESSIONAL, or ENTERPRISE' })
  plan?: PlanName;
}
