import { IsEnum, IsOptional, IsString, IsNumber, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TicketStatus, PendingReason } from '@prisma/client';

export class UpdateTicketStatusDto {
  @ApiProperty({ enum: TicketStatus })
  @IsEnum(TicketStatus, { message: 'Invalid ticket status' })
  status: TicketStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString({ message: 'Notes must be a string' })
  notes?: string;

  @ApiPropertyOptional({ enum: PendingReason })
  @IsOptional()
  @IsEnum(PendingReason, { message: 'Invalid pending reason' })
  pendingReason?: PendingReason;
}

export class MarkPendingDto {
  @ApiProperty({ enum: PendingReason })
  @IsEnum(PendingReason, { message: 'Pending reason is required and must be a valid reason' })
  reason: PendingReason;

  @ApiProperty()
  @IsString({ message: 'Notes are required when marking a ticket as pending' })
  notes: string;
}

export class RejectTicketDto {
  @ApiProperty()
  @IsString({ message: 'Rejection reason must be a string' })
  reason: string;
}
