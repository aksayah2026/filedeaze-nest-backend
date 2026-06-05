import { IsString, IsOptional, IsDateString, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TicketStatus } from '@prisma/client';

export class AssignTechnicianDto {
  @ApiProperty()
  @IsString({ message: 'Technician ID must be a string' })
  technicianId: string;

  @ApiPropertyOptional({ example: '2026-06-10T09:00:00Z' })
  @IsOptional()
  @IsDateString({}, { message: 'Scheduled date must be a valid ISO date string' })
  scheduledAt?: string;
}

export class CloseTicketDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString({ message: 'Notes must be a string' })
  notes?: string;
}

export class CancelTicketDto {
  @ApiProperty({ example: 'Customer requested cancellation' })
  @IsString()
  reason: string;
}

export class TicketFilterDto {
  @ApiPropertyOptional({ enum: TicketStatus })
  @IsOptional()
  @IsEnum(TicketStatus, { message: 'Invalid ticket status' })
  status?: TicketStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  technicianId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiPropertyOptional({ example: '2026-01-01' })
  @IsOptional()
  @IsDateString({}, { message: 'From date must be a valid ISO date string' })
  from?: string;

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsOptional()
  @IsDateString({}, { message: 'To date must be a valid ISO date string' })
  to?: string;
}
