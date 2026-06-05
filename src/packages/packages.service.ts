import { Injectable, NotFoundException, ConflictException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { handlePrismaError } from '../common/utils/prisma-error.handler';
import { IsString, IsNumber, IsOptional, IsArray, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePackageDto {
  @ApiProperty() @IsString() categoryId: string;
  @ApiProperty() @IsString() name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiProperty() @IsNumber() @Min(0) price: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) discount?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() tag?: string;
  @ApiPropertyOptional() @IsOptional() @IsArray() @IsString({ each: true }) features?: string[];
  @ApiPropertyOptional() @IsOptional() @IsArray() @IsString({ each: true }) serviceIds?: string[];
}

export class UpdatePackageDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) price?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) discount?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() tag?: string;
  @ApiPropertyOptional() @IsOptional() @IsArray() @IsString({ each: true }) features?: string[];
}

@Injectable()
export class PackagesService {
  private readonly logger = new Logger(PackagesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, dto: CreatePackageDto) {
    try {
      const category = await this.prisma.serviceCategory.findFirst({
        where: { id: dto.categoryId, tenantId, isDeleted: false },
      });
      if (!category) throw new NotFoundException(`Category "${dto.categoryId}" not found`);

      const exists = await this.prisma.servicePackage.findFirst({
        where: { tenantId, name: { equals: dto.name, mode: 'insensitive' }, isDeleted: false },
      });
      if (exists) throw new ConflictException(`Package "${dto.name}" already exists`);

      if (dto.discount !== undefined && dto.price !== undefined && dto.discount > dto.price) {
        throw new BadRequestException('Discount cannot exceed the package price');
      }

      const pkg = await this.prisma.$transaction(async (tx) => {
        const p = await tx.servicePackage.create({
          data: { tenantId, categoryId: dto.categoryId, name: dto.name, description: dto.description, price: dto.price ?? 0, discount: dto.discount ?? 0, tag: dto.tag, features: dto.features ?? [] },
        });
        if (dto.serviceIds?.length) {
          await tx.servicePackageService.createMany({
            data: dto.serviceIds.map((serviceId) => ({ packageId: p.id, serviceId })),
            skipDuplicates: true,
          });
        }
        return p;
      });

      this.logger.log(`Package created: ${pkg.name}`);
      return { message: 'Package created successfully', data: pkg };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ConflictException || error instanceof BadRequestException) throw error;
      handlePrismaError(error, 'Package');
    }
  }

  async findAll(tenantId: string, filters?: { name?: string; packageId?: string; tag?: string }) {
    try {
      const packages = await this.prisma.servicePackage.findMany({
        where: {
          tenantId,
          isDeleted: false,
          ...(filters?.packageId && { id: { contains: filters.packageId, mode: 'insensitive' } }),
          ...(filters?.name && { name: { contains: filters.name, mode: 'insensitive' } }),
          ...(filters?.tag && { tag: { contains: filters.tag, mode: 'insensitive' } }),
        },
        include: { category: true, services: { include: { service: true } } },
        orderBy: { name: 'asc' },
      });
      return { message: 'Packages fetched successfully', data: packages };
    } catch (error) {
      handlePrismaError(error, 'Packages');
    }
  }

  async findOne(tenantId: string, id: string) {
    try {
      const pkg = await this.prisma.servicePackage.findFirst({
        where: { id, tenantId, isDeleted: false },
        include: { category: true, services: { include: { service: true } } },
      });
      if (!pkg) throw new NotFoundException(`Package "${id}" not found`);
      return { message: 'Package fetched successfully', data: pkg };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      handlePrismaError(error, 'Package');
    }
  }

  async update(tenantId: string, id: string, dto: UpdatePackageDto) {
    try {
      await this.findOne(tenantId, id);
      const pkg = await this.prisma.servicePackage.update({ where: { id }, data: dto });
      return { message: 'Package updated successfully', data: pkg };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      handlePrismaError(error, 'Package');
    }
  }

  async remove(tenantId: string, id: string) {
    try {
      await this.findOne(tenantId, id);
      await this.prisma.servicePackage.update({ where: { id }, data: { isDeleted: true } });
      return { message: 'Package deleted successfully' };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      handlePrismaError(error, 'Package');
    }
  }

  async getCategoriesWithPackages(tenantId: string) {
    try {
      const categories = await this.prisma.serviceCategory.findMany({
        where: { tenantId, isDeleted: false, isActive: true },
        include: { servicePackages: { where: { isDeleted: false } } },
        orderBy: { name: 'asc' },
      });
      return { message: 'Categories with packages fetched successfully', data: categories };
    } catch (error) {
      handlePrismaError(error, 'Categories');
    }
  }
}
