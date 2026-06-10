import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PlanLimitService } from '../shared/plan-limit/plan-limit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { handlePrismaError } from '../common/utils/prisma-error.handler';
import { writeAuditLog } from '../common/utils/audit.helper';
import * as bcrypt from 'bcrypt';
import { UserRole, TicketStatus } from '@prisma/client';
import { TICKET_FORWARD_TRANSITIONS } from '../common/constants/ticket-status.constant';
import { CreateTechnicianDto, UpdateTechnicianDto, ResetTechnicianPasswordDto } from './dto/create-technician.dto';
import { AssignTechnicianDto, CloseTicketDto, TicketFilterDto } from './dto/assign-ticket.dto';
import {
  CreateCategoryDto, UpdateCategoryDto,
  CreateSubCategoryDto, UpdateSubCategoryDto,
  UpsertServiceChargeDto,
} from './dto/service-catalog.dto';

const SALT_ROUNDS = 10;

@Injectable()
export class ManagerService {
  private readonly logger = new Logger(ManagerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly planLimit: PlanLimitService,
    private readonly notifications: NotificationsService,
  ) {}

  async getDashboard(tenantId: string) {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const [totalTickets, newTickets, assignedTickets, inProgressTickets, pendingTickets,
             completedTickets, totalTechnicians, pendingPayments] =
        await Promise.all([
          this.prisma.ticket.count({ where: { tenantId } }),
          this.prisma.ticket.count({ where: { tenantId, status: 'NEW_TICKET' } }),
          this.prisma.ticket.count({ where: { tenantId, status: 'ASSIGNED' } }),
          this.prisma.ticket.count({ where: { tenantId, status: 'IN_PROGRESS' } }),
          this.prisma.ticket.count({ where: { tenantId, status: 'PENDING' } }),
          this.prisma.ticket.count({ where: { tenantId, status: 'TICKET_CLOSED' } }),
          this.prisma.technician.count({ where: { tenantId, isActive: true } }),
          this.prisma.payment.count({ where: { tenantId, status: 'PENDING' } }),
        ]);

      return {
        data: {
          totalTickets,
          newTickets,
          assignedTickets,
          inProgressTickets,
          pendingTickets,
          completedTickets,
          totalTechnicians,
          pendingPayments,
        },
      };
    } catch (error) {
      handlePrismaError(error, 'Dashboard');
    }
  }

  // ── Technicians ────────────────────────────────────────────────────────────

  async listTechnicians(tenantId: string) {
    try {
      const technicians = await this.prisma.technician.findMany({
        where: { tenantId },
        include: { _count: { select: { tickets: true, attendance: true } } },
        orderBy: { name: 'asc' },
      });
      return { data: technicians };
    } catch (error) {
      handlePrismaError(error, 'Technicians');
    }
  }

  async createTechnician(tenantId: string, dto: CreateTechnicianDto, actorId: string) {
    try {
      await this.planLimit.checkLimit(tenantId, 'technician');

      const existing = await this.prisma.user.findFirst({ where: { tenantId, email: dto.email } });
      if (existing) throw new ConflictException(`Email "${dto.email}" is already in use`);

      const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);

      const technician = await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: { tenantId, name: dto.name, email: dto.email, phone: dto.phone, passwordHash, role: UserRole.TECHNICIAN },
        });
        return tx.technician.create({
          data: { tenantId, userId: user.id, name: dto.name, email: dto.email, phone: dto.phone },
        });
      });

      this.logger.log(`Technician created: ${dto.email} in tenant ${tenantId}`);
      writeAuditLog(this.prisma, { tenantId, userId: actorId, action: 'CREATE', entity: 'Technician', entityId: technician.id, newValue: { name: technician.name, email: technician.email } });
      return { message: 'Technician created successfully', data: technician };
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      handlePrismaError(error, 'Technician');
    }
  }

  async getTechnician(tenantId: string, id: string) {
    try {
      const tech = await this.prisma.technician.findFirst({
        where: { id, tenantId },
        include: {
          user: { select: { email: true, isActive: true } },
          _count: { select: { tickets: true, attendance: true } },
        },
      });
      if (!tech) throw new NotFoundException(`Technician with ID "${id}" not found`);
      return { data: tech };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      handlePrismaError(error, 'Technician');
    }
  }

  async updateTechnician(tenantId: string, id: string, dto: UpdateTechnicianDto) {
    try {
      const tech = await this.prisma.technician.findFirst({ where: { id, tenantId } });
      if (!tech) throw new NotFoundException(`Technician with ID "${id}" not found`);

      const [updated] = await Promise.all([
        this.prisma.technician.update({ where: { id }, data: { name: dto.name, phone: dto.phone, isActive: dto.isActive } }),
        dto.isActive !== undefined
          ? this.prisma.user.update({ where: { id: tech.userId }, data: { isActive: dto.isActive } })
          : Promise.resolve(),
      ]);

      return { message: 'Technician updated successfully', data: updated };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      handlePrismaError(error, 'Technician');
    }
  }

  async deleteTechnician(tenantId: string, id: string) {
    try {
      const tech = await this.prisma.technician.findFirst({ where: { id, tenantId } });
      if (!tech) throw new NotFoundException(`Technician with ID "${id}" not found`);

      await Promise.all([
        this.prisma.technician.update({ where: { id }, data: { isActive: false } }),
        this.prisma.user.update({ where: { id: tech.userId }, data: { isActive: false } }),
      ]);

      return { message: 'Technician deactivated successfully' };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      handlePrismaError(error, 'Technician');
    }
  }

  async resetTechnicianPassword(tenantId: string, id: string, dto: ResetTechnicianPasswordDto, actorId: string) {
    try {
      const tech = await this.prisma.technician.findFirst({ where: { id, tenantId } });
      if (!tech) throw new NotFoundException(`Technician with ID "${id}" not found`);

      const passwordHash = await bcrypt.hash(dto.newPassword, SALT_ROUNDS);
      await this.prisma.user.update({ where: { id: tech.userId }, data: { passwordHash } });

      // Revoke all active sessions so the technician must log in with the new password
      await this.prisma.refreshToken.deleteMany({ where: { userId: tech.userId } });

      writeAuditLog(this.prisma, { tenantId, userId: actorId, action: 'RESET_PASSWORD', entity: 'Technician', entityId: id });
      this.logger.log(`Password reset for technician ${id} by actor ${actorId}`);
      return { message: 'Technician password reset successfully' };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      handlePrismaError(error, 'Technician');
    }
  }

  async getTechnicianLocation(tenantId: string, id: string) {
    try {
      const tech = await this.prisma.technician.findFirst({
        where: { id, tenantId },
        select: { id: true, name: true, currentLat: true, currentLng: true, updatedAt: true },
      });
      if (!tech) throw new NotFoundException(`Technician with ID "${id}" not found`);
      return { data: tech };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      handlePrismaError(error, 'Technician');
    }
  }

  async getTechnicianRoute(tenantId: string, id: string, date?: string) {
    try {
      const tech = await this.prisma.technician.findFirst({
        where: { id, tenantId },
        select: { id: true, name: true },
      });
      if (!tech) throw new NotFoundException(`Technician with ID "${id}" not found`);

      let dateFilter: Record<string, any> = {};
      if (date) {
        const start = new Date(date);
        start.setHours(0, 0, 0, 0);
        const end = new Date(date);
        end.setHours(23, 59, 59, 999);
        dateFilter = { timestamp: { gte: start, lte: end } };
      }

      const route = await this.prisma.technicianLocation.findMany({
        where: { technicianId: id, tenantId, ...dateFilter },
        orderBy: { timestamp: 'asc' },
        select: { latitude: true, longitude: true, timestamp: true },
      });

      return { data: { technician: tech, route } };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      handlePrismaError(error, 'TechnicianLocation');
    }
  }

  // ── Service Categories ─────────────────────────────────────────────────────

  async listCategories(tenantId: string) {
    try {
      const categories = await this.prisma.serviceCategory.findMany({
        where: { tenantId },
        include: { _count: { select: { subCategories: true } } },
        orderBy: { name: 'asc' },
      });
      return { data: categories };
    } catch (error) {
      handlePrismaError(error, 'Categories');
    }
  }

  async createCategory(tenantId: string, dto: CreateCategoryDto) {
    try {
      const category = await this.prisma.serviceCategory.create({ data: { tenantId, name: dto.name } });
      return { message: 'Category created successfully', data: category };
    } catch (error) {
      handlePrismaError(error, 'Category');
    }
  }

  async updateCategory(tenantId: string, id: string, dto: UpdateCategoryDto) {
    try {
      const cat = await this.prisma.serviceCategory.findFirst({ where: { id, tenantId } });
      if (!cat) throw new NotFoundException(`Category with ID "${id}" not found`);
      const updated = await this.prisma.serviceCategory.update({ where: { id }, data: dto });
      return { message: 'Category updated successfully', data: updated };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      handlePrismaError(error, 'Category');
    }
  }

  async deleteCategory(tenantId: string, id: string) {
    try {
      const cat = await this.prisma.serviceCategory.findFirst({ where: { id, tenantId } });
      if (!cat) throw new NotFoundException(`Category with ID "${id}" not found`);
      await this.prisma.serviceCategory.update({ where: { id }, data: { isActive: false } });
      return { message: 'Category deactivated successfully' };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      handlePrismaError(error, 'Category');
    }
  }

  // ── Sub Categories ─────────────────────────────────────────────────────────

  async listSubCategories(tenantId: string, categoryId?: string) {
    try {
      const subCategories = await this.prisma.serviceSubCategory.findMany({
        where: { tenantId, ...(categoryId && { categoryId }) },
        include: { category: true, serviceCharges: true },
        orderBy: { name: 'asc' },
      });
      return { data: subCategories };
    } catch (error) {
      handlePrismaError(error, 'SubCategories');
    }
  }

  async createSubCategory(tenantId: string, dto: CreateSubCategoryDto) {
    try {
      const cat = await this.prisma.serviceCategory.findFirst({ where: { id: dto.categoryId, tenantId } });
      if (!cat) throw new NotFoundException(`Category with ID "${dto.categoryId}" not found`);

      const sub = await this.prisma.serviceSubCategory.create({ data: { tenantId, categoryId: dto.categoryId, name: dto.name } });
      return { message: 'Sub-category created successfully', data: sub };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      handlePrismaError(error, 'SubCategory');
    }
  }

  async updateSubCategory(tenantId: string, id: string, dto: UpdateSubCategoryDto) {
    try {
      const sub = await this.prisma.serviceSubCategory.findFirst({ where: { id, tenantId } });
      if (!sub) throw new NotFoundException(`Sub-category with ID "${id}" not found`);
      const updated = await this.prisma.serviceSubCategory.update({ where: { id }, data: dto });
      return { message: 'Sub-category updated successfully', data: updated };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      handlePrismaError(error, 'SubCategory');
    }
  }

  async deleteSubCategory(tenantId: string, id: string) {
    try {
      const sub = await this.prisma.serviceSubCategory.findFirst({ where: { id, tenantId } });
      if (!sub) throw new NotFoundException(`Sub-category with ID "${id}" not found`);
      await this.prisma.serviceSubCategory.update({ where: { id }, data: { isActive: false } });
      return { message: 'Sub-category deactivated successfully' };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      handlePrismaError(error, 'SubCategory');
    }
  }

  async upsertServiceCharge(tenantId: string, subCategoryId: string, dto: UpsertServiceChargeDto) {
    try {
      const sub = await this.prisma.serviceSubCategory.findFirst({ where: { id: subCategoryId, tenantId } });
      if (!sub) throw new NotFoundException(`Sub-category with ID "${subCategoryId}" not found`);

      const charge = await this.prisma.serviceCharge.upsert({
        where: { subCategoryId },
        update: dto,
        create: { tenantId, subCategoryId, ...dto },
      });
      return { message: 'Service charge saved successfully', data: charge };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      handlePrismaError(error, 'ServiceCharge');
    }
  }

  // ── Customers ──────────────────────────────────────────────────────────────

  async listCustomers(tenantId: string, search?: string) {
    try {
      const customers = await this.prisma.customer.findMany({
        where: {
          tenantId,
          ...(search && {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search } },
              { email: { contains: search, mode: 'insensitive' } },
            ],
          }),
        },
        include: { _count: { select: { tickets: true } } },
        orderBy: { createdAt: 'desc' },
      });
      return { data: customers };
    } catch (error) {
      handlePrismaError(error, 'Customers');
    }
  }

  async getCustomerHistory(tenantId: string, customerId: string) {
    try {
      const customer = await this.prisma.customer.findFirst({
        where: { id: customerId, tenantId },
        include: {
          tickets: {
            include: { technician: true, feedback: true, payment: true, invoice: true },
            orderBy: { createdAt: 'desc' },
          },
        },
      });
      if (!customer) throw new NotFoundException(`Customer with ID "${customerId}" not found`);
      return { data: customer };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      handlePrismaError(error, 'Customer');
    }
  }

  // ── Tickets ────────────────────────────────────────────────────────────────

  async listTickets(tenantId: string, filter: TicketFilterDto) {
    try {
      const where: Record<string, unknown> = { tenantId };
      if (filter.status) where['status'] = filter.status;
      if (filter.technicianId) where['technicianId'] = filter.technicianId;
      if (filter.customerId) where['customerId'] = filter.customerId;
      if (filter.from || filter.to) {
        where['createdAt'] = {
          ...(filter.from && { gte: new Date(filter.from) }),
          ...(filter.to && { lte: new Date(filter.to) }),
        };
      }

      const tickets = await this.prisma.ticket.findMany({
        where,
        include: {
          customer: true,
          technician: true,
          subCategory: { include: { category: true } },
          _count: { select: { images: true } },
        },
        orderBy: { createdAt: 'desc' },
      });
      return { data: tickets };
    } catch (error) {
      handlePrismaError(error, 'Tickets');
    }
  }

  async getTicket(tenantId: string, id: string) {
    try {
      const ticket = await this.prisma.ticket.findFirst({
        where: { id, tenantId },
        include: {
          customer: true,
          technician: true,
          subCategory: { include: { category: true, serviceCharges: true } },
          images: true,
          statusLogs: { include: { changer: { select: { name: true, role: true } } }, orderBy: { changedAt: 'asc' } },
          payment: true,
          invoice: true,
          feedback: true,
        },
      });
      if (!ticket) throw new NotFoundException(`Ticket with ID "${id}" not found`);
      return { data: ticket };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      handlePrismaError(error, 'Ticket');
    }
  }

  async assignTechnician(tenantId: string, ticketId: string, dto: AssignTechnicianDto, actorId: string) {
    try {
      const ticket = await this.prisma.ticket.findFirst({ where: { id: ticketId, tenantId } });
      if (!ticket) throw new NotFoundException(`Ticket with ID "${ticketId}" not found`);

      const allowed = TICKET_FORWARD_TRANSITIONS[ticket.status] ?? [];
      if (!allowed.includes(TicketStatus.ASSIGNED)) {
        throw new BadRequestException(
          `Cannot assign technician to a ticket in "${ticket.status}" status`,
        );
      }

      const tech = await this.prisma.technician.findFirst({
        where: { id: dto.technicianId, tenantId, isActive: true },
      });
      if (!tech) throw new NotFoundException(`Technician with ID "${dto.technicianId}" not found`);

      const updated = await this.prisma.$transaction(async (tx) => {
        const t = await tx.ticket.update({
          where: { id: ticketId },
          data: {
            technicianId: dto.technicianId,
            status: TicketStatus.ASSIGNED,
            scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
          },
        });
        await tx.ticketStatusLog.create({
          data: { tenantId, ticketId, status: TicketStatus.ASSIGNED, changedBy: actorId, notes: `Assigned to ${tech.name}` },
        });
        return t;
      });

      void this.notifications.onTicketAssigned(tenantId, tech.userId, ticketId);
      writeAuditLog(this.prisma, { tenantId, userId: actorId, action: 'ASSIGN', entity: 'Ticket', entityId: ticketId, newValue: { technicianId: dto.technicianId, technicianName: tech.name } });

      return { message: 'Technician assigned successfully', data: updated };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) throw error;
      handlePrismaError(error, 'Ticket');
    }
  }

  async reassignTechnician(tenantId: string, ticketId: string, dto: AssignTechnicianDto, actorId: string) {
    try {
      const ticket = await this.prisma.ticket.findFirst({ where: { id: ticketId, tenantId } });
      if (!ticket) throw new NotFoundException(`Ticket with ID "${ticketId}" not found`);

      if (!['ASSIGNED', 'ACCEPTED'].includes(ticket.status)) {
        throw new BadRequestException('Can only reassign tickets in ASSIGNED or ACCEPTED status');
      }

      const tech = await this.prisma.technician.findFirst({
        where: { id: dto.technicianId, tenantId, isActive: true },
      });
      if (!tech) throw new NotFoundException(`Technician with ID "${dto.technicianId}" not found`);

      const updated = await this.prisma.$transaction(async (tx) => {
        const t = await tx.ticket.update({
          where: { id: ticketId },
          data: {
            technicianId: dto.technicianId,
            status: TicketStatus.ASSIGNED,
            scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : ticket.scheduledAt,
          },
        });
        await tx.ticketStatusLog.create({
          data: { tenantId, ticketId, status: TicketStatus.ASSIGNED, changedBy: actorId, notes: `Reassigned to ${tech.name}` },
        });
        return t;
      });

      writeAuditLog(this.prisma, { tenantId, userId: actorId, action: 'REASSIGN', entity: 'Ticket', entityId: ticketId, oldValue: { technicianId: ticket.technicianId }, newValue: { technicianId: dto.technicianId, technicianName: tech.name } });

      return { message: 'Ticket reassigned successfully', data: updated };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) throw error;
      handlePrismaError(error, 'Ticket');
    }
  }

  async closeTicket(tenantId: string, ticketId: string, dto: CloseTicketDto, actorId: string) {
    try {
      const ticket = await this.prisma.ticket.findFirst({ where: { id: ticketId, tenantId } });
      if (!ticket) throw new NotFoundException(`Ticket with ID "${ticketId}" not found`);

      if (ticket.status !== TicketStatus.INVOICE_GENERATED) {
        throw new BadRequestException('Ticket must be in INVOICE_GENERATED status before closing');
      }

      const updated = await this.prisma.$transaction(async (tx) => {
        const t = await tx.ticket.update({
          where: { id: ticketId },
          data: { status: TicketStatus.TICKET_CLOSED, closedAt: new Date() },
        });
        await tx.ticketStatusLog.create({
          data: { tenantId, ticketId, status: TicketStatus.TICKET_CLOSED, changedBy: actorId, notes: dto.notes },
        });
        return t;
      });

      const customer = await this.prisma.customer.findUnique({
        where: { id: updated.customerId },
        select: { userId: true },
      });
      if (customer) void this.notifications.onTicketStatusChanged(tenantId, customer.userId, 'TICKET_CLOSED', ticketId);
      writeAuditLog(this.prisma, { tenantId, userId: actorId, action: 'CLOSE', entity: 'Ticket', entityId: ticketId, newValue: { status: 'TICKET_CLOSED' } });

      return { message: 'Ticket closed successfully', data: updated };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) throw error;
      handlePrismaError(error, 'Ticket');
    }
  }

  async cancelTicket(tenantId: string, ticketId: string, reason: string, actorId: string) {
    try {
      const ticket = await this.prisma.ticket.findFirst({ where: { id: ticketId, tenantId } });
      if (!ticket) throw new NotFoundException(`Ticket with ID "${ticketId}" not found`);

      const nonCancellable: string[] = ['COMPLETED', 'INVOICE_GENERATED', 'TICKET_CLOSED', 'CANCELLED'];
      if (nonCancellable.includes(ticket.status)) {
        throw new BadRequestException(`Ticket in "${ticket.status}" status cannot be cancelled`);
      }

      await this.prisma.$transaction(async (tx) => {
        await tx.ticket.update({
          where: { id: ticketId },
          data: { status: 'CANCELLED' as any, technicianId: null },
        });
        await tx.ticketStatusLog.create({
          data: { tenantId, ticketId, status: 'CANCELLED' as any, changedBy: actorId, notes: `Cancelled: ${reason}` },
        });
      });

      const customer = await this.prisma.customer.findUnique({
        where: { id: ticket.customerId },
        select: { userId: true },
      });
      if (customer) void this.notifications.onTicketStatusChanged(tenantId, customer.userId, 'CANCELLED', ticketId);
      writeAuditLog(this.prisma, { tenantId, userId: actorId, action: 'CANCEL', entity: 'Ticket', entityId: ticketId, newValue: { status: 'CANCELLED', reason } });

      return { message: 'Ticket cancelled successfully' };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) throw error;
      handlePrismaError(error, 'Ticket');
    }
  }

  async listAttendance(tenantId: string, technicianId?: string, from?: string, to?: string) {
    try {
      const where: Record<string, unknown> = { tenantId };
      if (technicianId) where['technicianId'] = technicianId;
      if (from || to) {
        where['date'] = {
          ...(from && { gte: new Date(from) }),
          ...(to && { lte: new Date(to) }),
        };
      }

      const records = await this.prisma.attendance.findMany({
        where,
        include: { technician: { select: { id: true, name: true } } },
        orderBy: { date: 'desc' },
        take: 200,
      });
      return { data: records };
    } catch (error) {
      handlePrismaError(error, 'Attendance');
    }
  }

  async listFeedback(tenantId: string, from?: string, to?: string) {
    try {
      const where: Record<string, unknown> = { tenantId };
      if (from || to) {
        where['createdAt'] = {
          ...(from && { gte: new Date(from) }),
          ...(to && { lte: new Date(to) }),
        };
      }

      const feedback = await this.prisma.feedback.findMany({
        where,
        include: {
          customer: { select: { name: true } },
          ticket: { include: { subCategory: { include: { category: true } }, technician: { select: { name: true } } } },
        },
        orderBy: { createdAt: 'desc' },
      });
      return { data: feedback };
    } catch (error) {
      handlePrismaError(error, 'Feedback');
    }
  }

  async verifyPayment(tenantId: string, paymentId: string, actorId: string) {
    try {
      const payment = await this.prisma.payment.findFirst({ where: { id: paymentId, tenantId } });
      if (!payment) throw new NotFoundException(`Payment with ID "${paymentId}" not found`);

      if (payment.status !== 'COLLECTED') {
        throw new BadRequestException('Only COLLECTED payments can be verified');
      }

      const updated = await this.prisma.payment.update({
        where: { id: paymentId },
        data: { status: 'VERIFIED' },
      });

      await this.prisma.ticketStatusLog.create({
        data: {
          tenantId,
          ticketId: payment.ticketId,
          status: TicketStatus.INVOICE_GENERATED,
          changedBy: actorId,
          notes: 'Payment verified by manager',
        },
      });

      writeAuditLog(this.prisma, { tenantId, userId: actorId, action: 'VERIFY', entity: 'Payment', entityId: paymentId, newValue: { status: 'VERIFIED' } });

      return { message: 'Payment verified successfully', data: updated };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) throw error;
      handlePrismaError(error, 'Payment');
    }
  }

  async listPayments(tenantId: string, status?: string, from?: string, to?: string) {
    try {
      const where: Record<string, unknown> = { tenantId };
      if (status) where['status'] = status;
      if (from || to) {
        where['collectedAt'] = {
          ...(from && { gte: new Date(from) }),
          ...(to && { lte: new Date(to) }),
        };
      }

      const [payments, totalResult] = await Promise.all([
        this.prisma.payment.findMany({
          where,
          include: { ticket: { include: { customer: true } }, technician: true },
          orderBy: { collectedAt: 'desc' },
        }),
        this.prisma.payment.aggregate({ where: { ...where, status: 'VERIFIED' }, _sum: { amount: true } }),
      ]);

      return { data: { payments, totalVerified: Number(totalResult._sum.amount ?? 0) } };
    } catch (error) {
      handlePrismaError(error, 'Payments');
    }
  }

  // ── Invoices (Screens 8–10) ───────────────────────────────────────────────

  async listInvoices(
    tenantId: string,
    search?: string,
    status?: string,
    from?: string,
    to?: string,
  ) {
    try {
      const where: Record<string, any> = { tenantId };
      if (from || to) {
        where['generatedAt'] = {
          ...(from && { gte: new Date(from) }),
          ...(to   && { lte: new Date(to) }),
        };
      }
      if (status) where['payment'] = { status };
      if (search) {
        where['OR'] = [
          { invoiceNumber: { contains: search, mode: 'insensitive' } },
          { ticket: { ticketNumber: { contains: search, mode: 'insensitive' } } },
          { ticket: { customer: { name: { contains: search, mode: 'insensitive' } } } },
        ];
      }

      const invoices = await this.prisma.invoice.findMany({
        where,
        include: {
          ticket: {
            select: {
              ticketNumber: true,
              customer: { select: { name: true, phone: true } },
              subCategory: { include: { category: { select: { name: true } } } },
            },
          },
          payment: { select: { method: true, status: true, collectedAt: true, amount: true } },
        },
        orderBy: { generatedAt: 'desc' },
        take: 100,
      });

      return { data: invoices };
    } catch (error) {
      handlePrismaError(error, 'Invoice');
    }
  }

  async getInvoice(tenantId: string, invoiceId: string) {
    try {
      const invoice = await this.prisma.invoice.findFirst({
        where: { id: invoiceId, tenantId },
        include: {
          ticket: {
            include: {
              customer: { select: { name: true, phone: true, address: true, city: true } },
              technician: { select: { name: true, phone: true } },
              subCategory: { include: { category: { select: { name: true } } } },
            },
          },
          payment: true,
        },
      });
      if (!invoice) throw new NotFoundException(`Invoice "${invoiceId}" not found`);

      const [tenant, settings] = await Promise.all([
        this.prisma.tenant.findUnique({
          where: { id: tenantId },
          select: { companyName: true, email: true, phone: true, address: true, city: true, logoUrl: true },
        }),
        this.prisma.tenantSetting.findUnique({ where: { tenantId } }),
      ]);

      return { data: { invoice, tenant, settings } };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      handlePrismaError(error, 'Invoice');
    }
  }
}
