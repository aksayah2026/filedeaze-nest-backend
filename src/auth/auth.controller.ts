import { Controller, Post, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../common/types/jwt-payload.type';
import { SuperAdminLoginDto } from './dto/super-admin-login.dto';
import { TenantLoginDto } from './dto/tenant-login.dto';
import { TechnicianLoginDto } from './dto/technician-login.dto';
import { CustomerRegisterDto } from './dto/customer-register.dto';
import { CustomerLoginDto } from './dto/customer-login.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ResendOtpDto } from './dto/resend-otp.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { LogoutDto } from './dto/logout.dto';
import { ForgotPasswordDto, ResetPasswordDto } from './dto/forgot-password.dto';
import {
  CustomerForgotPasswordDto,
  VerifyForgotPasswordOtpDto,
  CustomerResetPasswordDto,
} from './dto/customer-forgot-password.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('super-admin/login')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Super Admin login' })
  superAdminLogin(@Body() dto: SuperAdminLoginDto) {
    return this.authService.superAdminLogin(dto);
  }

  @Public()
  @Post('tenant/:tenantCode/login')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Admin / Manager login (tenant-scoped by tenant code)' })
  tenantLogin(@Param('tenantCode') tenantCode: string, @Body() dto: TenantLoginDto) {
    return this.authService.tenantLogin(tenantCode, dto);
  }

  @Public()
  @Post('technician/login')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Technician login' })
  technicianLogin(@Body() dto: TechnicianLoginDto) {
    return this.authService.technicianLogin(dto);
  }

  @Public()
  @Post('customer/register')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Customer registration — sends OTP to email (account not created yet)' })
  customerRegister(@Body() dto: CustomerRegisterDto) {
    return this.authService.customerRegister(dto);
  }

  @Public()
  @Post('customer/verify-otp')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Verify email OTP — creates account and returns tokens on success' })
  verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyOtp(dto);
  }

  @Public()
  @Post('customer/resend-otp')
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @ApiOperation({ summary: 'Resend OTP — allowed once per 30 seconds, invalidates previous OTP' })
  resendOtp(@Body() dto: ResendOtpDto) {
    return this.authService.resendOtp(dto);
  }

  @Public()
  @Post('customer/login')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Customer login' })
  customerLogin(@Body() dto: CustomerLoginDto) {
    return this.authService.customerLogin(dto);
  }

  @Public()
  @Post('refresh')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: 'Refresh access token' })
  refreshToken(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshToken(dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @ApiOperation({ summary: 'Logout and invalidate refresh token' })
  logout(@CurrentUser() user: JwtPayload, @Body() dto: LogoutDto) {
    return this.authService.logout(user.sub, dto.refreshToken);
  }

  @Public()
  @Post('forgot-password')
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @ApiOperation({ summary: 'Request a password reset email (15-min token) — for Admin / Super Admin' })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Public()
  @Post('reset-password')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Reset password using token from email — for Admin / Super Admin' })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  // ── Customer Forgot Password — OTP flow ──────────────────────────────────────

  @Public()
  @Post('customer/forgot-password')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({
    summary: 'Customer forgot password — sends 6-digit OTP to registered email',
    description:
      'OTP expires in 5 minutes. Max 5 verification attempts. ' +
      '30-second cooldown between resend requests. ' +
      'Always returns the same message regardless of whether the email exists (anti-enumeration).',
  })
  customerForgotPassword(@Body() dto: CustomerForgotPasswordDto) {
    return this.authService.customerForgotPassword(dto);
  }

  @Public()
  @Post('customer/verify-forgot-password-otp')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({
    summary: 'Verify the forgot-password OTP — returns a resetToken valid for 15 minutes',
    description: 'Pass the resetToken to POST /auth/customer/reset-password to complete the flow.',
  })
  verifyForgotPasswordOtp(@Body() dto: VerifyForgotPasswordOtpDto) {
    return this.authService.verifyForgotPasswordOtp(dto);
  }

  @Public()
  @Post('customer/reset-password')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({
    summary: 'Reset customer password using the resetToken from OTP verification',
    description: 'Revokes all active sessions after a successful reset.',
  })
  customerResetPassword(@Body() dto: CustomerResetPasswordDto) {
    return this.authService.customerResetPassword(dto);
  }
}
