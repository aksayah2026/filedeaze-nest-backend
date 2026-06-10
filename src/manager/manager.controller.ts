import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ManagerService } from './manager.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, TenantId } from '../common/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';
import { JwtPayload } from '../common/types/jwt-payload.type';
import { CreateTechnicianDto, UpdateTechnicianDto, ResetTechnicianPasswordDto } from './dto/create-technician.dto';
import { AssignTechnicianDto, CloseTicketDto, CancelTicketDto, TicketFilterDto } from './dto/assign-ticket.dto';
import {
  CreateCategoryDto, UpdateCategoryDto,
  CreateSubCategoryDto, UpdateSubCategoryDto,
  UpsertServiceChargeDto,
} from './dto/service-catalog.dto';

@ApiTags('Manager')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.MANAGER)
@Controller('web/manager')
export class ManagerController {
  constructor(private readonly service: ManagerService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Manager dashboard statistics' })
  getDashboard(@TenantId() tenantId: string) {
    return this.service.getDashboard(tenantId);
  }

  // ── Technicians ─────────────────────────────────────────────────────────

  @Get('technicians')
  @ApiOperation({ summary: 'List all technicians' })
  listTechnicians(@TenantId() tenantId: string) {
    return this.service.listTechnicians(tenantId);
  }

  @Post('technicians')
  @ApiOperation({ summary: 'Create a technician (plan limit enforced)' })
  createTechnician(@TenantId() tenantId: string, @Body() dto: CreateTechnicianDto, @CurrentUser() user: JwtPayload) {
    return this.service.createTechnician(tenantId, dto, user.sub);
  }

  @Get('technicians/:id')
  @ApiOperation({ summary: 'Get technician details' })
  getTechnician(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.service.getTechnician(tenantId, id);
  }

  @Patch('technicians/:id')
  @ApiOperation({ summary: 'Update a technician' })
  updateTechnician(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateTechnicianDto,
  ) {
    return this.service.updateTechnician(tenantId, id, dto);
  }

  @Delete('technicians/:id')
  @ApiOperation({ summary: 'Deactivate a technician' })
  deleteTechnician(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.service.deleteTechnician(tenantId, id);
  }

  @Patch('technicians/:id/reset-password')
  @ApiOperation({ summary: 'Reset technician password — forces re-login on all devices' })
  resetTechnicianPassword(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: ResetTechnicianPasswordDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.resetTechnicianPassword(tenantId, id, dto, user.sub);
  }

  @Get('technicians/:id/location')
  @ApiOperation({ summary: 'Get live GPS location of technician' })
  getTechnicianLocation(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.service.getTechnicianLocation(tenantId, id);
  }

  @Get('technicians/:id/route')
  @ApiOperation({ summary: 'Get route history for a technician — filter by date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'date', required: false, example: '2026-06-09' })
  getTechnicianRoute(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Query('date') date?: string,
  ) {
    return this.service.getTechnicianRoute(tenantId, id, date);
  }

  // ── Service Categories ──────────────────────────────────────────────────

  @Get('service-categories')
  @ApiOperation({ summary: 'List service categories' })
  listCategories(@TenantId() tenantId: string) {
    return this.service.listCategories(tenantId);
  }

  @Post('service-categories')
  @ApiOperation({ summary: 'Create service category' })
  createCategory(@TenantId() tenantId: string, @Body() dto: CreateCategoryDto) {
    return this.service.createCategory(tenantId, dto);
  }

  @Patch('service-categories/:id')
  @ApiOperation({ summary: 'Update service category' })
  updateCategory(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.service.updateCategory(tenantId, id, dto);
  }

  @Delete('service-categories/:id')
  @ApiOperation({ summary: 'Deactivate a service category' })
  deleteCategory(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.service.deleteCategory(tenantId, id);
  }

  // ── Sub Categories ──────────────────────────────────────────────────────

  @Get('service-sub-categories')
  @ApiOperation({ summary: 'List service sub-categories' })
  @ApiQuery({ name: 'categoryId', required: false })
  listSubCategories(@TenantId() tenantId: string, @Query('categoryId') categoryId?: string) {
    return this.service.listSubCategories(tenantId, categoryId);
  }

  @Post('service-sub-categories')
  @ApiOperation({ summary: 'Create service sub-category' })
  createSubCategory(@TenantId() tenantId: string, @Body() dto: CreateSubCategoryDto) {
    return this.service.createSubCategory(tenantId, dto);
  }

  @Patch('service-sub-categories/:id')
  @ApiOperation({ summary: 'Update service sub-category' })
  updateSubCategory(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateSubCategoryDto,
  ) {
    return this.service.updateSubCategory(tenantId, id, dto);
  }

  @Delete('service-sub-categories/:id')
  @ApiOperation({ summary: 'Deactivate a service sub-category' })
  deleteSubCategory(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.service.deleteSubCategory(tenantId, id);
  }

  // ── Service Charges ─────────────────────────────────────────────────────

  @Post('service-charges/:subCategoryId')
  @ApiOperation({ summary: 'Create or update service charge for a sub-category' })
  upsertServiceCharge(
    @TenantId() tenantId: string,
    @Param('subCategoryId') subCategoryId: string,
    @Body() dto: UpsertServiceChargeDto,
  ) {
    return this.service.upsertServiceCharge(tenantId, subCategoryId, dto);
  }

  // ── Customers ────────────────────────────────────────────────────────────

  @Get('customers')
  @ApiOperation({ summary: 'List customers with optional search' })
  @ApiQuery({ name: 'search', required: false })
  listCustomers(@TenantId() tenantId: string, @Query('search') search?: string) {
    return this.service.listCustomers(tenantId, search);
  }

  @Get('customers/:id/history')
  @ApiOperation({ summary: 'Customer ticket history' })
  getCustomerHistory(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.service.getCustomerHistory(tenantId, id);
  }

  // ── Tickets ──────────────────────────────────────────────────────────────

  @Get('tickets')
  @ApiOperation({ summary: 'List tickets with filters' })
  listTickets(@TenantId() tenantId: string, @Query() filter: TicketFilterDto) {
    return this.service.listTickets(tenantId, filter);
  }

  @Get('tickets/:id')
  @ApiOperation({ summary: 'Get full ticket detail' })
  getTicket(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.service.getTicket(tenantId, id);
  }

  @Patch('tickets/:id/assign')
  @ApiOperation({ summary: 'Assign technician to ticket' })
  assignTechnician(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: AssignTechnicianDto,
  ) {
    return this.service.assignTechnician(tenantId, id, dto, user.sub);
  }

  @Patch('tickets/:id/reassign')
  @ApiOperation({ summary: 'Reassign ticket to a different technician' })
  reassignTechnician(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: AssignTechnicianDto,
  ) {
    return this.service.reassignTechnician(tenantId, id, dto, user.sub);
  }

  @Patch('tickets/:id/close')
  @ApiOperation({ summary: 'Close a ticket after invoice is generated' })
  closeTicket(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: CloseTicketDto,
  ) {
    return this.service.closeTicket(tenantId, id, dto, user.sub);
  }

  @Patch('tickets/:id/cancel')
  @ApiOperation({ summary: 'Cancel a ticket (not allowed after COMPLETED/CLOSED)' })
  cancelTicket(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: CancelTicketDto,
  ) {
    return this.service.cancelTicket(tenantId, id, dto.reason, user.sub);
  }

  // ── Attendance ────────────────────────────────────────────────────────────

  @Get('attendance')
  @ApiOperation({ summary: 'View technician attendance records' })
  @ApiQuery({ name: 'technicianId', required: false })
  @ApiQuery({ name: 'from', required: false, example: '2026-06-01' })
  @ApiQuery({ name: 'to', required: false, example: '2026-06-30' })
  listAttendance(
    @TenantId() tenantId: string,
    @Query('technicianId') technicianId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.listAttendance(tenantId, technicianId, from, to);
  }

  // ── Feedback ──────────────────────────────────────────────────────────────

  @Get('feedback')
  @ApiOperation({ summary: 'View customer feedback' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  listFeedback(
    @TenantId() tenantId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.listFeedback(tenantId, from, to);
  }

  // ── Payments ─────────────────────────────────────────────────────────────

  @Get('payments')
  @ApiOperation({ summary: 'Payment collection report' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  listPayments(
    @TenantId() tenantId: string,
    @Query('status') status?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.listPayments(tenantId, status, from, to);
  }

  @Patch('payments/:id/verify')
  @ApiOperation({ summary: 'Verify a collected payment (mark as VERIFIED)' })
  verifyPayment(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.service.verifyPayment(tenantId, id, user.sub);
  }

  // ── Invoices (Screens 8–10) ───────────────────────────────────────────────

  @Get('invoices')
  @ApiOperation({ summary: 'Invoice list — search by number, ticket, customer; filter by date' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'from',   required: false, example: '2026-01-01' })
  @ApiQuery({ name: 'to',     required: false, example: '2026-12-31' })
  listInvoices(
    @TenantId() tenantId: string,
    @Query('search') search?: string,
    @Query('from')   from?: string,
    @Query('to')     to?: string,
  ) {
    return this.service.listInvoices(tenantId, search, undefined, from, to);
  }

  @Get('invoices/:id')
  @ApiOperation({ summary: 'Invoice details + PDF URL — for preview and download' })
  getInvoice(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.service.getInvoice(tenantId, id);
  }
}
