import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PLAN_LIMIT_KEY } from '../constants/roles.constant';
import { PlanLimitService } from '../../shared/plan-limit/plan-limit.service';
import { RequestWithUser } from '../types/request-with-user.type';

export type PlanResource = 'manager' | 'technician' | 'ticket' | 'storage';

export const CheckPlanLimit = (resource: PlanResource) =>
  import('@nestjs/common').then(({ SetMetadata }) => SetMetadata(PLAN_LIMIT_KEY, resource));

@Injectable()
export class PlanLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly planLimitService: PlanLimitService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const resource = this.reflector.get<PlanResource>(PLAN_LIMIT_KEY, context.getHandler());
    if (!resource) return true;

    const { user } = context.switchToHttp().getRequest<RequestWithUser>();
    if (!user?.tenantId) return true;

    try {
      await this.planLimitService.checkLimit(user.tenantId, resource);
      return true;
    } catch (error) {
      // Re-throw NestJS HTTP exceptions as-is; wrap anything unexpected
      if (
        error != null &&
        typeof (error as Record<string, unknown>)['getStatus'] === 'function'
      ) {
        throw error;
      }
      throw new ForbiddenException('Plan limit check failed');
    }
  }
}
