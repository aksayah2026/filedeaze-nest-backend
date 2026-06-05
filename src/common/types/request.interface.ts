import { Request } from 'express';
import { UserRole } from '@prisma/client';

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  tenantId?: string;
}

export interface RequestWithUser extends Request {
  user: JwtPayload;
  tenantId?: string;
}
