import { Injectable, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { handlePrismaError } from '../common/utils/prisma-error.handler';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';

@Injectable()
export class CategoriesService {
  private readonly logger = new Logger(CategoriesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, dto: CreateCategoryDto) {
    try {
      const exists = await this.prisma.serviceCategory.findFirst({
        where: { tenantId, name: { equals: dto.name, mode: 'insensitive' }, isDeleted: false },
      });
      if (exists) throw new ConflictException(`Category "${dto.name}" already exists`);

      const category = await this.prisma.serviceCategory.create({ data: { tenantId, ...dto } });
      this.logger.log(`Category created: ${category.name} [tenant: ${tenantId}]`);
      return { message: 'Category created successfully', data: category };
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      handlePrismaError(error, 'Category');
    }
  }

  async findAll(tenantId: string, filters: { name?: string; categoryId?: string; includeEmpty?: boolean }) {
    try {
      const categories = await this.prisma.serviceCategory.findMany({
        where: {
          tenantId,
          isDeleted: false,
          ...(filters.categoryId && { id: { contains: filters.categoryId, mode: 'insensitive' } }),
          ...(filters.name && { name: { contains: filters.name, mode: 'insensitive' } }),
        },
        include: {
          services: { where: { isDeleted: false, isActive: true }, select: { id: true } },
          servicePackages: { where: { isDeleted: false }, select: { id: true } },
          _count: { select: { services: true, servicePackages: true } },
        },
        orderBy: { name: 'asc' },
      });

      const filtered = filters.includeEmpty === false
        ? categories.filter((c) => c.services.length > 0 || c.servicePackages.length > 0)
        : categories;

      return { message: 'Categories fetched successfully', data: filtered };
    } catch (error) {
      handlePrismaError(error, 'Categories');
    }
  }

  async findOne(tenantId: string, id: string) {
    try {
      const category = await this.prisma.serviceCategory.findFirst({
        where: { id, tenantId, isDeleted: false },
        include: {
          services: { where: { isDeleted: false, isActive: true } },
          servicePackages: { where: { isDeleted: false } },
        },
      });
      if (!category) throw new NotFoundException(`Category with ID "${id}" not found`);
      return { message: 'Category fetched successfully', data: category };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      handlePrismaError(error, 'Category');
    }
  }

  async update(tenantId: string, id: string, dto: UpdateCategoryDto) {
    try {
      await this.findOne(tenantId, id);
      const category = await this.prisma.serviceCategory.update({ where: { id }, data: dto });
      return { message: 'Category updated successfully', data: category };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      handlePrismaError(error, 'Category');
    }
  }

  async remove(tenantId: string, id: string) {
    try {
      await this.findOne(tenantId, id);
      await this.prisma.serviceCategory.update({ where: { id }, data: { isDeleted: true, isActive: false } });
      return { message: 'Category deleted successfully' };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      handlePrismaError(error, 'Category');
    }
  }

  async findWithPackages(tenantId: string) {
    try {
      const categories = await this.prisma.serviceCategory.findMany({
        where: { tenantId, isDeleted: false, isActive: true },
        include: {
          servicePackages: { where: { isDeleted: false } },
        },
        orderBy: { name: 'asc' },
      });
      return { message: 'Categories with packages fetched successfully', data: categories };
    } catch (error) {
      handlePrismaError(error, 'Categories');
    }
  }
}
