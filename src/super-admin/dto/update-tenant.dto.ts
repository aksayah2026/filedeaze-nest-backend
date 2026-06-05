import { IsString, IsEmail, IsOptional, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { TenantStatus } from '@prisma/client';

export class UpdateTenantDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString({ message: 'Company name must be a string' })
  companyName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString({ message: 'Phone must be a string' })
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString({ message: 'Address must be a string' })
  address?: string;
}

export class UpdateTenantStatusDto {
  @ApiPropertyOptional({ enum: TenantStatus })
  @IsEnum(TenantStatus, { message: 'Status must be ACTIVE, SUSPENDED, or EXPIRED' })
  status: TenantStatus;
}
