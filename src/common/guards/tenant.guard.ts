import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { IS_PUBLIC_KEY } from '../constants/roles.constant';
import { RequestWithUser } from '../types/request-with-user.type';

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const { user } = request;

    if (!user) throw new UnauthorizedException('Authentication required');
    if (user.role === UserRole.SUPER_ADMIN) return true;

    if (!user.tenantId) {
      throw new ForbiddenException('Tenant context is missing from token');
    }

    request.tenantId = user.tenantId;
    return true;
  }
}
