import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PlanLimitService } from '../shared/plan-limit/plan-limit.service';
import { UploadService } from '../upload/upload.service';
import { handlePrismaError } from '../common/utils/prisma-error.handler';
import * as bcrypt from 'bcrypt';
import { UserRole } from '@prisma/client';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { CreateManagerDto, UpdateManagerDto } from './dto/create-manager.dto';

const SALT_ROUNDS = 10;

const MANAGER_SAFE_SELECT = {
  id: true,
  tenantId: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  isActive: true,
  profileImageUrl: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly planLimit: PlanLimitService,
    private readonly uploadService: UploadService,
  ) {}

  async getDashboard(tenantId: string) {
    try {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const [totalTickets, openTickets, closedTickets, totalTechnicians, totalCustomers, revenueResult, planUsage] =
        await Promise.all([
          this.prisma.ticket.count({ where: { tenantId } }),
          this.prisma.ticket.count({
            where: { tenantId, status: { notIn: ['TICKET_CLOSED', 'INVOICE_GENERATED', 'CANCELLED'] } },
          }),
          this.prisma.ticket.count({ where: { tenantId, status: 'TICKET_CLOSED' } }),
          this.prisma.technician.count({ where: { tenantId, isActive: true } }),
          this.prisma.customer.count({ where: { tenantId } }),
          this.prisma.payment.aggregate({
            where: { tenantId, status: 'VERIFIED', collectedAt: { gte: startOfMonth } },
            _sum: { amount: true },
          }),
          this.planLimit.getPlanUsage(tenantId),
        ]);

      return {
        data: {
          totalTickets,
          openTickets,
          closedTickets,
          totalTechnicians,
          totalCustomers,
          monthlyRevenue: Number(revenueResult._sum.amount ?? 0),
          planUsage,
        },
      };
    } catch (error) {
      handlePrismaError(error, 'Dashboard');
    }
  }

  async getCompanySettings(tenantId: string) {
    try {
      const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
      if (!tenant) throw new NotFoundException('Tenant not found');
      return { data: tenant };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      handlePrismaError(error, 'Tenant');
    }
  }

  async updateCompanySettings(tenantId: string, dto: UpdateCompanyDto) {
    try {
      const tenant = await this.prisma.tenant.update({ where: { id: tenantId }, data: dto });
      return { message: 'Company settings updated successfully', data: tenant };
    } catch (error) {
      handlePrismaError(error, 'Tenant');
    }
  }

  async uploadCompanyLogo(tenantId: string, file: Express.Multer.File) {
    try {
      if (!file) throw new BadRequestException('No file provided');
      const { url } = await this.uploadService.uploadTenantLogo(tenantId, file);
      const tenant = await this.prisma.tenant.update({
        where: { id: tenantId },
        data: { logoUrl: url },
      });
      return { message: 'Logo uploaded successfully', data: { logoUrl: tenant.logoUrl } };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      handlePrismaError(error, 'Tenant');
    }
  }

  async getTenantSettings(tenantId: string) {
    try {
      const settings = await this.prisma.tenantSetting.findUnique({ where: { tenantId } });
      if (!settings) throw new NotFoundException('Tenant settings not configured');
      return { data: settings };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      handlePrismaError(error, 'TenantSettings');
    }
  }

  async updateTenantSettings(tenantId: string, dto: UpdateSettingsDto) {
    try {
      const settings = await this.prisma.tenantSetting.upsert({
        where: { tenantId },
        update: dto,
        create: { tenantId, ...dto },
      });
      return { message: 'Settings updated successfully', data: settings };
    } catch (error) {
      handlePrismaError(error, 'TenantSettings');
    }
  }

  async listManagers(tenantId: string) {
    try {
      const managers = await this.prisma.user.findMany({
        where: { tenantId, role: UserRole.MANAGER },
        select: MANAGER_SAFE_SELECT,
        orderBy: { createdAt: 'desc' },
      });
      return { data: managers };
    } catch (error) {
      handlePrismaError(error, 'Managers');
    }
  }

  async createManager(tenantId: string, dto: CreateManagerDto) {
    try {
      await this.planLimit.checkLimit(tenantId, 'manager');

      const existing = await this.prisma.user.findFirst({ where: { tenantId, email: dto.email } });
      if (existing) throw new ConflictException(`Email "${dto.email}" is already in use`);

      const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
      const manager = await this.prisma.user.create({
        data: { tenantId, name: dto.name, email: dto.email, phone: dto.phone, passwordHash, role: UserRole.MANAGER },
        select: MANAGER_SAFE_SELECT,
      });

      this.logger.log(`Manager created: ${manager.email} in tenant ${tenantId}`);
      return { message: 'Manager created successfully', data: manager };
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      handlePrismaError(error, 'Manager');
    }
  }

  async updateManager(tenantId: string, managerId: string, dto: UpdateManagerDto) {
    try {
      const manager = await this.prisma.user.findFirst({
        where: { id: managerId, tenantId, role: UserRole.MANAGER },
      });
      if (!manager) throw new NotFoundException(`Manager with ID "${managerId}" not found`);

      const updated = await this.prisma.user.update({
        where: { id: managerId },
        data: dto,
        select: MANAGER_SAFE_SELECT,
      });
      return { message: 'Manager updated successfully', data: updated };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      handlePrismaError(error, 'Manager');
    }
  }

  async deleteManager(tenantId: string, managerId: string) {
    try {
      const manager = await this.prisma.user.findFirst({
        where: { id: managerId, tenantId, role: UserRole.MANAGER },
      });
      if (!manager) throw new NotFoundException(`Manager with ID "${managerId}" not found`);

      await this.prisma.user.update({ where: { id: managerId }, data: { isActive: false } });
      return { message: 'Manager deactivated successfully', data: null };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      handlePrismaError(error, 'Manager');
    }
  }

  async getRevenueReport(tenantId: string, from?: string, to?: string) {
    try {
      const dateFilter = this.buildDateFilter(from, to, 'collectedAt');
      const where = { tenantId, status: 'VERIFIED' as const, ...dateFilter };

      const [payments, totalResult, byMethod] = await Promise.all([
        this.prisma.payment.findMany({
          where,
          include: { ticket: { include: { customer: true } } },
          orderBy: { collectedAt: 'desc' },
          take: 100,
        }),
        this.prisma.payment.aggregate({ where, _sum: { amount: true } }),
        this.prisma.payment.groupBy({ by: ['method'], where, _sum: { amount: true } }),
      ]);

      return { data: { payments, total: Number(totalResult._sum.amount ?? 0), byMethod } };
    } catch (error) {
      handlePrismaError(error, 'RevenueReport');
    }
  }

  async getTicketReport(tenantId: string, from?: string, to?: string) {
    try {
      const where = { tenantId, ...this.buildDateFilter(from, to, 'createdAt') };

      const [byStatus, total] = await Promise.all([
        this.prisma.ticket.groupBy({ by: ['status'], where, _count: true }),
        this.prisma.ticket.count({ where }),
      ]);

      return { data: { total, byStatus } };
    } catch (error) {
      handlePrismaError(error, 'TicketReport');
    }
  }

  async getTechnicianReport(tenantId: string) {
    try {
      const technicians = await this.prisma.technician.findMany({
        where: { tenantId },
        include: {
          _count: { select: { tickets: true, attendance: true } },
        },
        orderBy: { name: 'asc' },
      });
      return { data: technicians };
    } catch (error) {
      handlePrismaError(error, 'TechnicianReport');
    }
  }

  private buildDateFilter(
    from?: string,
    to?: string,
    field: string = 'createdAt',
  ): Record<string, unknown> {
    if (!from && !to) return {};
    return {
      [field]: {
        ...(from && { gte: new Date(from) }),
        ...(to && { lte: new Date(to) }),
      },
    };
  }
}
