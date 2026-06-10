import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query,
  UseGuards, UseInterceptors, UploadedFiles,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes, ApiQuery } from '@nestjs/swagger';
import { CustomerService } from './customer.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, TenantId } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../common/types/jwt-payload.type';
import { UserRole, TicketStatus } from '@prisma/client';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { SubmitFeedbackDto } from './dto/submit-feedback.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { CreateAddressDto, UpdateAddressDto } from './dto/address.dto';
import { CancelTicketDto } from './dto/cancel-ticket.dto';

@ApiTags('Customer')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Roles(UserRole.CUSTOMER)
@Controller('mobile/customer')
export class CustomerController {
  constructor(private readonly service: CustomerService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Customer dashboard — open/completed ticket counts + recent invoice' })
  getDashboard(@TenantId() tenantId: string, @CurrentUser() user: JwtPayload) {
    return this.service.getDashboard(tenantId, user.sub);
  }

  @Get('profile')
  @ApiOperation({ summary: 'Get my profile' })
  getProfile(@TenantId() tenantId: string, @CurrentUser() user: JwtPayload) {
    return this.service.getProfile(tenantId, user.sub);
  }

  @Patch('profile')
  @ApiOperation({ summary: 'Update my profile' })
  updateProfile(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.service.updateProfile(tenantId, user.sub, dto);
  }

  @Post('tickets')
  @ApiOperation({ summary: 'Raise a new service ticket with optional images' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FilesInterceptor('images', 5))
  raiseTicket(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateTicketDto,
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    return this.service.raiseTicket(tenantId, user.sub, dto, files);
  }

  @Get('tickets')
  @ApiOperation({ summary: 'List my tickets with optional status filter' })
  @ApiQuery({ name: 'status', required: false, enum: TicketStatus })
  listMyTickets(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Query('status') status?: TicketStatus,
  ) {
    return this.service.listMyTickets(tenantId, user.sub, status);
  }

  @Get('tickets/:id')
  @ApiOperation({ summary: 'Get full ticket details with status history' })
  getTicket(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.service.getTicket(tenantId, user.sub, id);
  }

  @Patch('tickets/:id/cancel')
  @ApiOperation({ summary: 'Cancel a ticket (not allowed once IN_PROGRESS or later)' })
  cancelTicket(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: CancelTicketDto,
  ) {
    return this.service.cancelTicket(tenantId, user.sub, id, dto);
  }

  @Get('tickets/:id/track')
  @ApiOperation({ summary: 'Live ticket tracking — technician location + status history' })
  trackTicket(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.service.getTicketTracking(tenantId, user.sub, id);
  }

  @Get('payments')
  @ApiOperation({ summary: 'My payment history' })
  getMyPayments(@TenantId() tenantId: string, @CurrentUser() user: JwtPayload) {
    return this.service.getMyPayments(tenantId, user.sub);
  }

  @Get('feedback')
  @ApiOperation({ summary: 'My submitted feedback list' })
  getMyFeedback(@TenantId() tenantId: string, @CurrentUser() user: JwtPayload) {
    return this.service.getMyFeedback(tenantId, user.sub);
  }

  @Get('invoices')
  @ApiOperation({ summary: 'List my invoices' })
  listMyInvoices(@TenantId() tenantId: string, @CurrentUser() user: JwtPayload) {
    return this.service.listMyInvoices(tenantId, user.sub);
  }

  @Get('invoices/:id')
  @ApiOperation({ summary: 'Get invoice detail for download' })
  getInvoice(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.service.getInvoice(tenantId, user.sub, id);
  }

  @Post('feedback')
  @ApiOperation({ summary: 'Submit feedback for a closed ticket' })
  submitFeedback(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: SubmitFeedbackDto,
  ) {
    return this.service.submitFeedback(tenantId, user.sub, dto);
  }

  // ── Addresses ───────────────────────────────────────────────────────────────

  @Get('addresses')
  @ApiOperation({ summary: 'List my saved addresses' })
  getAddresses(@TenantId() tenantId: string, @CurrentUser() user: JwtPayload) {
    return this.service.getAddresses(tenantId, user.sub);
  }

  @Post('addresses')
  @ApiOperation({ summary: 'Add a new address (label must be unique per user)' })
  addAddress(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateAddressDto,
  ) {
    return this.service.addAddress(tenantId, user.sub, dto);
  }

  @Patch('addresses/:id')
  @ApiOperation({ summary: 'Update an address' })
  updateAddress(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateAddressDto,
  ) {
    return this.service.updateAddress(tenantId, user.sub, id, dto);
  }

  @Delete('addresses/:id')
  @ApiOperation({ summary: 'Remove an address (soft-delete)' })
  deleteAddress(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.service.deleteAddress(tenantId, user.sub, id);
  }
}
