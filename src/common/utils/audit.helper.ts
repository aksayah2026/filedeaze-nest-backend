import { PrismaService } from '../../prisma/prisma.service';

interface AuditParams {
  tenantId: string;
  userId: string;
  action: string;
  entity: string;
  entityId: string;
  oldValue?: Record<string, any>;
  newValue?: Record<string, any>;
}

export function writeAuditLog(prisma: PrismaService, params: AuditParams): void {
  void prisma.auditLog
    .create({
      data: {
        tenantId:  params.tenantId,
        userId:    params.userId,
        action:    params.action,
        entity:    params.entity,
        entityId:  params.entityId,
        oldValue:  params.oldValue ?? undefined,
        newValue:  params.newValue ?? undefined,
      },
    })
    .catch(() => {
      // Audit log failure must never crash business operations
    });
}
