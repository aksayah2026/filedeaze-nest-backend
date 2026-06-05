import { Injectable, NotFoundException, ConflictException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { handlePrismaError } from '../common/utils/prisma-error.handler';
import { CreateServiceDto, UpdateServiceDto, ServiceFilterDto } from './dto/service.dto';

@Injectable()
export class ServicesService {
  private readonly logger = new Logger(ServicesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, dto: CreateServiceDto) {
    try {
      if (dto.originalPrice < dto.price) {
        throw new BadRequestException('Original price must be greater than or equal to price');
      }

      const category = await this.prisma.serviceCategory.findFirst({
        where: { id: dto.categoryId, tenantId, isDeleted: false },
      });
      if (!category) throw new NotFoundException(`Category with ID "${dto.categoryId}" not found`);

      const exists = await this.prisma.service.findFirst({
        where: { tenantId, name: { equals: dto.name, mode: 'insensitive' }, isDeleted: false },
      });
      if (exists) throw new ConflictException(`Service "${dto.name}" already exists`);

      const service = await this.prisma.service.create({ data: { tenantId, ...dto } });
      this.logger.log(`Service created: ${service.name} [tenant: ${tenantId}]`);
      return { message: 'Service created successfully', data: service };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ConflictException || error instanceof BadRequestException) throw error;
      handlePrismaError(error, 'Service');
    }
  }

  async findAll(tenantId: string, filters: ServiceFilterDto) {
    try {
      const services = await this.prisma.service.findMany({
        where: {
          tenantId,
          isDeleted: false,
          isActive: true,
          ...(filters.serviceId && { id: { contains: filters.serviceId, mode: 'insensitive' } }),
          ...(filters.name && { name: { contains: filters.name, mode: 'insensitive' } }),
          ...(filters.description && { description: { contains: filters.description, mode: 'insensitive' } }),
          ...(filters.categoryId && { categoryId: filters.categoryId }),
          category: { isDeleted: false },
        },
        include: { category: { select: { id: true, name: true } } },
        orderBy: [{ displayOrder: 'asc' }, { createdAt: 'desc' }],
      });
      return { message: 'Services fetched successfully', data: services };
    } catch (error) {
      handlePrismaError(error, 'Services');
    }
  }

  async findOne(tenantId: string, id: string) {
    try {
      const service = await this.prisma.service.findFirst({
        where: { id, tenantId, isDeleted: false },
        include: { category: true },
      });
      if (!service) throw new NotFoundException(`Service with ID "${id}" not found`);
      return { message: 'Service fetched successfully', data: service };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      handlePrismaError(error, 'Service');
    }
  }

  async findByCategory(tenantId: string, categoryId: string) {
    try {
      const services = await this.prisma.service.findMany({
        where: { tenantId, categoryId, isDeleted: false, isActive: true },
        orderBy: { name: 'asc' },
      });
      return { message: 'Services fetched successfully', data: services };
    } catch (error) {
      handlePrismaError(error, 'Services');
    }
  }

  async findPopular(tenantId: string) {
    try {
      // Get manually flagged popular services
      const flagged = await this.prisma.service.findMany({
        where: { tenantId, isPopular: true, isDeleted: false, isActive: true },
        include: { category: true },
        orderBy: [{ displayOrder: 'asc' }, { rating: 'desc' }],
        take: 10,
      });

      // Get top booked services
      const topBooked = await this.prisma.service.findMany({
        where: { tenantId, isDeleted: false, isActive: true },
        include: { category: true },
        orderBy: { totalBookings: 'desc' },
        take: 10,
      });

      // Merge and deduplicate
      const seen = new Set<string>();
      const merged = [...flagged, ...topBooked].filter((s) => {
        if (seen.has(s.id)) return false;
        seen.add(s.id);
        return true;
      }).slice(0, 10);

      return { message: 'Popular services fetched successfully', data: merged };
    } catch (error) {
      handlePrismaError(error, 'Popular services');
    }
  }

  async findPreview(tenantId: string) {
    try {
      const services = await this.prisma.service.findMany({
        where: { tenantId, isDeleted: false, isActive: true },
        select: { id: true, name: true, price: true, originalPrice: true, imageUrl: true, rating: true, numberOfRatings: true },
        orderBy: { name: 'asc' },
      });
      return { message: 'Service preview fetched successfully', data: services };
    } catch (error) {
      handlePrismaError(error, 'Services');
    }
  }

  async update(tenantId: string, id: string, dto: UpdateServiceDto) {
    try {
      await this.findOne(tenantId, id);
      if (dto.originalPrice !== undefined && dto.price !== undefined && dto.originalPrice < dto.price) {
        throw new BadRequestException('Original price must be greater than or equal to price');
      }
      const service = await this.prisma.service.update({ where: { id }, data: dto });
      return { message: 'Service updated successfully', data: service };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) throw error;
      handlePrismaError(error, 'Service');
    }
  }

  async remove(tenantId: string, id: string) {
    try {
      await this.findOne(tenantId, id);
      await this.prisma.service.update({ where: { id }, data: { isDeleted: true, isActive: false } });
      return { message: 'Service deleted successfully' };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      handlePrismaError(error, 'Service');
    }
  }
}
