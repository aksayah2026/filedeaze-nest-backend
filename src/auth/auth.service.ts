import {
  Injectable,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { ResendService } from '../shared/resend/resend.service';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { UserRole } from '@prisma/client';
import { JwtPayload } from '../common/types/jwt-payload.type';
import { SuperAdminLoginDto } from './dto/super-admin-login.dto';
import { TenantLoginDto } from './dto/tenant-login.dto';
import { TechnicianLoginDto } from './dto/technician-login.dto';
import { CustomerRegisterDto } from './dto/customer-register.dto';
import { CustomerLoginDto } from './dto/customer-login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ForgotPasswordDto, ResetPasswordDto } from './dto/forgot-password.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ResendOtpDto } from './dto/resend-otp.dto';

const SALT_ROUNDS = 10;

const USER_SAFE_SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  isActive: true,
  tenantId: true,
  createdAt: true,
} as const;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly resend: ResendService,
  ) {}

  private buildTokens(payload: JwtPayload): { accessToken: string; refreshToken: string } {
    // Cast through unknown — expiresIn accepts StringValue (ms-branded) at the type level,
    // but any valid ms string ('15m', '7d') works at runtime.
    const accessExpiry = this.config.get<string>('JWT_EXPIRES_IN', '15m') as unknown as number;
    const refreshExpiry = this.config.get<string>('JWT_REFRESH_EXPIRES_IN', '7d') as unknown as number;

    const accessToken = this.jwtService.sign(payload, { expiresIn: accessExpiry });
    const refreshToken = this.jwtService.sign(payload, {
      secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: refreshExpiry,
    });
    return { accessToken, refreshToken };
  }

  private buildTokenResponse(accessToken: string, refreshToken: string) {
    const expiry = this.config.get<string>('JWT_EXPIRES_IN', '15m');
    const m = /^(\d+)(s|m|h|d)?$/.exec(expiry);
    let expiresIn = 900;
    if (m) {
      const val = parseInt(m[1], 10);
      expiresIn = m[2] === 's' ? val : m[2] === 'h' ? val * 3600 : m[2] === 'd' ? val * 86400 : val * 60;
    }
    return { accessToken, refreshToken, tokenType: 'Bearer', expiresIn };
  }

  private async persistRefreshToken(userId: string, token: string): Promise<void> {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    await this.prisma.refreshToken.create({ data: { userId, token, expiresAt } });
  }

  private async resolveActiveTenant(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Tenant not found');
    if (tenant.status !== 'ACTIVE') {
      throw new ForbiddenException('This tenant account is suspended or expired');
    }
    return tenant;
  }

  private async resolveActiveTenantByCode(tenantCode: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { tenantCode } });
    if (!tenant) throw new NotFoundException('Tenant not found');
    if (tenant.status !== 'ACTIVE') {
      throw new ForbiddenException('This tenant account is suspended or expired');
    }
    return tenant;
  }

  async superAdminLogin(dto: SuperAdminLoginDto) {
    try {
      const user = await this.prisma.user.findFirst({
        where: { email: dto.email, role: UserRole.SUPER_ADMIN },
      });

      if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
        throw new UnauthorizedException('Invalid email or password');
      }
      if (!user.isActive) throw new ForbiddenException('Account is disabled');

      const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role };
      const tokens = this.buildTokens(payload);
      await this.persistRefreshToken(user.id, tokens.refreshToken);

      this.logger.log(`Super admin logged in: ${user.email}`);
      return {
        message: 'Login successful',
        data: {
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            phone: user.phone ?? null,
            role: user.role,
            status: user.isActive ? 'ACTIVE' : 'INACTIVE',
          },
          tokens: this.buildTokenResponse(tokens.accessToken, tokens.refreshToken),
        },
      };
    } catch (error) {
      if (
        error instanceof UnauthorizedException ||
        error instanceof NotFoundException ||
        error instanceof BadRequestException ||
        error instanceof ForbiddenException ||
        error instanceof ConflictException ||
        error instanceof InternalServerErrorException
      ) throw error;
      throw new InternalServerErrorException((error as Error).message || 'Authentication failed');
    }
  }

  async tenantLogin(tenantCode: string, dto: TenantLoginDto) {
    try {
      const tenant = await this.resolveActiveTenantByCode(tenantCode);

      const user = await this.prisma.user.findFirst({
        where: { tenantId: tenant.id, email: dto.email, role: { in: [UserRole.ADMIN, UserRole.MANAGER] } },
      });

      if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
        throw new UnauthorizedException('Invalid email or password');
      }
      if (!user.isActive) throw new ForbiddenException('Account is disabled');

      const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role, tenantId: tenant.id };
      const tokens = this.buildTokens(payload);
      await this.persistRefreshToken(user.id, tokens.refreshToken);

      this.logger.log(`Tenant user logged in: ${user.email} [${tenant.tenantCode}]`);
      return {
        message: 'Login successful',
        data: {
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            phone: user.phone ?? null,
            role: user.role,
            tenantId: tenant.id,
            status: user.isActive ? 'ACTIVE' : 'INACTIVE',
          },
          tokens: this.buildTokenResponse(tokens.accessToken, tokens.refreshToken),
        },
      };
    } catch (error) {
      if (
        error instanceof UnauthorizedException ||
        error instanceof NotFoundException ||
        error instanceof BadRequestException ||
        error instanceof ForbiddenException ||
        error instanceof ConflictException ||
        error instanceof InternalServerErrorException
      ) throw error;
      throw new InternalServerErrorException((error as Error).message || 'Authentication failed');
    }
  }

  async technicianLogin(dto: TechnicianLoginDto) {
    try {
      const tenant = await this.resolveActiveTenant(dto.tenantId);

      const user = await this.prisma.user.findFirst({
        where: { tenantId: tenant.id, email: dto.email, role: UserRole.TECHNICIAN },
        include: { technician: { select: { id: true } } },
      });

      if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
        throw new UnauthorizedException('Invalid email or password');
      }
      if (!user.isActive) throw new ForbiddenException('Account is disabled');

      const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role, tenantId: tenant.id };
      const tokens = this.buildTokens(payload);
      await this.persistRefreshToken(user.id, tokens.refreshToken);

      return {
        message: 'Login successful',
        data: {
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            phone: user.phone ?? null,
            role: user.role,
            tenantId: tenant.id,
            technicianId: user.technician?.id ?? null,
            status: user.isActive ? 'ACTIVE' : 'INACTIVE',
          },
          tokens: this.buildTokenResponse(tokens.accessToken, tokens.refreshToken),
        },
      };
    } catch (error) {
      if (
        error instanceof UnauthorizedException ||
        error instanceof NotFoundException ||
        error instanceof BadRequestException ||
        error instanceof ForbiddenException ||
        error instanceof ConflictException ||
        error instanceof InternalServerErrorException
      ) throw error;
      throw new InternalServerErrorException((error as Error).message || 'Authentication failed');
    }
  }

  // ── OTP helpers ──────────────────────────────────────────────────────────────

  private generateOtp(): string {
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  private otpExpiresAt(): Date {
    return new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
  }

  private async invalidatePreviousOtps(tenantId: string, email: string): Promise<void> {
    await this.prisma.emailOtp.deleteMany({ where: { tenantId, email } });
  }

  // ── Customer Registration (OTP flow) ─────────────────────────────────────────

  async customerRegister(dto: CustomerRegisterDto) {
    try {
      if (dto.password !== dto.confirmPassword) {
        throw new BadRequestException('Passwords do not match');
      }

      const tenant = await this.resolveActiveTenant(dto.tenantId);

      const existing = await this.prisma.user.findFirst({
        where: { tenantId: tenant.id, email: dto.email, role: UserRole.CUSTOMER },
      });
      if (existing) throw new BadRequestException('An account with this email already exists');

      const otp = this.generateOtp();
      const [otpHash, passwordHash] = await Promise.all([
        bcrypt.hash(otp, SALT_ROUNDS),
        bcrypt.hash(dto.password, SALT_ROUNDS),
      ]);

      await this.invalidatePreviousOtps(tenant.id, dto.email);

      await this.prisma.emailOtp.create({
        data: {
          tenantId: tenant.id,
          email: dto.email,
          name: dto.name,
          passwordHash,
          phone: dto.phone,
          otpHash,
          expiresAt: this.otpExpiresAt(),
          lastSentAt: new Date(),
        },
      });

      await this.resend.sendOtpEmail(dto.email, dto.name, otp);
      this.logger.log(`OTP sent to ${dto.email} [tenant: ${tenant.tenantCode}]`);

      return { message: 'OTP sent to your email address. Please verify within 5 minutes.' };
    } catch (error) {
      if (
        error instanceof UnauthorizedException ||
        error instanceof NotFoundException ||
        error instanceof BadRequestException ||
        error instanceof ForbiddenException ||
        error instanceof ConflictException ||
        error instanceof InternalServerErrorException
      ) throw error;
      throw new InternalServerErrorException((error as Error).message || 'Authentication failed');
    }
  }

  async verifyOtp(dto: VerifyOtpDto) {
    try {
      const tenant = await this.resolveActiveTenant(dto.tenantId);

      const record = await this.prisma.emailOtp.findFirst({
        where: { tenantId: tenant.id, email: dto.email, isVerified: false },
        orderBy: { createdAt: 'desc' },
      });

      if (!record) {
        throw new BadRequestException('No pending verification found for this email. Please register first.');
      }

      if (record.attempts >= 5) {
        throw new BadRequestException('Maximum verification attempts exceeded. Please request a new OTP.');
      }

      await this.prisma.emailOtp.update({
        where: { id: record.id },
        data: { attempts: { increment: 1 } },
      });

      if (new Date() > record.expiresAt) {
        throw new BadRequestException('OTP has expired. Please request a new one.');
      }

      const otpValid = await bcrypt.compare(dto.otp, record.otpHash);
      if (!otpValid) {
        const remaining = 4 - record.attempts;
        throw new BadRequestException(
          remaining > 0
            ? `Invalid OTP. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
            : 'Invalid OTP. Maximum attempts exceeded. Please request a new OTP.',
        );
      }

      const alreadyRegistered = await this.prisma.user.findFirst({
        where: { tenantId: tenant.id, email: dto.email, role: UserRole.CUSTOMER },
      });
      if (alreadyRegistered) throw new BadRequestException('An account with this email already exists');

      const user = await this.prisma.$transaction(async (tx) => {
        const u = await tx.user.create({
          data: {
            tenantId: tenant.id,
            name: record.name,
            email: record.email,
            phone: record.phone ?? '',
            passwordHash: record.passwordHash,
            role: UserRole.CUSTOMER,
            isActive: true,
          },
          select: { ...USER_SAFE_SELECT, customer: { select: { id: true } } },
        });
        await tx.customer.create({
          data: { tenantId: tenant.id, userId: u.id, name: record.name, email: record.email, phone: record.phone },
        });
        await tx.emailOtp.update({ where: { id: record.id }, data: { isVerified: true } });
        return u;
      });

      const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role, tenantId: tenant.id };
      const tokens = this.buildTokens(payload);
      await this.persistRefreshToken(user.id, tokens.refreshToken);

      this.logger.log(`Customer registered via OTP: ${user.email} [tenant: ${tenant.tenantCode}]`);
      return {
        message: 'Email verified successfully. Welcome to FieldEaze!',
        data: {
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            phone: user.phone ?? null,
            role: user.role,
            tenantId: tenant.id,
            status: 'ACTIVE',
          },
          tokens: this.buildTokenResponse(tokens.accessToken, tokens.refreshToken),
        },
      };
    } catch (error) {
      if (
        error instanceof UnauthorizedException ||
        error instanceof NotFoundException ||
        error instanceof BadRequestException ||
        error instanceof ForbiddenException ||
        error instanceof ConflictException ||
        error instanceof InternalServerErrorException
      ) throw error;
      throw new InternalServerErrorException((error as Error).message || 'Authentication failed');
    }
  }

  async resendOtp(dto: ResendOtpDto) {
    try {
      const tenant = await this.resolveActiveTenant(dto.tenantId);

      const existing = await this.prisma.user.findFirst({
        where: { tenantId: tenant.id, email: dto.email, role: UserRole.CUSTOMER },
      });
      if (existing) throw new BadRequestException('An account with this email already exists');

      const last = await this.prisma.emailOtp.findFirst({
        where: { tenantId: tenant.id, email: dto.email, isVerified: false },
        orderBy: { createdAt: 'desc' },
      });

      if (!last) {
        throw new BadRequestException('No pending registration found. Please register first.');
      }

      const cooldownMs = 30 * 1000;
      const elapsed = Date.now() - new Date(last.lastSentAt).getTime();
      if (elapsed < cooldownMs) {
        const wait = Math.ceil((cooldownMs - elapsed) / 1000);
        throw new BadRequestException(`Please wait ${wait} seconds before requesting a new OTP.`);
      }

      const otp = this.generateOtp();
      const otpHash = await bcrypt.hash(otp, SALT_ROUNDS);

      await this.invalidatePreviousOtps(tenant.id, dto.email);

      await this.prisma.emailOtp.create({
        data: {
          tenantId: tenant.id,
          email: last.email,
          name: last.name,
          passwordHash: last.passwordHash,
          phone: last.phone,
          otpHash,
          expiresAt: this.otpExpiresAt(),
          lastSentAt: new Date(),
        },
      });

      await this.resend.sendOtpEmail(dto.email, last.name, otp);
      this.logger.log(`OTP resent to ${dto.email} [tenant: ${tenant.tenantCode}]`);

      return { message: 'A new OTP has been sent to your email address.' };
    } catch (error) {
      if (
        error instanceof UnauthorizedException ||
        error instanceof NotFoundException ||
        error instanceof BadRequestException ||
        error instanceof ForbiddenException ||
        error instanceof ConflictException ||
        error instanceof InternalServerErrorException
      ) throw error;
      throw new InternalServerErrorException((error as Error).message || 'Authentication failed');
    }
  }

  async customerLogin(dto: CustomerLoginDto) {
    try {
      const tenant = await this.resolveActiveTenant(dto.tenantId);

      if (!dto.phone && !dto.email) {
        throw new BadRequestException('Either phone or email is required');
      }

      const user = await this.prisma.user.findFirst({
        where: {
          tenantId: tenant.id,
          role: UserRole.CUSTOMER,
          ...(dto.phone ? { phone: dto.phone } : { email: dto.email }),
        },
        include: { customer: { select: { id: true } } },
      });

      if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
        throw new UnauthorizedException('Invalid credentials');
      }
      if (!user.isActive) throw new ForbiddenException('Account is disabled');

      const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role, tenantId: tenant.id };
      const tokens = this.buildTokens(payload);
      await this.persistRefreshToken(user.id, tokens.refreshToken);

      return {
        message: 'Login successful',
        data: {
          user: {
            id: user.id,
            name: user.name,
            email: user.email ?? null,
            phone: user.phone ?? null,
            role: user.role,
            tenantId: tenant.id,
            customerId: user.customer?.id ?? null,
            status: user.isActive ? 'ACTIVE' : 'INACTIVE',
          },
          tokens: this.buildTokenResponse(tokens.accessToken, tokens.refreshToken),
        },
      };
    } catch (error) {
      if (
        error instanceof UnauthorizedException ||
        error instanceof NotFoundException ||
        error instanceof BadRequestException ||
        error instanceof ForbiddenException ||
        error instanceof ConflictException ||
        error instanceof InternalServerErrorException
      ) throw error;
      throw new InternalServerErrorException((error as Error).message || 'Authentication failed');
    }
  }

  async refreshToken(dto: RefreshTokenDto) {
    try {
      let payload: JwtPayload;
      try {
        payload = this.jwtService.verify<JwtPayload>(dto.refreshToken, {
          secret: this.config.get<string>('JWT_REFRESH_SECRET'),
        });
      } catch {
        throw new UnauthorizedException('Refresh token is invalid or expired');
      }

      const stored = await this.prisma.refreshToken.findUnique({ where: { token: dto.refreshToken } });
      if (!stored || stored.expiresAt < new Date()) {
        throw new UnauthorizedException('Refresh token has expired. Please log in again');
      }

      await this.prisma.refreshToken.delete({ where: { token: dto.refreshToken } });

      const newPayload: JwtPayload = { sub: payload.sub, email: payload.email, role: payload.role, tenantId: payload.tenantId };
      const tokens = this.buildTokens(newPayload);
      await this.persistRefreshToken(payload.sub, tokens.refreshToken);

      return {
        message: 'Token refreshed successfully',
        data: { tokens: this.buildTokenResponse(tokens.accessToken, tokens.refreshToken) },
      };
    } catch (error) {
      if (
        error instanceof UnauthorizedException ||
        error instanceof NotFoundException ||
        error instanceof BadRequestException ||
        error instanceof ForbiddenException ||
        error instanceof ConflictException ||
        error instanceof InternalServerErrorException
      ) throw error;
      throw new InternalServerErrorException((error as Error).message || 'Authentication failed');
    }
  }

  async logout(userId: string, refreshToken?: string): Promise<{ message: string }> {
    try {
      if (refreshToken) {
        await this.prisma.refreshToken.deleteMany({ where: { token: refreshToken } });
      } else {
        await this.prisma.refreshToken.deleteMany({ where: { userId } });
      }
      return { message: 'Logged out successfully' };
    } catch (error) {
      if (
        error instanceof UnauthorizedException ||
        error instanceof NotFoundException ||
        error instanceof BadRequestException ||
        error instanceof ForbiddenException ||
        error instanceof ConflictException ||
        error instanceof InternalServerErrorException
      ) throw error;
      throw new InternalServerErrorException((error as Error).message || 'Authentication failed');
    }
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<{ message: string }> {
    try {
      let user: { id: string; email: string; name: string } | null = null;

      if (dto.tenantId) {
        const tenant = await this.prisma.tenant.findUnique({ where: { id: dto.tenantId } });
        if (tenant) {
          user = await this.prisma.user.findFirst({
            where: { tenantId: tenant.id, email: dto.email, isActive: true },
            select: { id: true, email: true, name: true },
          });
        }
      } else {
        user = await this.prisma.user.findFirst({
          where: { email: dto.email, role: UserRole.SUPER_ADMIN, isActive: true },
          select: { id: true, email: true, name: true },
        });
      }

      // Always return the same message to prevent email enumeration
      const SAFE_MSG = 'If that email exists, reset instructions have been sent';
      if (!user) return { message: SAFE_MSG };

      const token = randomBytes(32).toString('hex');
      const expiry = new Date(Date.now() + 15 * 60 * 1000); // 15 min

      await this.prisma.user.update({
        where: { id: user.id },
        data: { resetToken: token, resetTokenExpiry: expiry },
      });

      const appUrl = this.config.get<string>('APP_URL', 'https://app.fieldeaze.com');
      const resetUrl = `${appUrl}/reset-password?token=${token}`;
      const deepLink = `fieldeaze://reset-password?token=${token}`;

      await this.resend.sendEmail(
        user.email,
        'Reset Your FieldEaze Password',
        `<h2>Password Reset Request</h2>
         <p>Hi ${user.name},</p>
         <p>We received a request to reset your password. This link expires in 15 minutes.</p>
         <p><a href="${resetUrl}" style="background:#4F46E5;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;">Reset Password</a></p>
         <p>Or open in the mobile app: <a href="${deepLink}">${deepLink}</a></p>
         <p>If you did not request this, ignore this email.</p>`,
      );

      this.logger.log(`Password reset token sent to: ${user.email}`);
      return { message: SAFE_MSG };
    } catch (error) {
      if (
        error instanceof UnauthorizedException ||
        error instanceof NotFoundException ||
        error instanceof BadRequestException ||
        error instanceof ForbiddenException ||
        error instanceof ConflictException ||
        error instanceof InternalServerErrorException
      ) throw error;
      throw new InternalServerErrorException((error as Error).message || 'Authentication failed');
    }
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    try {
      const user = await this.prisma.user.findFirst({
        where: { resetToken: dto.token, resetTokenExpiry: { gt: new Date() } },
      });
      if (!user) throw new BadRequestException('Invalid or expired reset token');

      const passwordHash = await bcrypt.hash(dto.newPassword, SALT_ROUNDS);
      await this.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash, resetToken: null, resetTokenExpiry: null },
      });

      // Invalidate all refresh tokens for security
      await this.prisma.refreshToken.deleteMany({ where: { userId: user.id } });

      this.logger.log(`Password reset for user: ${user.email}`);
      return { message: 'Password reset successfully. Please log in with your new password.' };
    } catch (error) {
      if (
        error instanceof UnauthorizedException ||
        error instanceof NotFoundException ||
        error instanceof BadRequestException ||
        error instanceof ForbiddenException ||
        error instanceof ConflictException ||
        error instanceof InternalServerErrorException
      ) throw error;
      throw new InternalServerErrorException((error as Error).message || 'Authentication failed');
    }
  }
}
