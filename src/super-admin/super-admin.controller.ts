import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, ParseIntPipe, DefaultValuePipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { SuperAdminService } from './super-admin.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { ParseUUIDPipe } from '../common/pipes/parse-uuid.pipe';
import { UserRole, TenantStatus, PlanName } from '@prisma/client';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto, UpdateTenantStatusDto } from './dto/update-tenant.dto';
import { CreatePlanDto, UpdatePlanDto, AssignSubscriptionDto, RenewSubscriptionDto } from './dto/subscription.dto';
import { CreateSuperAdminDto } from './dto/create-super-admin.dto';

@ApiTags('Super Admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
@Controller('web/super-admin')
export class SuperAdminController {
  constructor(private readonly service: SuperAdminService) {}

  @Public()
  @Post('setup')
  @ApiOperation({ summary: 'One-time setup — create the first super admin. Blocked once any super admin exists.' })
  setupSuperAdmin(@Body() dto: CreateSuperAdminDto) {
    return this.service.setupSuperAdmin(dto);
  }

  @Post('create-super-admin')
  @ApiOperation({ summary: 'Create additional super admin accounts (requires existing super admin token)' })
  createSuperAdmin(@Body() dto: CreateSuperAdminDto) {
    return this.service.createSuperAdmin(dto);
  }

  @Get('dashboard')
  @ApiOperation({ summary: 'Platform-wide dashboard statistics' })
  getDashboard() {
    return this.service.getDashboard();
  }

  @Post('tenants')
  @ApiOperation({ summary: 'Create a new tenant with admin account' })
  createTenant(@Body() dto: CreateTenantDto) {
    return this.service.createTenant(dto);
  }

  @Get('tenants')
  @ApiOperation({ summary: 'List all tenants with optional filters' })
  @ApiQuery({ name: 'status', enum: TenantStatus, required: false })
  @ApiQuery({ name: 'plan', enum: PlanName, required: false })
  listTenants(@Query('status') status?: TenantStatus, @Query('plan') plan?: PlanName) {
    return this.service.listTenants(status, plan);
  }

  @Get('tenants/:id')
  @ApiOperation({ summary: 'Get tenant details' })
  getTenant(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getTenant(id);
  }

  @Patch('tenants/:id')
  @ApiOperation({ summary: 'Update tenant info' })
  updateTenant(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTenantDto) {
    return this.service.updateTenant(id, dto);
  }

  @Patch('tenants/:id/status')
  @ApiOperation({ summary: 'Activate or suspend a tenant' })
  updateTenantStatus(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTenantStatusDto) {
    return this.service.updateTenantStatus(id, dto);
  }

  @Delete('tenants/:id')
  @ApiOperation({ summary: 'Delete a tenant — deactivates all users and cancels subscriptions' })
  deleteTenant(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.deleteTenant(id);
  }

  @Get('plans')
  @ApiOperation({ summary: 'List all subscription plans' })
  listPlans() {
    return this.service.listPlans();
  }

  @Post('plans')
  @ApiOperation({ summary: 'Create a subscription plan' })
  createPlan(@Body() dto: CreatePlanDto) {
    return this.service.createPlan(dto);
  }

  @Patch('plans/:id')
  @ApiOperation({ summary: 'Update a subscription plan' })
  updatePlan(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePlanDto) {
    return this.service.updatePlan(id, dto);
  }

  @Post('subscriptions')
  @ApiOperation({ summary: 'Assign a subscription plan to a tenant' })
  assignSubscription(@Body() dto: AssignSubscriptionDto) {
    return this.service.assignSubscription(dto);
  }

  @Patch('subscriptions/:id/renew')
  @ApiOperation({ summary: 'Renew an existing subscription' })
  renewSubscription(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RenewSubscriptionDto) {
    return this.service.renewSubscription(id, dto);
  }

  @Get('billing')
  @ApiOperation({ summary: 'Revenue and billing report' })
  getBillingReport() {
    return this.service.getBillingReport();
  }

  @Get('activity-logs')
  @ApiOperation({ summary: 'Paginated platform audit trail' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 50 })
  @ApiQuery({ name: 'userId', required: false })
  @ApiQuery({ name: 'entity', required: false })
  getActivityLogs(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('userId') userId?: string,
    @Query('entity') entity?: string,
  ) {
    return this.service.getActivityLogs(page, limit, userId, entity);
  }
}
