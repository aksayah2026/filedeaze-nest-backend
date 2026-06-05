import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { handlePrismaError } from '../common/utils/prisma-error.handler';
import { IsString, IsDateString, IsBoolean, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateAvailabilityDto {
  @ApiProperty() @IsString() technicianId: string;
  @ApiProperty({ example: '2026-06-15' }) @IsDateString() date: string;
  @ApiProperty({ example: '09:00' }) @IsString() startTime: string;
  @ApiProperty({ example: '17:00' }) @IsString() endTime: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isAvailable?: boolean;
}

@Injectable()
export class AvailabilityService {
  private readonly logger = new Logger(AvailabilityService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, dto: CreateAvailabilityDto) {
    try {
      const tech = await this.prisma.technician.findFirst({ where: { id: dto.technicianId, tenantId } });
      if (!tech) throw new NotFoundException(`Technician "${dto.technicianId}" not found`);

      const slot = await this.prisma.technicianAvailability.create({
        data: { tenantId, technicianId: dto.technicianId, date: new Date(dto.date), startTime: dto.startTime, endTime: dto.endTime, isAvailable: dto.isAvailable ?? true },
      });
      return { message: 'Availability slot added successfully', data: slot };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      handlePrismaError(error, 'Availability');
    }
  }

  async findByTechnicianAndDate(tenantId: string, technicianId: string, date?: string) {
    try {
      const slots = await this.prisma.technicianAvailability.findMany({
        where: {
          tenantId,
          technicianId,
          isAvailable: true,
          ...(date && { date: new Date(date) }),
        },
        orderBy: { date: 'asc' },
      });
      return { message: 'Availability fetched successfully', data: slots };
    } catch (error) {
      handlePrismaError(error, 'Availability');
    }
  }
}
