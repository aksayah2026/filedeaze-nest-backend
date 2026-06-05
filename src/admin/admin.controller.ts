import {
  Controller, Get, Patch, Post, Delete,
  Body, Param, Query, UseGuards, UseInterceptors, UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, ApiConsumes } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { TenantId } from '../common/decorators/current-user.decorator';
import { ParseUUIDPipe } from '../common/pipes/parse-uuid.pipe';
import { UserRole } from '@prisma/client';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { CreateManagerDto, UpdateManagerDto } from './dto/create-manager.dto';

@ApiTags('Admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('web/admin')
export class AdminController {
  constructor(private readonly service: AdminService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Admin dashboard overview' })
  getDashboard(@TenantId() tenantId: string) {
    return this.service.getDashboard(tenantId);
  }

  @Get('company-settings')
  @ApiOperation({ summary: 'Get company profile' })
  getCompanySettings(@TenantId() tenantId: string) {
    return this.service.getCompanySettings(tenantId);
  }

  @Patch('company-settings')
  @ApiOperation({ summary: 'Update company profile' })
  updateCompanySettings(@TenantId() tenantId: string, @Body() dto: UpdateCompanyDto) {
    return this.service.updateCompanySettings(tenantId, dto);
  }

  @Post('company-settings/logo')
  @ApiOperation({ summary: 'Upload company logo' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  uploadLogo(@TenantId() tenantId: string, @UploadedFile() file: Express.Multer.File) {
    return this.service.uploadCompanyLogo(tenantId, file);
  }

  @Get('tenant-settings')
  @ApiOperation({ summary: 'Get GST, invoice, and UPI settings' })
  getTenantSettings(@TenantId() tenantId: string) {
    return this.service.getTenantSettings(tenantId);
  }

  @Patch('tenant-settings')
  @ApiOperation({ summary: 'Update GST, invoice, and UPI settings' })
  updateTenantSettings(@TenantId() tenantId: string, @Body() dto: UpdateSettingsDto) {
    return this.service.updateTenantSettings(tenantId, dto);
  }

  @Get('managers')
  @ApiOperation({ summary: 'List all managers' })
  listManagers(@TenantId() tenantId: string) {
    return this.service.listManagers(tenantId);
  }

  @Post('managers')
  @ApiOperation({ summary: 'Create a manager (plan limit enforced)' })
  createManager(@TenantId() tenantId: string, @Body() dto: CreateManagerDto) {
    return this.service.createManager(tenantId, dto);
  }

  @Patch('managers/:id')
  @ApiOperation({ summary: 'Update a manager' })
  updateManager(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateManagerDto,
  ) {
    return this.service.updateManager(tenantId, id, dto);
  }

  @Delete('managers/:id')
  @ApiOperation({ summary: 'Deactivate a manager' })
  deleteManager(@TenantId() tenantId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.deleteManager(tenantId, id);
  }

  @Get('reports/revenue')
  @ApiOperation({ summary: 'Revenue report' })
  @ApiQuery({ name: 'from', required: false, example: '2026-01-01' })
  @ApiQuery({ name: 'to', required: false, example: '2026-12-31' })
  getRevenueReport(
    @TenantId() tenantId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.getRevenueReport(tenantId, from, to);
  }

  @Get('reports/tickets')
  @ApiOperation({ summary: 'Ticket statistics report' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  getTicketReport(
    @TenantId() tenantId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.getTicketReport(tenantId, from, to);
  }

  @Get('reports/technicians')
  @ApiOperation({ summary: 'Technician performance report' })
  getTechnicianReport(@TenantId() tenantId: string) {
    return this.service.getTechnicianReport(tenantId);
  }
}
