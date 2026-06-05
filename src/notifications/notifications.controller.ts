import { Controller, Get, Post, Delete, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { CurrentUser, TenantId } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../common/types/jwt-payload.type';
import { ParseUUIDPipe } from '../common/pipes/parse-uuid.pipe';

class RegisterDeviceTokenDto {
  @ApiProperty({ example: 'fcm-token-xyz...' })
  @IsString()
  token: string;

  @ApiPropertyOptional({ example: 'ANDROID', enum: ['ANDROID', 'IOS', 'WEB'] })
  @IsOptional()
  @IsString()
  platform?: string;
}

@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('mobile/notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Get my notifications' })
  getNotifications(@TenantId() tenantId: string, @CurrentUser() user: JwtPayload) {
    return this.notificationsService.getUserNotifications(tenantId, user.sub);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get unread notification count' })
  async getUnreadCount(@TenantId() tenantId: string, @CurrentUser() user: JwtPayload) {
    const count = await this.notificationsService.getUnreadCount(tenantId, user.sub);
    return { data: { count } };
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark notification as read' })
  async markAsRead(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.notificationsService.markAsRead(tenantId, user.sub, id);
    return { message: 'Notification marked as read' };
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Mark all notifications as read' })
  async markAllAsRead(@TenantId() tenantId: string, @CurrentUser() user: JwtPayload) {
    await this.notificationsService.markAllAsRead(tenantId, user.sub);
    return { message: 'All notifications marked as read' };
  }

  // ── Device Tokens ─────────────────────────────────────────────────────────

  @Post('device-token')
  @ApiOperation({ summary: 'Register FCM device token for push notifications' })
  registerDeviceToken(
    @TenantId() tenantId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: RegisterDeviceTokenDto,
  ) {
    return this.notificationsService.registerDeviceToken(tenantId, user.sub, dto.token, dto.platform ?? 'ANDROID');
  }

  @Delete('device-token/:token')
  @ApiOperation({ summary: 'Unregister a device token (on logout)' })
  unregisterDeviceToken(@CurrentUser() user: JwtPayload, @Param('token') token: string) {
    return this.notificationsService.unregisterDeviceToken(user.sub, token);
  }
}
