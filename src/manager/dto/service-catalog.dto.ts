import { IsString, IsOptional, IsBoolean, IsNumber, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCategoryDto {
  @ApiProperty({ example: 'Electrical' })
  @IsString({ message: 'Category name must be a string' })
  name: string;
}

export class UpdateCategoryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString({ message: 'Category name must be a string' })
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean({ message: 'isActive must be a boolean' })
  isActive?: boolean;
}

export class CreateSubCategoryDto {
  @ApiProperty()
  @IsString({ message: 'Category ID must be a string' })
  categoryId: string;

  @ApiProperty({ example: 'Fan Repair' })
  @IsString({ message: 'Sub-category name must be a string' })
  name: string;
}

export class UpdateSubCategoryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString({ message: 'Sub-category name must be a string' })
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean({ message: 'isActive must be a boolean' })
  isActive?: boolean;
}

export class UpsertServiceChargeDto {
  @ApiProperty({ example: 500 })
  @IsNumber({}, { message: 'Service charge must be a number' })
  @Min(0, { message: 'Service charge cannot be negative' })
  serviceCharge: number;

  @ApiProperty({ example: 100 })
  @IsNumber({}, { message: 'Inspection charge must be a number' })
  @Min(0, { message: 'Inspection charge cannot be negative' })
  inspectionCharge: number;

  @ApiProperty({ example: 200 })
  @IsNumber({}, { message: 'Emergency charge must be a number' })
  @Min(0, { message: 'Emergency charge cannot be negative' })
  emergencyCharge: number;
}
 