import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ServicesService } from './services.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { TenantId } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { UserRole } from '@prisma/client';
import { CreateServiceDto, UpdateServiceDto, ServiceFilterDto } from './dto/service.dto';

@ApiTags('Services')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('services')
export class ServicesController {
  constructor(private readonly service: ServicesService) {}

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @Post()
  @ApiOperation({ summary: 'Create a service' })
  create(@TenantId() tenantId: string, @Body() dto: CreateServiceDto) {
    return this.service.create(tenantId, dto);
  }

  @Public()
  @Get()
  @ApiOperation({ summary: 'List all active services with filters' })
  findAll(@TenantId() tenantId: string, @Query() filters: ServiceFilterDto) {
    return this.service.findAll(tenantId, filters);
  }

  @Public()
  @Get('popular')
  @ApiOperation({ summary: 'Get up to 10 popular services' })
  findPopular(@TenantId() tenantId: string) {
    return this.service.findPopular(tenantId);
  }

  @Public()
  @Get('preview')
  @ApiOperation({ summary: 'Lightweight service preview list' })
  findPreview(@TenantId() tenantId: string) {
    return this.service.findPreview(tenantId);
  }

  @Public()
  @Get('category/:categoryId')
  @ApiOperation({ summary: 'Get all services in a category' })
  findByCategory(@TenantId() tenantId: string, @Param('categoryId') categoryId: string) {
    return this.service.findByCategory(tenantId, categoryId);
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Get a service by ID' })
  findOne(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.service.findOne(tenantId, id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @Patch(':id')
  @ApiOperation({ summary: 'Update a service' })
  update(@TenantId() tenantId: string, @Param('id') id: string, @Body() dto: UpdateServiceDto) {
    return this.service.update(tenantId, id, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete a service' })
  remove(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.service.remove(tenantId, id);
  }
}
