import { IsString, IsOptional, IsDateString, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TicketPriority } from '@prisma/client';

export class CreateTicketDto {
  @ApiProperty()
  @IsString({ message: 'Category ID must be a string' })
  categoryId: string;

  @ApiProperty()
  @IsString({ message: 'Sub-category ID must be a string' })
  subCategoryId: string;

  @ApiProperty({ example: 'Fan is making noise and not running at full speed' })
  @IsString({ message: 'Description must be a string' })
  description: string;

  @ApiPropertyOptional({ enum: TicketPriority, default: TicketPriority.MEDIUM })
  @IsOptional()
  @IsEnum(TicketPriority, { message: 'Priority must be LOW, MEDIUM, or HIGH' })
  priority?: TicketPriority;

  @ApiPropertyOptional({ example: '2026-06-10T09:00:00Z' })
  @IsOptional()
  @IsDateString({}, { message: 'Scheduled date must be a valid ISO date string' })
  scheduledAt?: string;

  @ApiPropertyOptional({ example: '12, Main Street, Bengaluru - 560001' })
  @IsOptional()
  @IsString({ message: 'Service address must be a string' })
  serviceAddress?: string;
}
