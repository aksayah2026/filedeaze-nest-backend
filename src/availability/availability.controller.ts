import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AvailabilityService, CreateAvailabilityDto } from './availability.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { TenantId } from '../common/decorators/current-user.decorator';

@ApiTags('Availability')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('availability')
export class AvailabilityController {
  constructor(private readonly service: AvailabilityService) {}

  @Post()
  @ApiOperation({ summary: 'Add technician availability slot' })
  create(@TenantId() tenantId: string, @Body() dto: CreateAvailabilityDto) {
    return this.service.create(tenantId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get availability slots for a technician on a date' })
  findAvailability(
    @TenantId() tenantId: string,
    @Query('technicianId') technicianId: string,
    @Query('date') date?: string,
  ) {
    return this.service.findByTechnicianAndDate(tenantId, technicianId, date);
  }
}
