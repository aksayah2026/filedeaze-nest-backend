import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';
import { InvoiceService } from '../invoice/invoice.service';
import { NotificationsService } from '../notifications/notifications.service';
import { handlePrismaError } from '../common/utils/prisma-error.handler';
import { TicketStatus, ImageType, PaymentStatus } from '@prisma/client';
import { TICKET_FORWARD_TRANSITIONS } from '../common/constants/ticket-status.constant';
import { CheckInDto, UpdateLocationDto } from './dto/checkin.dto';
import { UpdateTicketStatusDto, MarkPendingDto, RejectTicketDto } from './dto/update-ticket-status.dto';
import { CompleteTicketDto, CollectPaymentDto } from './dto/complete-job.dto';

@Injectable()
export class TechnicianService {
  private readonly logger = new Logger(TechnicianService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly uploadService: UploadService,
    private readonly invoiceService: InvoiceService,
    private readonly notifications: NotificationsService,
  ) {}

  private async getCustomerUserId(ticketId: string): Promise<string | null> {
    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { customer: { select: { userId: true } } },
    });
    return ticket?.customer?.userId ?? null;
  }

  private async resolveTechnician(userId: string, tenantId: string) {
    const tech = await this.prisma.technician.findFirst({ where: { userId, tenantId } });
    if (!tech) throw new NotFoundException('Technician profile not found');
    return tech;
  }

  private async resolveTicketForTechnician(ticketId: string, tenantId: string, technicianId: string) {
    const ticket = await this.prisma.ticket.findFirst({
      where: { id: ticketId, tenantId, technicianId },
    });
    if (!ticket) throw new NotFoundException('Ticket not found or not assigned to you');
    return ticket;
  }

  // ── Attendance ─────────────────────────────────────────────────────────────

  async checkIn(tenantId: string, userId: string, dto: CheckInDto) {
    try {
      const tech = await this.resolveTechnician(userId, tenantId);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const existing = await this.prisma.attendance.findFirst({
        where: { technicianId: tech.id, date: today },
      });
      if (existing) throw new ConflictException('You have already checked in today');

      const [attendance] = await Promise.all([
        this.prisma.attendance.create({
          data: { tenantId, technicianId: tech.id, checkInTime: new Date(), checkInLat: dto.lat, checkInLng: dto.lng, date: today },
        }),
        this.prisma.technician.update({ where: { id: tech.id }, data: { currentLat: dto.lat, currentLng: dto.lng } }),
      ]);

      this.logger.log(`Technician ${tech.id} checked in at ${dto.lat},${dto.lng}`);
      return { message: 'Checked in successfully', data: attendance };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ConflictException) throw error;
      handlePrismaError(error, 'Attendance');
    }
  }

  async checkOut(tenantId: string, userId: string, dto: CheckInDto) {
    try {
      const tech = await this.resolveTechnician(userId, tenantId);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const attendance = await this.prisma.attendance.findFirst({
        where: { technicianId: tech.id, date: today, checkOutTime: null },
      });
      if (!attendance) throw new NotFoundException('No active check-in found for today');

      const [updated] = await Promise.all([
        this.prisma.attendance.update({
          where: { id: attendance.id },
          data: { checkOutTime: new Date(), checkOutLat: dto.lat, checkOutLng: dto.lng },
        }),
        this.prisma.technician.update({ where: { id: tech.id }, data: { currentLat: dto.lat, currentLng: dto.lng } }),
      ]);

      return { message: 'Checked out successfully', data: updated };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      handlePrismaError(error, 'Attendance');
    }
  }

  async getAttendanceHistory(tenantId: string, userId: string) {
    try {
      const tech = await this.resolveTechnician(userId, tenantId);
      const records = await this.prisma.attendance.findMany({
        where: { technicianId: tech.id, tenantId },
        orderBy: { date: 'desc' },
        take: 30,
      });
      return { data: records };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      handlePrismaError(error, 'Attendance');
    }
  }

  async updateLocation(tenantId: string, userId: string, dto: UpdateLocationDto) {
    try {
      const tech = await this.resolveTechnician(userId, tenantId);
      await this.prisma.technician.update({ where: { id: tech.id }, data: { currentLat: dto.lat, currentLng: dto.lng } });
      return { message: 'Location updated successfully' };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      handlePrismaError(error, 'Technician');
    }
  }

  // ── Tickets ────────────────────────────────────────────────────────────────

  async listMyTickets(tenantId: string, userId: string) {
    try {
      const tech = await this.resolveTechnician(userId, tenantId);

      const tickets = await this.prisma.ticket.findMany({
        where: { tenantId, technicianId: tech.id, status: { not: TicketStatus.TICKET_CLOSED } },
        include: {
          customer: true,
          subCategory: { include: { category: true } },
          _count: { select: { images: true } },
        },
        orderBy: { updatedAt: 'desc' },
      });
      return { data: tickets };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      handlePrismaError(error, 'Tickets');
    }
  }

  async getTicket(tenantId: string, userId: string, ticketId: string) {
    try {
      const tech = await this.resolveTechnician(userId, tenantId);

      const ticket = await this.prisma.ticket.findFirst({
        where: { id: ticketId, tenantId, technicianId: tech.id },
        include: {
          customer: true,
          subCategory: { include: { category: true, serviceCharges: true } },
          images: true,
          statusLogs: { orderBy: { changedAt: 'asc' } },
          payment: true,
        },
      });
      if (!ticket) throw new NotFoundException('Ticket not found');
      return { data: ticket };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      handlePrismaError(error, 'Ticket');
    }
  }

  async updateTicketStatus(tenantId: string, userId: string, ticketId: string, dto: UpdateTicketStatusDto) {
    try {
      const tech = await this.resolveTechnician(userId, tenantId);
      const ticket = await this.resolveTicketForTechnician(ticketId, tenantId, tech.id);

      const allowed = TICKET_FORWARD_TRANSITIONS[ticket.status] ?? [];
      if (!allowed.includes(dto.status)) {
        throw new BadRequestException(
          `Cannot transition ticket from "${ticket.status}" to "${dto.status}"`,
        );
      }

      if (dto.status === TicketStatus.PENDING && !dto.pendingReason) {
        throw new BadRequestException('A pending reason is required when marking a ticket as pending');
      }

      const updated = await this.prisma.$transaction(async (tx) => {
        const t = await tx.ticket.update({
          where: { id: ticketId },
          data: {
            status: dto.status,
            ...(dto.status === TicketStatus.PENDING && {
              pendingReason: dto.pendingReason,
              pendingNotes: dto.notes,
            }),
          },
        });
        await tx.ticketStatusLog.create({
          data: { tenantId, ticketId, status: dto.status, changedBy: userId, notes: dto.notes },
        });
        return t;
      });

      const customerUserId = await this.getCustomerUserId(ticketId);
      if (customerUserId) void this.notifications.onTicketStatusChanged(tenantId, customerUserId, dto.status, ticketId);

      return { message: `Ticket status updated to ${dto.status}`, data: updated };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) throw error;
      handlePrismaError(error, 'Ticket');
    }
  }

  async completeTicket(tenantId: string, userId: string, ticketId: string, dto: CompleteTicketDto) {
    try {
      const tech = await this.resolveTechnician(userId, tenantId);
      const ticket = await this.resolveTicketForTechnician(ticketId, tenantId, tech.id);

      if (ticket.status !== TicketStatus.IN_PROGRESS) {
        throw new BadRequestException('Ticket must be IN_PROGRESS to be completed');
      }

      const images = await this.prisma.ticketImage.findMany({ where: { ticketId, tenantId } });
      const hasBefore = images.some((i) => i.type === ImageType.BEFORE);
      const hasAfter = images.some((i) => i.type === ImageType.AFTER);

      if (!hasBefore || !hasAfter) {
        throw new BadRequestException('Both before and after photos must be uploaded before completing the ticket');
      }

      await this.prisma.$transaction(async (tx) => {
        if (dto.customerSignature) {
          await tx.ticketImage.create({
            data: { tenantId, ticketId, imageUrl: dto.customerSignature, type: ImageType.SIGNATURE },
          });
        }
        await tx.ticket.update({ where: { id: ticketId }, data: { status: TicketStatus.COMPLETED } });
        await tx.ticketStatusLog.create({
          data: { tenantId, ticketId, status: TicketStatus.COMPLETED, changedBy: userId, notes: dto.notes },
        });
      });

      const customerUserId = await this.getCustomerUserId(ticketId);
      if (customerUserId) void this.notifications.onTicketStatusChanged(tenantId, customerUserId, 'COMPLETED', ticketId);

      return { message: 'Ticket marked as completed' };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) throw error;
      handlePrismaError(error, 'Ticket');
    }
  }

  async markPending(tenantId: string, userId: string, ticketId: string, dto: MarkPendingDto) {
    try {
      const tech = await this.resolveTechnician(userId, tenantId);
      const ticket = await this.resolveTicketForTechnician(ticketId, tenantId, tech.id);

      if (ticket.status !== TicketStatus.IN_PROGRESS) {
        throw new BadRequestException('Ticket must be IN_PROGRESS to be marked as pending');
      }

      await this.prisma.$transaction(async (tx) => {
        await tx.ticket.update({
          where: { id: ticketId },
          data: { status: TicketStatus.PENDING, pendingReason: dto.reason, pendingNotes: dto.notes },
        });
        await tx.ticketStatusLog.create({
          data: { tenantId, ticketId, status: TicketStatus.PENDING, changedBy: userId, notes: `${dto.reason}: ${dto.notes}` },
        });
      });

      return { message: 'Ticket marked as pending' };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) throw error;
      handlePrismaError(error, 'Ticket');
    }
  }

  async rejectTicket(tenantId: string, userId: string, ticketId: string, dto: RejectTicketDto) {
    try {
      const tech = await this.resolveTechnician(userId, tenantId);
      const ticket = await this.resolveTicketForTechnician(ticketId, tenantId, tech.id);

      if (!['ASSIGNED', 'ACCEPTED'].includes(ticket.status)) {
        throw new BadRequestException('Ticket can only be rejected when in ASSIGNED or ACCEPTED status');
      }

      await this.prisma.$transaction(async (tx) => {
        await tx.ticket.update({ where: { id: ticketId }, data: { status: TicketStatus.NEW_TICKET, technicianId: null } });
        await tx.ticketStatusLog.create({
          data: { tenantId, ticketId, status: TicketStatus.NEW_TICKET, changedBy: userId, notes: `Rejected: ${dto.reason}` },
        });
      });

      return { message: 'Ticket rejected and returned to the queue' };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) throw error;
      handlePrismaError(error, 'Ticket');
    }
  }

  async uploadImage(tenantId: string, userId: string, ticketId: string, type: ImageType, file: Express.Multer.File) {
    try {
      const tech = await this.resolveTechnician(userId, tenantId);
      await this.resolveTicketForTechnician(ticketId, tenantId, tech.id);

      const { url } = await this.uploadService.uploadTicketImage(tenantId, ticketId, file);
      const image = await this.prisma.ticketImage.create({ data: { tenantId, ticketId, imageUrl: url, type } });

      return { message: 'Image uploaded successfully', data: image };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      handlePrismaError(error, 'TicketImage');
    }
  }

  async collectPayment(tenantId: string, userId: string, ticketId: string, dto: CollectPaymentDto) {
    try {
      const tech = await this.resolveTechnician(userId, tenantId);
      const ticket = await this.resolveTicketForTechnician(ticketId, tenantId, tech.id);

      if (ticket.status !== TicketStatus.COMPLETED) {
        throw new BadRequestException('Ticket must be COMPLETED before collecting payment');
      }

      const existingPayment = await this.prisma.payment.findUnique({ where: { ticketId } });
      if (existingPayment) throw new ConflictException('Payment has already been recorded for this ticket');

      const invoiceData = await this.invoiceService.generateInvoiceData(tenantId, dto.amount);

      await this.prisma.$transaction(async (tx) => {
        const payment = await tx.payment.create({
          data: {
            tenantId, ticketId,
            amount: dto.amount,
            method: dto.method,
            status: PaymentStatus.COLLECTED,
            collectedAt: new Date(),
            confirmedBy: tech.id,
          },
        });

        await tx.invoice.create({
          data: { tenantId, ticketId, paymentId: payment.id, ...invoiceData },
        });

        await tx.ticket.update({ where: { id: ticketId }, data: { status: TicketStatus.INVOICE_GENERATED } });
        await tx.ticketStatusLog.create({
          data: { tenantId, ticketId, status: TicketStatus.INVOICE_GENERATED, changedBy: userId, notes: `Payment collected via ${dto.method}` },
        });
      });

      const customerUserId = await this.getCustomerUserId(ticketId);
      if (customerUserId) void this.notifications.onTicketStatusChanged(tenantId, customerUserId, 'INVOICE_GENERATED', ticketId);

      return { message: 'Payment collected and invoice generated successfully' };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException ||
        error instanceof ConflictException
      ) throw error;
      handlePrismaError(error, 'Payment');
    }
  }

  async getDashboard(tenantId: string, userId: string) {
    try {
      const tech = await this.resolveTechnician(userId, tenantId);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const [totalTickets, openTickets, todayTickets, completedTickets, todayAttendance] =
        await Promise.all([
          this.prisma.ticket.count({ where: { tenantId, technicianId: tech.id } }),
          this.prisma.ticket.count({
            where: { tenantId, technicianId: tech.id, status: { notIn: ['TICKET_CLOSED', 'INVOICE_GENERATED', 'COMPLETED'] } },
          }),
          this.prisma.ticket.count({ where: { tenantId, technicianId: tech.id, createdAt: { gte: today } } }),
          this.prisma.ticket.count({ where: { tenantId, technicianId: tech.id, status: 'TICKET_CLOSED' } }),
          this.prisma.attendance.findFirst({ where: { technicianId: tech.id, date: today } }),
        ]);

      return {
        data: {
          totalTickets,
          openTickets,
          todayTickets,
          completedTickets,
          isCheckedIn: !!todayAttendance && !todayAttendance.checkOutTime,
          checkInTime: todayAttendance?.checkInTime ?? null,
          checkOutTime: todayAttendance?.checkOutTime ?? null,
          rating: tech.rating,
          totalJobs: tech.totalJobs,
        },
      };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      handlePrismaError(error, 'Dashboard');
    }
  }

  async getProfile(tenantId: string, userId: string) {
    try {
      const tech = await this.prisma.technician.findFirst({
        where: { userId, tenantId },
        include: {
          user: { select: { email: true, isActive: true, createdAt: true } },
          _count: { select: { tickets: true, attendance: true } },
        },
      });
      if (!tech) throw new NotFoundException('Technician profile not found');
      return { data: tech };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      handlePrismaError(error, 'Technician');
    }
  }
}
