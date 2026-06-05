import {
  IsString,
  IsEmail,
  IsOptional,
  IsEnum,
  IsNumber,
  IsDateString,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TenantStatus, PlanName, SubscriptionStatus } from '@prisma/client';

export class CreateTenantDto {
  @ApiProperty()
  @IsString()
  companyName: string;

  @ApiProperty()
  @IsString()
  tenantCode: string;

  @ApiProperty()
  @IsEmail()
  email: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;

  @ApiProperty({ description: 'Admin user name for this tenant' })
  @IsString()
  adminName: string;

  @ApiProperty({ description: 'Admin user password' })
  @IsString()
  adminPassword: string;

  @ApiPropertyOptional({ enum: PlanName })
  @IsOptional()
  @IsEnum(PlanName)
  plan?: PlanName;
}

export class UpdateTenantDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  companyName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;
}

export class UpdateTenantStatusDto {
  @ApiProperty({ enum: TenantStatus })
  @IsEnum(TenantStatus)
  status: TenantStatus;
}

export class CreatePlanDto {
  @ApiProperty({ enum: PlanName })
  @IsEnum(PlanName)
  name: PlanName;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  managerLimit: number;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  technicianLimit: number;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  ticketLimit: number;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  storageLimitGb: number;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  price: number;
}

export class UpdatePlanDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  managerLimit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  technicianLimit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  ticketLimit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  storageLimitGb?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;
}

export class AssignSubscriptionDto {
  @ApiProperty()
  @IsString()
  tenantId: string;

  @ApiProperty()
  @IsString()
  planId: string;

  @ApiProperty()
  @IsDateString()
  startDate: string;

  @ApiProperty()
  @IsDateString()
  endDate: string;
}

export class RenewSubscriptionDto {
  @ApiProperty()
  @IsDateString()
  endDate: string;
}
