import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FirebaseService } from '../shared/firebase/firebase.service';
import { handlePrismaError } from '../common/utils/prisma-error.handler';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly firebase: FirebaseService,
  ) {}

  // ── Core send helper used by other modules ────────────────────────────────

  async notifyUser(
    tenantId: string,
    userId: string,
    title: string,
    body: string,
    type: string,
    data?: Record<string, string>,
  ): Promise<void> {
    try {
      await this.prisma.notification.create({ data: { tenantId, userId, title, body, type } });

      const tokens = await this.prisma.deviceToken.findMany({
        where: { userId },
        select: { token: true },
      });

      if (tokens.length > 0) {
        const fcmTokens = tokens.map((t) => t.token);
        await this.firebase.sendMulticast(fcmTokens, title, body, data);
      }

      this.logger.log(`Notified user ${userId}: ${title}`);
    } catch (err) {
      this.logger.error(`notifyUser failed for ${userId}: ${(err as Error).message}`);
    }
  }

  // Legacy single-token send (kept for backwards compatibility)
  async sendAndPersist(
    tenantId: string,
    userId: string,
    title: string,
    body: string,
    type: string,
    fcmToken?: string,
    data?: Record<string, string>,
  ): Promise<void> {
    try {
      await this.prisma.notification.create({ data: { tenantId, userId, title, body, type } });
      if (fcmToken) await this.firebase.sendPushNotification(fcmToken, title, body, data);
      this.logger.log(`Notification sent to user ${userId}: ${title}`);
    } catch (error) {
      this.logger.error(`sendAndPersist failed for ${userId}: ${(error as Error).message}`);
      // Do NOT re-throw — notification failure must never crash ticket operations
    }
  }

  // ── Ticket event notifications ────────────────────────────────────────────

  async onTicketRaised(tenantId: string, _customerId: string): Promise<void> {
    try {
      // Notify all managers/admins of the tenant
      const managers = await this.prisma.user.findMany({
        where: { tenantId, role: { in: ['ADMIN', 'MANAGER'] }, isActive: true },
        select: { id: true },
      });
      await Promise.all(
        managers.map((m) =>
          this.notifyUser(tenantId, m.id, 'New Ticket Raised', 'A customer has raised a new service ticket.', 'TICKET_RAISED'),
        ),
      );
    } catch (error) {
      this.logger.error(`onTicketRaised failed: ${(error as Error).message}`);
      // Do NOT re-throw — notification failure must never crash ticket operations
    }
  }

  async onTicketAssigned(tenantId: string, technicianUserId: string, ticketId: string): Promise<void> {
    try {
      await this.notifyUser(
        tenantId, technicianUserId,
        'New Ticket Assigned',
        `You have been assigned a new service ticket. Ticket #${ticketId.slice(-6).toUpperCase()}.`,
        'TICKET_ASSIGNED',
        { ticketId },
      );
    } catch (error) {
      this.logger.error(`onTicketAssigned failed: ${(error as Error).message}`);
      // Do NOT re-throw — notification failure must never crash ticket operations
    }
  }

  async onTicketStatusChanged(tenantId: string, customerUserId: string, status: string, ticketId: string): Promise<void> {
    try {
      const messages: Record<string, { title: string; body: string }> = {
        ACCEPTED: { title: 'Technician Accepted', body: 'Your technician has accepted the job and will arrive soon.' },
        TRAVELLING: { title: 'Technician En Route', body: 'Your technician is on the way to your location.' },
        REACHED_LOCATION: { title: 'Technician Arrived', body: 'Your technician has arrived at your location.' },
        IN_PROGRESS: { title: 'Work Started', body: 'The technician has started working on your ticket.' },
        PENDING: { title: 'Ticket On Hold', body: 'Your ticket is temporarily on hold. The technician will update you soon.' },
        COMPLETED: { title: 'Work Completed', body: 'The technician has completed the job. Please confirm and proceed with payment.' },
        INVOICE_GENERATED: { title: 'Invoice Ready', body: 'Your invoice has been generated. Please check your invoices section.' },
        TICKET_CLOSED: { title: 'Ticket Closed', body: 'Your service ticket has been closed. Please share your feedback!' },
        CANCELLED: { title: 'Ticket Cancelled', body: 'Your service ticket has been cancelled.' },
        REJECTED: { title: 'Technician Unavailable', body: "Your technician couldn't accept the job. We're finding a new one for you." },
      };

      const msg = messages[status];
      if (!msg) return;

      await this.notifyUser(tenantId, customerUserId, msg.title, msg.body, `TICKET_${status}`, { ticketId });
    } catch (error) {
      this.logger.error(`onTicketStatusChanged failed: ${(error as Error).message}`);
      // Do NOT re-throw — notification failure must never crash ticket operations
    }
  }

  private async notifyManagers(tenantId: string, title: string, body: string, type: string, data?: Record<string, string>): Promise<void> {
    const managers = await this.prisma.user.findMany({
      where: { tenantId, role: { in: ['ADMIN', 'MANAGER'] }, isActive: true },
      select: { id: true },
    });
    await Promise.all(
      managers.map((m) => this.notifyUser(tenantId, m.id, title, body, type, data)),
    );
  }

  async onTicketRejectedByTechnician(
    tenantId: string,
    ticketId: string,
    technicianName: string,
    reason: string,
  ): Promise<void> {
    try {
      await this.notifyManagers(
        tenantId,
        'Ticket Rejected by Technician',
        `${technicianName} rejected ticket #${ticketId.slice(-6).toUpperCase()}. Reason: ${reason}`,
        'TICKET_REJECTED',
        { ticketId },
      );
    } catch (error) {
      this.logger.error(`onTicketRejectedByTechnician failed: ${(error as Error).message}`);
    }
  }

  async onTicketMarkedPending(
    tenantId: string,
    ticketId: string,
    technicianName: string,
    reason: string,
  ): Promise<void> {
    try {
      await this.notifyManagers(
        tenantId,
        'Ticket Marked as Pending',
        `${technicianName} put ticket #${ticketId.slice(-6).toUpperCase()} on hold. Reason: ${reason}`,
        'TICKET_PENDING',
        { ticketId },
      );
    } catch (error) {
      this.logger.error(`onTicketMarkedPending failed: ${(error as Error).message}`);
    }
  }

  // ── Device Token Management ───────────────────────────────────────────────

  async registerDeviceToken(tenantId: string, userId: string, token: string, platform: string) {
    try {
      const existing = await this.prisma.deviceToken.findUnique({ where: { token } });
      if (existing) {
        if (existing.userId !== userId) {
          // Token reassigned to new user (device transferred) — update owner
          await this.prisma.deviceToken.update({ where: { token }, data: { userId, tenantId, platform } });
        }
        return { message: 'Device token registered', data: existing };
      }

      const deviceToken = await this.prisma.deviceToken.create({
        data: { tenantId, userId, token, platform },
      });
      return { message: 'Device token registered', data: deviceToken };
    } catch (error) {
      handlePrismaError(error, 'Notification');
    }
  }

  async unregisterDeviceToken(userId: string, token: string) {
    try {
      const existing = await this.prisma.deviceToken.findFirst({ where: { token, userId } });
      if (!existing) throw new NotFoundException('Device token not found');

      await this.prisma.deviceToken.delete({ where: { id: existing.id } });
      return { message: 'Device token removed' };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      handlePrismaError(error, 'Notification');
    }
  }

  // ── User notification queries ─────────────────────────────────────────────

  async getUserNotifications(tenantId: string, userId: string) {
    try {
      return this.prisma.notification.findMany({
        where: { tenantId, userId },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
    } catch (error) {
      handlePrismaError(error, 'Notification');
    }
  }

  async markAsRead(tenantId: string, userId: string, notificationId: string): Promise<void> {
    try {
      await this.prisma.notification.updateMany({
        where: { id: notificationId, tenantId, userId },
        data: { isRead: true },
      });
    } catch (error) {
      handlePrismaError(error, 'Notification');
    }
  }

  async markAllAsRead(tenantId: string, userId: string): Promise<void> {
    try {
      await this.prisma.notification.updateMany({
        where: { tenantId, userId, isRead: false },
        data: { isRead: true },
      });
    } catch (error) {
      handlePrismaError(error, 'Notification');
    }
  }

  async getUnreadCount(tenantId: string, userId: string): Promise<number> {
    try {
      return this.prisma.notification.count({ where: { tenantId, userId, isRead: false } });
    } catch (error) {
      handlePrismaError(error, 'Notification');
    }
  }
}
