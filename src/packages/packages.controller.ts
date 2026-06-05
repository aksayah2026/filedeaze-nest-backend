import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PackagesService, CreatePackageDto, UpdatePackageDto } from './packages.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { TenantId } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('Packages')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('packages')
export class PackagesController {
  constructor(private readonly service: PackagesService) {}

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @Post()
  @ApiOperation({ summary: 'Create a service package' })
  create(@TenantId() tenantId: string, @Body() dto: CreatePackageDto) {
    return this.service.create(tenantId, dto);
  }

  @Public()
  @Get()
  @ApiOperation({ summary: 'List all packages with filters' })
  findAll(
    @TenantId() tenantId: string,
    @Query('name') name?: string,
    @Query('packageId') packageId?: string,
    @Query('tag') tag?: string,
  ) {
    return this.service.findAll(tenantId, { name, packageId, tag });
  }

  @Public()
  @Get('categories-with-packages')
  @ApiOperation({ summary: 'Hierarchical list of categories with packages' })
  getCategoriesWithPackages(@TenantId() tenantId: string) {
    return this.service.getCategoriesWithPackages(tenantId);
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Get package by ID' })
  findOne(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.service.findOne(tenantId, id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @Patch(':id')
  @ApiOperation({ summary: 'Update a package' })
  update(@TenantId() tenantId: string, @Param('id') id: string, @Body() dto: UpdatePackageDto) {
    return this.service.update(tenantId, id, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete a package' })
  remove(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.service.remove(tenantId, id);
  }
}
