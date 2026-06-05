import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { handlePrismaError } from '../../common/utils/prisma-error.handler';
import { PlanName } from '@prisma/client';

type LimitableResource = 'manager' | 'technician' | 'ticket' | 'storage';

const PLAN_LIMITS: Record<PlanName, Record<LimitableResource, number>> = {
  [PlanName.STARTER]: { manager: 1, technician: 5, ticket: 200, storage: 5 },
  [PlanName.PROFESSIONAL]: { manager: 5, technician: 25, ticket: 1000, storage: 25 },
  [PlanName.ENTERPRISE]: { manager: Infinity, technician: Infinity, ticket: Infinity, storage: Infinity },
};

@Injectable()
export class PlanLimitService {
  constructor(private prisma: PrismaService) {}

  async getActivePlan(tenantId: string) {
    try {
      const subscription = await this.prisma.subscription.findFirst({
        where: { tenantId, status: 'ACTIVE' },
        include: { plan: true },
        orderBy: { endDate: 'desc' },
      });
      return subscription?.plan ?? null;
    } catch (error) {
      handlePrismaError(error, 'Subscription');
    }
  }

  async checkLimit(tenantId: string, resource: LimitableResource): Promise<void> {
    try {
      const plan = await this.getActivePlan(tenantId);
      if (!plan) throw new ForbiddenException('No active subscription found');

      const limits = PLAN_LIMITS[plan.name];
      const limit = limits[resource];

      if (limit === Infinity) return;

      const current = await this.getCurrentUsage(tenantId, resource);

      if (current >= limit) {
        throw new ForbiddenException(
          `Plan limit exceeded. Please upgrade. (${resource}: ${current}/${limit})`,
        );
      }
    } catch (error) {
      if (error instanceof ForbiddenException) throw error;
      handlePrismaError(error, 'PlanLimit');
    }
  }

  private async getCurrentUsage(tenantId: string, resource: LimitableResource): Promise<number> {
    switch (resource) {
      case 'manager':
        return this.prisma.user.count({
          where: { tenantId, role: 'MANAGER', isActive: true },
        });

      case 'technician':
        return this.prisma.technician.count({
          where: { tenantId, isActive: true },
        });

      case 'ticket': {
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);
        return this.prisma.ticket.count({
          where: { tenantId, createdAt: { gte: startOfMonth } },
        });
      }

      case 'storage':
        return 0;

      default:
        return 0;
    }
  }

  async getPlanUsage(tenantId: string) {
    try {
      const plan = await this.getActivePlan(tenantId);
      if (!plan) return null;

      const limits = PLAN_LIMITS[plan.name];

      const [managers, technicians, tickets] = await Promise.all([
        this.getCurrentUsage(tenantId, 'manager'),
        this.getCurrentUsage(tenantId, 'technician'),
        this.getCurrentUsage(tenantId, 'ticket'),
      ]);

      return {
        plan: plan.name,
        usage: {
          managers: { current: managers, limit: limits.manager === Infinity ? 'Unlimited' : limits.manager },
          technicians: { current: technicians, limit: limits.technician === Infinity ? 'Unlimited' : limits.technician },
          tickets: { current: tickets, limit: limits.ticket === Infinity ? 'Unlimited' : limits.ticket },
          storage: { current: 0, limit: limits.storage === Infinity ? 'Unlimited' : `${limits.storage}GB` },
        },
      };
    } catch (error) {
      handlePrismaError(error, 'PlanUsage');
    }
  }
}
