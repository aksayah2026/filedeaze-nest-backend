import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PlanLimitService } from '../shared/plan-limit/plan-limit.service';
import { UploadService } from '../upload/upload.service';
import { NotificationsService } from '../notifications/notifications.service';
import { handlePrismaError } from '../common/utils/prisma-error.handler';
import { writeAuditLog } from '../common/utils/audit.helper';
import { TicketStatus, ImageType } from '@prisma/client';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { SubmitFeedbackDto } from './dto/submit-feedback.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { CreateAddressDto, UpdateAddressDto } from './dto/address.dto';
import { CancelTicketDto } from './dto/cancel-ticket.dto';

@Injectable()
export class CustomerService {
  private readonly logger = new Logger(CustomerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly planLimit: PlanLimitService,
    private readonly uploadService: UploadService,
    private readonly notifications: NotificationsService,
  ) {}

  private async resolveCustomer(tenantId: string, userId: string) {
    const customer = await this.prisma.customer.findFirst({ where: { tenantId, userId } });
    if (!customer) throw new NotFoundException('Customer profile not found');
    return customer;
  }

  // ── Profile ───────────────────────────────────────────────────────────────

  async getProfile(tenantId: string, userId: string) {
    try {
      const customer = await this.prisma.customer.findFirst({
        where: { tenantId, userId },
        include: { _count: { select: { tickets: true, feedback: true } } },
      });
      if (!customer) throw new NotFoundException('Customer profile not found');
      return { data: customer };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      handlePrismaError(error, 'Customer');
    }
  }

  async updateProfile(tenantId: string, userId: string, dto: UpdateProfileDto) {
    try {
      const customer = await this.resolveCustomer(tenantId, userId);

      const [updatedCustomer] = await Promise.all([
        this.prisma.customer.update({
          where: { id: customer.id },
          data: {
            name: dto.name,
            email: dto.email,
            phone: dto.phone,
            alternatePhone: dto.alternatePhone,
            address: dto.address,
            city: dto.city,
            pincode: dto.pincode,
          },
        }),
        this.prisma.user.update({
          where: { id: userId },
          data: {
            ...(dto.name && { name: dto.name }),
            ...(dto.email && { email: dto.email }),
            ...(dto.phone && { phone: dto.phone }),
          },
        }),
      ]);

      return { message: 'Profile updated successfully', data: updatedCustomer };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      handlePrismaError(error, 'Customer');
    }
  }

  // ── Dashboard ─────────────────────────────────────────────────────────────

  async getDashboard(tenantId: string, userId: string) {
    try {
      const customer = await this.resolveCustomer(tenantId, userId);

      const [openTickets, completedTickets, recentInvoice] = await Promise.all([
        this.prisma.ticket.count({
          where: {
            tenantId,
            customerId: customer.id,
            status: { notIn: [TicketStatus.TICKET_CLOSED, TicketStatus.CANCELLED] },
          },
        }),
        this.prisma.ticket.count({
          where: { tenantId, customerId: customer.id, status: TicketStatus.TICKET_CLOSED },
        }),
        this.prisma.invoice.findFirst({
          where: { tenantId, ticket: { customerId: customer.id } },
          orderBy: { generatedAt: 'desc' },
          select: {
            id: true, invoiceNumber: true, total: true, generatedAt: true, pdfUrl: true,
            ticket: { select: { ticketNumber: true, subCategory: { include: { category: true } } } },
          },
        }),
      ]);

      return { data: { openTickets, completedTickets, recentInvoice } };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      handlePrismaError(error, 'Dashboard');
    }
  }

  // ── Tickets ───────────────────────────────────────────────────────────────

