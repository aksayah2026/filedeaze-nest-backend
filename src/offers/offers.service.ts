import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { handlePrismaError } from '../common/utils/prisma-error.handler';
import { CreateOfferDto, UpdateOfferDto } from './dto/offer.dto';

@Injectable()
export class OffersService {
  private readonly logger = new Logger(OffersService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, dto: CreateOfferDto) {
    try {
      const offer = await this.prisma.offer.create({
        data: {
          tenantId,
          title: dto.title,
          description: dto.description,
          offerType: dto.offerType,
          discountType: dto.discountType,
          discountValue: dto.discountValue,
          serviceId: dto.serviceId,
          categoryId: dto.categoryId,
          startDate: new Date(dto.startDate),
          endDate: new Date(dto.endDate),
          isRecurring: dto.isRecurring ?? false,
          daysOfWeek: dto.daysOfWeek,
        },
        include: { service: true, category: true },
      });
      this.logger.log(`Offer created: ${offer.title} [${tenantId}]`);
      return { message: 'Offer created successfully', data: offer };
    } catch (error) {
      handlePrismaError(error, 'Offer');
    }
  }

  async findAll(tenantId: string, onlyActive = false) {
    try {
      const offers = await this.prisma.offer.findMany({
        where: { tenantId, ...(onlyActive && { isActive: true }) },
        include: { service: true, category: true },
        orderBy: { createdAt: 'desc' },
      });
      return { data: offers };
    } catch (error) {
      handlePrismaError(error, 'Offers');
    }
  }

  async findActiveForMobile(tenantId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    try {
      const offers = await this.prisma.offer.findMany({
        where: {
          tenantId,
          isActive: true,
          startDate: { lte: today },
          endDate: { gte: today },
        },
        include: { service: true, category: true },
        orderBy: { createdAt: 'desc' },
      });
      return { data: offers };
    } catch (error) {
      handlePrismaError(error, 'Offers');
    }
  }

  async findOne(tenantId: string, id: string) {
    try {
      const offer = await this.prisma.offer.findFirst({
        where: { id, tenantId },
        include: { service: true, category: true },
      });
      if (!offer) throw new NotFoundException(`Offer "${id}" not found`);
      return { data: offer };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      handlePrismaError(error, 'Offer');
    }
  }

  async update(tenantId: string, id: string, dto: UpdateOfferDto) {
    try {
      await this.findOne(tenantId, id);
      const offer = await this.prisma.offer.update({
        where: { id },
        data: {
          ...dto,
          ...(dto.startDate && { startDate: new Date(dto.startDate) }),
          ...(dto.endDate && { endDate: new Date(dto.endDate) }),
        },
        include: { service: true, category: true },
      });
      return { message: 'Offer updated successfully', data: offer };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      handlePrismaError(error, 'Offer');
    }
  }

  async remove(tenantId: string, id: string) {
    try {
      await this.findOne(tenantId, id);
      await this.prisma.offer.update({ where: { id }, data: { isActive: false } });
      return { message: 'Offer deactivated successfully' };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      handlePrismaError(error, 'Offer');
    }
  }
}
