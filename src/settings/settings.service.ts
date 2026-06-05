import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { handlePrismaError } from '../common/utils/prisma-error.handler';
import { IsBoolean, IsNumber, IsOptional, Min, Max } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateSettingsDto {
  @ApiPropertyOptional({ example: 50 }) @IsOptional() @IsNumber() @Min(0) shippingCharge?: number;
  @ApiPropertyOptional({ example: 20 }) @IsOptional() @IsNumber() @Min(0) handlingCharge?: number;
  @ApiPropertyOptional({ example: 18 }) @IsOptional() @IsNumber() @Min(0) @Max(100) taxPercentage?: number;
  @ApiPropertyOptional({ example: 10 }) @IsOptional() @IsNumber() @Min(0) platformFee?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) @Max(100) dailyDiscount?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) @Max(100) weeklyDiscount?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) @Max(100) monthlyDiscount?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() shippingEnabled?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() handlingEnabled?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() dailyDiscountEnabled?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() weeklyDiscountEnabled?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() monthlyDiscountEnabled?: boolean;
}

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getSettings(tenantId: string) {
    try {
      const settings = await this.prisma.appSettings.upsert({
        where: { tenantId },
        update: {},
        create: { tenantId },
      });
      return { message: 'Settings fetched successfully', data: settings };
    } catch (error) {
      handlePrismaError(error, 'Settings');
    }
  }

  async updateSettings(tenantId: string, dto: UpdateSettingsDto) {
    try {
      const settings = await this.prisma.appSettings.upsert({
        where: { tenantId },
        update: dto,
        create: { tenantId, ...dto },
      });
      this.logger.log(`Settings updated for tenant: ${tenantId}`);
      return { message: 'Settings updated successfully', data: settings };
    } catch (error) {
      handlePrismaError(error, 'Settings');
    }
  }
}
