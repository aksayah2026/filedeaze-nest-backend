import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { handlePrismaError } from '../common/utils/prisma-error.handler';
import * as bcrypt from 'bcrypt';
import { UserRole, TenantStatus, PlanName } from '@prisma/client';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto, UpdateTenantStatusDto } from './dto/update-tenant.dto';
import { CreatePlanDto, UpdatePlanDto, AssignSubscriptionDto, RenewSubscriptionDto } from './dto/subscription.dto';
import { CreateSuperAdminDto } from './dto/create-super-admin.dto';

const SALT_ROUNDS = 10;

@Injectable()
export class SuperAdminService {
  private readonly logger = new Logger(SuperAdminService.name);

  constructor(private readonly prisma: PrismaService) {}

  async setupSuperAdmin(dto: CreateSuperAdminDto) {
    try {
      // Only works when NO super admin exists in the system yet
      const anyExists = await this.prisma.user.findFirst({
        where: { role: UserRole.SUPER_ADMIN },
      });
      if (anyExists) {
        throw new ConflictException(
          'A super admin already exists. Use POST /web/super-admin/create-super-admin with an existing super admin token.',
        );
      }

      const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);

      const user = await this.prisma.user.create({
        data: {
          tenantId: 'system',
          name: dto.name,
          email: dto.email,
          passwordHash,
          role: UserRole.SUPER_ADMIN,
        },
        select: { id: true, name: true, email: true, role: true, createdAt: true },
      });

      this.logger.log(`Initial super admin created: ${user.email}`);
      return { message: 'Super admin created successfully. Please login and change your password.', data: user };
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      handlePrismaError(error, 'SuperAdmin');
    }
  }

  async createSuperAdmin(dto: CreateSuperAdminDto) {
    try {
      const existing = await this.prisma.user.findFirst({
        where: { email: dto.email, role: UserRole.SUPER_ADMIN },
      });
      if (existing) throw new ConflictException(`A super admin with email "${dto.email}" already exists`);

      const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);

      const user = await this.prisma.user.create({
        data: {
          tenantId: 'system',
          name: dto.name,
          email: dto.email,
          passwordHash,
          role: UserRole.SUPER_ADMIN,
        },
        select: { id: true, name: true, email: true, role: true, createdAt: true },
      });

      this.logger.log(`Super admin created: ${user.email}`);
      return { message: 'Super admin created successfully', data: user };
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      handlePrismaError(error, 'SuperAdmin');
    }
  }

  async getDashboard() {
    try {
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      const [
        totalTenants,
        activeTenants,
        expiredTenants,
        suspendedTenants,
        totalRevenueResult,
        monthlyRevenueResult,
        activeSubscriptions,
        activeUsers,
      ] = await Promise.all([
        this.prisma.tenant.count(),
        this.prisma.tenant.count({ where: { status: TenantStatus.ACTIVE } }),
        this.prisma.tenant.count({ where: { status: TenantStatus.EXPIRED } }),
        this.prisma.tenant.count({ where: { status: TenantStatus.SUSPENDED } }),
        this.prisma.billing.aggregate({ where: { status: 'PAID' }, _sum: { amount: true } }),
        this.prisma.billing.aggregate({
          where: { status: 'PAID', paidAt: { gte: monthStart } },
          _sum: { amount: true },
        }),
        this.prisma.subscription.count({ where: { status: 'ACTIVE' } }),
        this.prisma.user.count({ where: { isActive: true, role: { not: UserRole.SUPER_ADMIN } } }),
      ]);

      return {
        data: {
          totalTenants,
          activeTenants,
          expiredTenants,
          suspendedTenants,
          totalRevenue: Number(totalRevenueResult._sum.amount ?? 0),
          monthlyRevenue: Number(monthlyRevenueResult._sum.amount ?? 0),
          activeSubscriptions,
          activeUsers,
        },
      };
    } catch (error) {
      handlePrismaError(error, 'Dashboard');
    }
  }

  async createTenant(dto: CreateTenantDto) {
    try {
      const [codeExists, emailExists, adminEmailExists] = await Promise.all([
        this.prisma.tenant.findUnique({ where: { tenantCode: dto.tenantCode } }),
        this.prisma.tenant.findUnique({ where: { email: dto.email } }),
        this.prisma.user.findFirst({ where: { email: dto.adminEmail, role: UserRole.ADMIN } }),
      ]);

      if (codeExists) throw new ConflictException(`Tenant code "${dto.tenantCode}" is already taken`);
      if (emailExists) throw new ConflictException(`Company email "${dto.email}" is already registered`);
      if (adminEmailExists) throw new ConflictException(`Admin email "${dto.adminEmail}" is already in use`);

      const passwordHash = await bcrypt.hash(dto.adminPassword, SALT_ROUNDS);

      const tenant = await this.prisma.$transaction(async (tx) => {
        const t = await tx.tenant.create({
          data: {
            companyName: dto.companyName,
            tenantCode: dto.tenantCode.toLowerCase().trim(),
            email: dto.email,
            phone: dto.phone,
            address: dto.address,
          },
        });

        await tx.user.create({
          data: {
            tenantId: t.id,
            name: dto.adminName,
            email: dto.adminEmail,
            passwordHash,
            role: UserRole.ADMIN,
          },
        });

        await tx.tenantSetting.create({ data: { tenantId: t.id } });

        if (dto.plan) {
          const plan = await tx.subscriptionPlan.findUnique({ where: { name: dto.plan } });
          if (plan) {
            const startDate = new Date();
            const endDate = new Date();
            endDate.setFullYear(endDate.getFullYear() + 1);
            await tx.subscription.create({
              data: { tenantId: t.id, planId: plan.id, startDate, endDate },
            });
          }
        }

        return t;
      });

      this.logger.log(`Tenant created: ${tenant.tenantCode}`);
      return { message: 'Tenant created successfully', data: tenant };
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      handlePrismaError(error, 'Tenant');
    }
  }

  async deleteTenant(id: string) {
    try {
      const tenant = await this.prisma.tenant.findUnique({ where: { id } });
      if (!tenant) throw new NotFoundException(`Tenant with ID "${id}" not found`);

      await this.prisma.$transaction(async (tx) => {
        // Deactivate all users of this tenant
        await tx.user.updateMany({
          where: { tenantId: id },
          data: { isActive: false },
        });

        // Cancel all active subscriptions
        await tx.subscription.updateMany({
          where: { tenantId: id, status: 'ACTIVE' },
          data: { status: 'CANCELLED' },
        });

        // Mark tenant as suspended
        await tx.tenant.update({
          where: { id },
          data: { status: TenantStatus.SUSPENDED },
        });
      });

      this.logger.log(`Tenant deleted: ${tenant.tenantCode}`);
      return { message: `Tenant "${tenant.companyName}" has been deleted and all users deactivated` };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      handlePrismaError(error, 'Tenant');
    }
  }

  async listTenants(status?: TenantStatus, plan?: PlanName) {
    try {
      const tenants = await this.prisma.tenant.findMany({
        where: { ...(status && { status }) },
        include: {
          subscriptions: {
            where: { status: 'ACTIVE' },
            include: { plan: true },
            orderBy: { endDate: 'desc' },
            take: 1,
          },
          _count: { select: { subscriptions: true } },
        },
        orderBy: { createdAt: 'desc' },
      });

      const filtered = plan
        ? tenants.filter((t) => t.subscriptions[0]?.plan?.name === plan)
        : tenants;

      return { data: filtered };
    } catch (error) {
      handlePrismaError(error, 'Tenants');
    }
  }

  async getTenant(id: string) {
    try {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id },
        include: {
          subscriptions: { include: { plan: true }, orderBy: { createdAt: 'desc' } },
          billings: { orderBy: { createdAt: 'desc' }, take: 10 },
        },
      });
      if (!tenant) throw new NotFoundException(`Tenant with ID "${id}" not found`);
      return { data: tenant };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      handlePrismaError(error, 'Tenant');
    }
  }

  async updateTenant(id: string, dto: UpdateTenantDto) {
    try {
      await this.getTenant(id);
      const tenant = await this.prisma.tenant.update({ where: { id }, data: dto });
      return { message: 'Tenant updated successfully', data: tenant };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      handlePrismaError(error, 'Tenant');
    }
  }

  async updateTenantStatus(id: string, dto: UpdateTenantStatusDto) {
    try {
      await this.getTenant(id);
      const tenant = await this.prisma.tenant.update({ where: { id }, data: { status: dto.status } });
      this.logger.log(`Tenant ${id} status changed to ${dto.status}`);
      return { message: `Tenant status updated to ${dto.status}`, data: tenant };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      handlePrismaError(error, 'Tenant');
    }
  }

  async listPlans() {
    try {
      const plans = await this.prisma.subscriptionPlan.findMany({ orderBy: { price: 'asc' } });
      return { data: plans };
    } catch (error) {
      handlePrismaError(error, 'Plans');
    }
  }

  async createPlan(dto: CreatePlanDto) {
    try {
      const exists = await this.prisma.subscriptionPlan.findUnique({ where: { name: dto.name } });
      if (exists) throw new ConflictException(`Plan "${dto.name}" already exists`);
      const plan = await this.prisma.subscriptionPlan.create({ data: dto });
      return { message: 'Plan created successfully', data: plan };
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      handlePrismaError(error, 'Plan');
    }
  }

  async updatePlan(id: string, dto: UpdatePlanDto) {
    try {
      const plan = await this.prisma.subscriptionPlan.update({ where: { id }, data: dto }).catch(() => {
        throw new NotFoundException(`Plan with ID "${id}" not found`);
      });
      return { message: 'Plan updated successfully', data: plan };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      handlePrismaError(error, 'Plan');
    }
  }

  async assignSubscription(dto: AssignSubscriptionDto) {
    try {
      await this.prisma.subscription.updateMany({
        where: { tenantId: dto.tenantId, status: 'ACTIVE' },
        data: { status: 'CANCELLED' },
      });

      const subscription = await this.prisma.subscription.create({
        data: {
          tenantId: dto.tenantId,
          planId: dto.planId,
          startDate: new Date(dto.startDate),
          endDate: new Date(dto.endDate),
          status: 'ACTIVE',
        },
        include: { plan: true },
      });

      return { message: 'Subscription assigned successfully', data: subscription };
    } catch (error) {
      handlePrismaError(error, 'Subscription');
    }
  }

  async renewSubscription(id: string, dto: RenewSubscriptionDto) {
    try {
      const subscription = await this.prisma.subscription
        .update({ where: { id }, data: { endDate: new Date(dto.endDate), status: 'ACTIVE' } })
        .catch(() => { throw new NotFoundException(`Subscription with ID "${id}" not found`); });
      return { message: 'Subscription renewed successfully', data: subscription };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      handlePrismaError(error, 'Subscription');
    }
  }

  async getActivityLogs(page = 1, limit = 50, userId?: string, entity?: string) {
    try {
      const skip = (page - 1) * limit;
      const where: Record<string, unknown> = {};
      if (userId) where['userId'] = userId;
      if (entity) where['entity'] = { contains: entity, mode: 'insensitive' };

      const [logs, total] = await Promise.all([
        this.prisma.auditLog.findMany({
          where,
          include: { user: { select: { name: true, email: true, role: true, tenantId: true } } },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        this.prisma.auditLog.count({ where }),
      ]);

      return { data: { logs, total, page, limit, totalPages: Math.ceil(total / limit) } };
    } catch (error) {
      handlePrismaError(error, 'AuditLog');
    }
  }

  async getBillingReport() {
    try {
      const [billings, paidResult, pendingResult] = await Promise.all([
        this.prisma.billing.findMany({
          include: { tenant: true, subscription: { include: { plan: true } } },
          orderBy: { createdAt: 'desc' },
          take: 100,
        }),
        this.prisma.billing.aggregate({ where: { status: 'PAID' }, _sum: { amount: true } }),
        this.prisma.billing.aggregate({ where: { status: 'PENDING' }, _sum: { amount: true } }),
      ]);

      return {
        data: {
          billings,
          summary: {
            totalPaid: Number(paidResult._sum.amount ?? 0),
            totalPending: Number(pendingResult._sum.amount ?? 0),
          },
        },
      };
    } catch (error) {
      handlePrismaError(error, 'BillingReport');
    }
  }
}
