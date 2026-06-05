import { Injectable, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { Observable, firstValueFrom } from 'rxjs';
import { IS_PUBLIC_KEY } from '../../common/constants/roles.constant';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      // On public routes: if a Bearer token is present, still run the JWT
      // strategy so @TenantId() and @CurrentUser() are populated. Silently
      // swallow any auth failure — the request always proceeds.
      const request = context.switchToHttp().getRequest<{ headers: { authorization?: string } }>();
      if (request.headers.authorization) {
        try {
          const result = super.canActivate(context);
          if (result instanceof Observable) {
            await firstValueFrom(result);
          } else {
            await result;
          }
        } catch {
          // Invalid / expired token on a public route — still allow request
        }
      }
      return true;
    }

    return super.canActivate(context) as Promise<boolean>;
  }
}