  async raiseTicket(tenantId: string, userId: string, dto: CreateTicketDto, images?: Express.Multer.File[]) {
    try {
      await this.planLimit.checkLimit(tenantId, 'ticket');

      const customer = await this.resolveCustomer(tenantId, userId);

      const subCategory = await this.prisma.serviceSubCategory.findFirst({
        where: { id: dto.subCategoryId, tenantId, isActive: true },
      });
      if (!subCategory) throw new NotFoundException(`Service sub-category "${dto.subCategoryId}" not found`);

      if (subCategory.categoryId !== dto.categoryId) {
        throw new BadRequestException('The selected sub-category does not belong to the selected category');
      }

      const ticketSeq = await this.prisma.ticket.count({ where: { tenantId } });
      const ticketNumber = `TKT-${new Date().getFullYear()}-${String(ticketSeq + 1).padStart(5, '0')}`;

      const ticket = await this.prisma.$transaction(async (tx) => {
        const t = await tx.ticket.create({
          data: {
            tenantId,
            ticketNumber,
            customerId: customer.id,
            categoryId: dto.categoryId,
            subCategoryId: dto.subCategoryId,
            description: dto.description,
            serviceAddress: dto.serviceAddress ?? customer.address ?? null,
            priority: dto.priority ?? 'MEDIUM',
            scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
            status: TicketStatus.NEW_TICKET,
          },
        });
        await tx.ticketStatusLog.create({
          data: { tenantId, ticketId: t.id, status: TicketStatus.NEW_TICKET, changedBy: userId },
        });
        return t;
      });

      if (images?.length) {
        await Promise.all(
          images.map(async (file) => {
            const { url } = await this.uploadService.uploadTicketImage(tenantId, ticket.id, file);
            return this.prisma.ticketImage.create({
              data: { tenantId, ticketId: ticket.id, imageUrl: url, type: ImageType.RAISED },
            });
          }),
        );
      }

      void this.notifications.onTicketRaised(tenantId, customer.id);
      writeAuditLog(this.prisma, { tenantId, userId, action: 'CREATE', entity: 'Ticket', entityId: ticket.id, newValue: { ticketNumber: ticket.ticketNumber, status: ticket.status } });
      this.logger.log(`Ticket raised by customer ${customer.id} in tenant ${tenantId}`);
      return { message: 'Ticket raised successfully', data: ticket };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) throw error;
      handlePrismaError(error, 'Ticket');
    }
  }

  async listMyTickets(tenantId: string, userId: string, status?: TicketStatus) {
    try {
      const customer = await this.resolveCustomer(tenantId, userId);

      const tickets = await this.prisma.ticket.findMany({
        where: { tenantId, customerId: customer.id, ...(status && { status }) },
        include: {
          technician: { select: { id: true, name: true, phone: true } },
          subCategory: { include: { category: true } },
          feedback: true,
          payment: { select: { status: true, amount: true, method: true } },
        },
        orderBy: { createdAt: 'desc' },
      });
      return { data: tickets };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      handlePrismaError(error, 'Tickets');
    }
  }

  async getTicket(tenantId: string, userId: string, ticketId: string) {
    try {
      const customer = await this.resolveCustomer(tenantId, userId);

      const ticket = await this.prisma.ticket.findFirst({
        where: { id: ticketId, tenantId, customerId: customer.id },
        include: {
          technician: { select: { id: true, name: true, phone: true } },
          subCategory: { include: { category: true, serviceCharges: true } },
          images: true,
          statusLogs: { orderBy: { changedAt: 'asc' } },
          payment: true,
          invoice: true,
          feedback: true,
        },
      });
      if (!ticket) throw new NotFoundException(`Ticket "${ticketId}" not found`);
      return { data: ticket };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      handlePrismaError(error, 'Ticket');
    }
  }

  async cancelTicket(tenantId: string, userId: string, ticketId: string, dto: CancelTicketDto) {
    try {
      const customer = await this.resolveCustomer(tenantId, userId);

      const ticket = await this.prisma.ticket.findFirst({
        where: { id: ticketId, tenantId, customerId: customer.id },
      });
      if (!ticket) throw new NotFoundException(`Ticket "${ticketId}" not found`);

      const nonCancellable = ['COMPLETED', 'INVOICE_GENERATED', 'TICKET_CLOSED', 'CANCELLED', 'IN_PROGRESS'];
      if (nonCancellable.includes(ticket.status)) {
        throw new BadRequestException(`Ticket in "${ticket.status}" status cannot be cancelled`);
      }

      await this.prisma.$transaction(async (tx) => {
        await tx.ticket.update({
          where: { id: ticketId },
          data: { status: 'CANCELLED' as any, technicianId: null },
        });
        await tx.ticketStatusLog.create({
          data: { tenantId, ticketId, status: 'CANCELLED' as any, changedBy: userId, notes: `Customer cancelled: ${dto.reason}` },
        });
      });

      return { message: 'Ticket cancelled successfully' };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) throw error;
      handlePrismaError(error, 'Ticket');
    }
  }

  async getTicketTracking(tenantId: string, userId: string, ticketId: string) {
    try {
      const customer = await this.resolveCustomer(tenantId, userId);

      const ticket = await this.prisma.ticket.findFirst({
        where: { id: ticketId, tenantId, customerId: customer.id },
        include: {
          technician: {
            select: { id: true, name: true, phone: true, currentLat: true, currentLng: true, rating: true },
          },
          statusLogs: { orderBy: { changedAt: 'asc' }, select: { status: true, changedAt: true, notes: true } },
        },
      });
      if (!ticket) throw new NotFoundException(`Ticket "${ticketId}" not found`);

      return {
        data: {
          ticketId: ticket.id,
          status: ticket.status,
          technician: ticket.technician ?? null,
          statusHistory: ticket.statusLogs,
        },
      };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      handlePrismaError(error, 'Ticket');
    }
  }

  // ── Invoices & Payments ───────────────────────────────────────────────────

  async listMyInvoices(tenantId: string, userId: string) {
    try {
      const customer = await this.resolveCustomer(tenantId, userId);

      const invoices = await this.prisma.invoice.findMany({
        where: { tenantId, ticket: { customerId: customer.id } },
        include: {
          ticket: {
            select: {
              ticketNumber: true,
              description: true,
              priority: true,
              subCategory: { include: { category: true } },
            },
          },
          payment: { select: { method: true, collectedAt: true, status: true } },
        },
        orderBy: { generatedAt: 'desc' },
      });
      return { data: invoices };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      handlePrismaError(error, 'Invoices');
    }
  }

  async getInvoice(tenantId: string, userId: string, invoiceId: string) {
    try {
      const customer = await this.resolveCustomer(tenantId, userId);

      const invoice = await this.prisma.invoice.findFirst({
        where: { id: invoiceId, tenantId, ticket: { customerId: customer.id } },
        include: {
          ticket: {
            include: {
              subCategory: { include: { category: true } },
              technician: { select: { name: true, phone: true } },
            },
          },
          payment: true,
        },
      });
      if (!invoice) throw new NotFoundException('Invoice not found');

      const [settings, tenant] = await Promise.all([
        this.prisma.tenantSetting.findUnique({ where: { tenantId } }),
        this.prisma.tenant.findUnique({
          where: { id: tenantId },
          select: { companyName: true, email: true, phone: true, address: true, city: true, state: true, logoUrl: true },
        }),
      ]);

      return {
        message: 'Invoice fetched successfully',
        data: { invoice, tenant, settings },
      };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      handlePrismaError(error, 'Invoice');
    }
  }

  async getMyPayments(tenantId: string, userId: string) {
    try {
      const customer = await this.resolveCustomer(tenantId, userId);

      const payments = await this.prisma.payment.findMany({
        where: { tenantId, ticket: { customerId: customer.id } },
        include: {
          ticket: {
            select: {
              description: true,
              subCategory: { include: { category: true } },
            },
          },
          invoice: { select: { invoiceNumber: true, total: true } },
        },
        orderBy: { createdAt: 'desc' },
      });
      return { data: payments };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      handlePrismaError(error, 'Payments');
    }
  }

  // ── Feedback ─────────────────────────────────────────────────────────────

  async submitFeedback(tenantId: string, userId: string, dto: SubmitFeedbackDto) {
    try {
      const customer = await this.resolveCustomer(tenantId, userId);

      const ticket = await this.prisma.ticket.findFirst({
        where: { id: dto.ticketId, tenantId, customerId: customer.id },
      });
      if (!ticket) throw new NotFoundException(`Ticket "${dto.ticketId}" not found`);

      const feedbackAllowed: TicketStatus[] = [TicketStatus.TICKET_CLOSED, TicketStatus.INVOICE_GENERATED];
      if (!feedbackAllowed.includes(ticket.status)) {
        throw new BadRequestException('Feedback can only be submitted once the ticket is invoiced or closed');
      }

      const existing = await this.prisma.feedback.findUnique({ where: { ticketId: dto.ticketId } });
      if (existing) throw new ConflictException('You have already submitted feedback for this ticket');

      const feedback = await this.prisma.feedback.create({
        data: { tenantId, ticketId: dto.ticketId, customerId: customer.id, rating: dto.rating, review: dto.review },
      });
      return { message: 'Feedback submitted successfully', data: feedback };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException ||
        error instanceof ConflictException
      ) throw error;
      handlePrismaError(error, 'Feedback');
    }
  }

  async getMyFeedback(tenantId: string, userId: string) {
    try {
      const customer = await this.resolveCustomer(tenantId, userId);

      const feedback = await this.prisma.feedback.findMany({
        where: { tenantId, customerId: customer.id },
        include: {
          ticket: { include: { subCategory: { include: { category: true } } } },
        },
        orderBy: { createdAt: 'desc' },
      });
      return { data: feedback };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      handlePrismaError(error, 'Feedback');
    }
  }

  // ── Addresses ─────────────────────────────────────────────────────────────

  async getAddresses(tenantId: string, userId: string) {
    try {
      const addresses = await this.prisma.address.findMany({
        where: { userId, tenantId, isActive: true },
        orderBy: { createdAt: 'asc' },
      });
      return { data: addresses };
    } catch (error) {
      handlePrismaError(error, 'Addresses');
    }
  }

  async addAddress(tenantId: string, userId: string, dto: CreateAddressDto) {
    try {
      const label = dto.label ?? 'home';
      const existing = await this.prisma.address.findFirst({ where: { userId, label } });

      if (existing && existing.isActive) {
        throw new ConflictException(`An address with label "${label}" already exists`);
      }

      const address = existing
        ? await this.prisma.address.update({ where: { id: existing.id }, data: { ...dto, label, isActive: true } })
        : await this.prisma.address.create({ data: { tenantId, userId, ...dto, label } });

      return { message: 'Address saved successfully', data: address };
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      handlePrismaError(error, 'Address');
    }
  }

  async updateAddress(tenantId: string, userId: string, addressId: string, dto: UpdateAddressDto) {
    try {
      const address = await this.prisma.address.findFirst({ where: { id: addressId, userId, tenantId } });
      if (!address) throw new NotFoundException('Address not found');

      const updated = await this.prisma.address.update({ where: { id: addressId }, data: dto });
      return { message: 'Address updated successfully', data: updated };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      handlePrismaError(error, 'Address');
    }
  }

  async deleteAddress(tenantId: string, userId: string, addressId: string) {
    try {
      const address = await this.prisma.address.findFirst({ where: { id: addressId, userId, tenantId } });
      if (!address) throw new NotFoundException('Address not found');

      await this.prisma.address.update({ where: { id: addressId }, data: { isActive: false } });
      return { message: 'Address removed successfully' };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      handlePrismaError(error, 'Address');
    }
  }
}
