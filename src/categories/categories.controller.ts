import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { CategoriesService } from './categories.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { TenantId } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { UserRole } from '@prisma/client';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';

@ApiTags('Categories')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('categories')
export class CategoriesController {
  constructor(private readonly service: CategoriesService) {}

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @Post()
  @ApiOperation({ summary: 'Create a service category' })
  create(@TenantId() tenantId: string, @Body() dto: CreateCategoryDto) {
    return this.service.create(tenantId, dto);
  }

  @Public()
  @Get()
  @ApiOperation({ summary: 'List all service categories' })
  @ApiQuery({ name: 'name', required: false })
  @ApiQuery({ name: 'categoryId', required: false })
  @ApiQuery({ name: 'includeEmpty', required: false, type: Boolean })
  findAll(
    @TenantId() tenantId: string,
    @Query('name') name?: string,
    @Query('categoryId') categoryId?: string,
    @Query('includeEmpty') includeEmpty?: string,
  ) {
    return this.service.findAll(tenantId, { name, categoryId, includeEmpty: includeEmpty === 'false' ? false : undefined });
  }

  @Public()
  @Get('with-packages')
  @ApiOperation({ summary: 'List categories with their service packages' })
  findWithPackages(@TenantId() tenantId: string) {
    return this.service.findWithPackages(tenantId);
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Get a category with its services and packages' })
  findOne(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.service.findOne(tenantId, id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @Patch(':id')
  @ApiOperation({ summary: 'Update a category' })
  update(@TenantId() tenantId: string, @Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.service.update(tenantId, id, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete a category' })
  remove(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.service.remove(tenantId, id);
  }
}
