import {
  Controller, Get, Post, Patch, Body, Param, Query,
  UseGuards, UseInterceptors, UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes, ApiQuery } from '@nestjs/swagger';
import { TechnicianService } from './technician.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, TenantId } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../common/types/jwt-payload.type';
import { UserRole, ImageType } from '@prisma/client';
import { CheckInDto, UpdateLocationDto } from './dto/checkin.dto';
import { UpdateTicketStatusDto, MarkPendingDto, RejectTicketDto } from './dto/update-ticket-status.dto';
import { CompleteTicketDto, CollectPaymentDto } from './dto/complete-job.dto';

@ApiTags('Technician')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Roles(UserRole.TECHNICIAN)
@Controller('mobile/technician')
export class TechnicianController {
  constructor(private readonly service: TechnicianService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'My dashboard: ticket counts, attendance status, rating' })
  getDashboard(@TenantId() tenantId: string, @CurrentUser() user: JwtPayload) {
    return this.service.getDashboard(tenantId, user.sub);
  }

  @Get('profile')
  @ApiOperation({ summary: 'Get my technician profile' })
  getProfile(@TenantId() tenantId: string, @CurrentUser() user: JwtPayload) {
    return this.service.getProfile(tenantId, user.sub);
  }

  // ── Attendance ─────────────────────────────────────────────────────────

  @Post('attendance/checkin')
  @ApiOperation({ summary: 'Check in with current GPS coordinates' })
  checkIn(@TenantId() tenantId: string, @CurrentUser() user: JwtPayload, @Body() dto: CheckInDto) {
    return this.service.checkIn(tenantId, user.sub, dto);
  }

  @Post('attendance/checkout')
  @ApiOperation({ summary: 'Check out with current GPS coordinates' })
  checkOut(@TenantId() tenantId: string, @CurrentUser() user: JwtPayload, @Body() dto: CheckInDto) {
    return this.service.checkOut(tenantId, user.sub, dto);
  }

  @Get('attendance')
  @ApiOperation({ summary: 'Get attendance history (last 30 days)' })
  getAttendanceHistory(@TenantId() tenantId: string, @CurrentUser() user: JwtPayload) {
    return this.service.getAttendanceHistory(tenantId, user.sub);
  }

  @Patch('location')
  @ApiOperation({ summary: 'Update live GPS location' })
  updateLocation(@TenantId() tenantId: string, @CurrentUser() user: JwtPayload, @Body() dto: UpdateLocationDto) {
    return this.service.updateLocation(tenantId, user.sub, dto);
  }

  // ── Tickets ─────────────────────────────────────────────────────────────

  @Get('tickets')
  @ApiOperation({ summary: 'List my assigned tickets' })
  listMyTickets(@TenantId() tenantId: string, @CurrentUser() user: JwtPayload) {
    return this.service.listMyTickets(tenantId, user.sub);
  }

  @Get('tickets/:id')
  @ApiOperation({ summary: 'Get ticket details' })
  getTicket(@TenantId() tenantId: string, @CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.service.getTicket(tenantId, user.sub, id);
  }

  @Patch('tickets/:id/status')
  @ApiOperation({ summary: 'Update ticket status (forward-only lifecycle)' })
  updateTicketStatus(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateTicketStatusDto,
  ) {
    return this.service.updateTicketStatus(tenantId, user.sub, id, dto);
  }

  @Post('tickets/:id/complete')
  @ApiOperation({ summary: 'Complete a ticket — requires before/after photos uploaded first' })
  completeTicket(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: CompleteTicketDto,
  ) {
    return this.service.completeTicket(tenantId, user.sub, id, dto);
  }

  @Post('tickets/:id/pending')
  @ApiOperation({ summary: 'Mark ticket as pending with a reason' })
  markPending(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: MarkPendingDto,
  ) {
    return this.service.markPending(tenantId, user.sub, id, dto);
  }

  @Post('tickets/:id/reject')
  @ApiOperation({ summary: 'Reject ticket — returns it to the unassigned queue' })
  rejectTicket(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: RejectTicketDto,
  ) {
    return this.service.rejectTicket(tenantId, user.sub, id, dto);
  }

  @Post('tickets/:id/images')
  @ApiOperation({ summary: 'Upload a ticket image (BEFORE / AFTER / RAISED)' })
  @ApiConsumes('multipart/form-data')
  @ApiQuery({ name: 'type', enum: ImageType })
  @UseInterceptors(FileInterceptor('file'))
  uploadImage(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Query('type') type: ImageType,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.service.uploadImage(tenantId, user.sub, id, type, file);
  }

  @Post('tickets/:id/collect-payment')
  @ApiOperation({ summary: 'Collect payment and auto-generate invoice' })
  collectPayment(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: CollectPaymentDto,
  ) {
    return this.service.collectPayment(tenantId, user.sub, id, dto);
  }
}
