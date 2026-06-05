import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SettingsService, UpdateSettingsDto } from './settings.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { TenantId } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { UserRole } from '@prisma/client';

@ApiTags('Settings')
@Controller('web/settings')
export class SettingsController {
  constructor(private readonly service: SettingsService) {}

  @Public()
  @Get('charges')
  @ApiOperation({ summary: 'Get platform fee, tax, and discount settings' })
  getSettings(@TenantId() tenantId: string) {
    return this.service.getSettings(tenantId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post('charges')
  @ApiOperation({ summary: 'Create or update platform settings' })
  updateSettings(@TenantId() tenantId: string, @Body() dto: UpdateSettingsDto) {
    return this.service.updateSettings(tenantId, dto);
  }
}
