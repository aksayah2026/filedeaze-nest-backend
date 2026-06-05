import {
  IsString, IsOptional, IsNumber, IsBoolean, IsEnum, IsDateString, Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DiscountType } from '@prisma/client';

export class CreateOfferDto {
  @ApiProperty({ example: 'Summer Sale' })
  @IsString()
  title: string;

  @ApiPropertyOptional({ example: '20% off all electrical services' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 'SEASONAL', description: 'e.g. SEASONAL, FESTIVAL, REFERRAL' })
  @IsString()
  offerType: string;

  @ApiProperty({ enum: DiscountType })
  @IsEnum(DiscountType)
  discountType: DiscountType;

  @ApiProperty({ example: 20 })
  @IsNumber()
  @Min(0)
  discountValue: number;

  @ApiPropertyOptional({ description: 'Restrict to a specific service ID' })
  @IsOptional()
  @IsString()
  serviceId?: string;

  @ApiPropertyOptional({ description: 'Restrict to a specific category ID' })
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiProperty({ example: '2026-06-01' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ example: '2026-06-30' })
  @IsDateString()
  endDate: string;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  isRecurring?: boolean;

  @ApiPropertyOptional({ example: 'MON,WED,FRI', description: 'Comma-separated days for recurring offers' })
  @IsOptional()
  @IsString()
  daysOfWeek?: string;
}

export class UpdateOfferDto {
  @ApiPropertyOptional() @IsOptional() @IsString() title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() offerType?: string;
  @ApiPropertyOptional({ enum: DiscountType }) @IsOptional() @IsEnum(DiscountType) discountType?: DiscountType;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) discountValue?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() serviceId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() categoryId?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() startDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() endDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isRecurring?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() daysOfWeek?: string;
}
