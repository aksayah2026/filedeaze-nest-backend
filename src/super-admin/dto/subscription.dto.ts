import { IsString, IsDateString, IsNumber, IsEnum, Min, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PlanName } from '@prisma/client';

export class CreatePlanDto {
  @ApiProperty({ enum: PlanName })
  @IsEnum(PlanName, { message: 'Plan name must be STARTER, PROFESSIONAL, or ENTERPRISE' })
  name: PlanName;

  @ApiProperty({ example: 1 })
  @IsNumber({}, { message: 'Manager limit must be a number' })
  @Min(0, { message: 'Manager limit cannot be negative' })
  managerLimit: number;

  @ApiProperty({ example: 5 })
  @IsNumber({}, { message: 'Technician limit must be a number' })
  @Min(0, { message: 'Technician limit cannot be negative' })
  technicianLimit: number;

  @ApiProperty({ example: 200 })
  @IsNumber({}, { message: 'Ticket limit must be a number' })
  @Min(0, { message: 'Ticket limit cannot be negative' })
  ticketLimit: number;

  @ApiProperty({ example: 5 })
  @IsNumber({}, { message: 'Storage limit must be a number' })
  @Min(0, { message: 'Storage limit cannot be negative' })
  storageLimitGb: number;

  @ApiProperty({ example: 999 })
  @IsNumber({}, { message: 'Price must be a number' })
  @Min(0, { message: 'Price cannot be negative' })
  price: number;
}

export class UpdatePlanDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({}, { message: 'Manager limit must be a number' })
  @Min(0)
  managerLimit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({}, { message: 'Technician limit must be a number' })
  @Min(0)
  technicianLimit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({}, { message: 'Ticket limit must be a number' })
  @Min(0)
  ticketLimit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({}, { message: 'Storage limit must be a number' })
  @Min(0)
  storageLimitGb?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({}, { message: 'Price must be a number' })
  @Min(0)
  price?: number;
}

export class AssignSubscriptionDto {
  @ApiProperty()
  @IsString({ message: 'Tenant ID must be a string' })
  tenantId: string;

  @ApiProperty()
  @IsString({ message: 'Plan ID must be a string' })
  planId: string;

  @ApiProperty({ example: '2026-01-01' })
  @IsDateString({}, { message: 'Start date must be a valid ISO date string' })
  startDate: string;

  @ApiProperty({ example: '2027-01-01' })
  @IsDateString({}, { message: 'End date must be a valid ISO date string' })
  endDate: string;
}

export class RenewSubscriptionDto {
  @ApiProperty({ example: '2027-01-01' })
  @IsDateString({}, { message: 'End date must be a valid ISO date string' })
  endDate: string;
}
