import { IsString, IsNumber, IsOptional, IsBoolean, IsArray, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateServiceDto {
  @ApiProperty()
  @IsString({ message: 'Category ID must be a string' })
  categoryId: string;

  @ApiProperty({ example: 'AC Deep Cleaning' })
  @IsString({ message: 'Service name must be a string' })
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString({ message: 'Description must be a string' })
  description?: string;

  @ApiProperty({ example: 799 })
  @IsNumber({}, { message: 'Price must be a number' })
  @Min(0, { message: 'Price cannot be negative' })
  price: number;

  @ApiProperty({ example: 999 })
  @IsNumber({}, { message: 'Original price must be a number' })
  @Min(0, { message: 'Original price cannot be negative' })
  originalPrice: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString({ message: 'Warranty must be a string' })
  warranty?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString({ message: 'Image URL must be a string' })
  imageUrl?: string;

  @ApiProperty({ example: ['Deep clean', 'Filter replacement'] })
  @IsArray({ message: 'Features must be an array' })
  @IsString({ each: true, message: 'Each feature must be a string' })
  features: string[];
}

export class UpdateServiceDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({}, { message: 'Price must be a number' })
  @Min(0)
  price?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({}, { message: 'Original price must be a number' })
  @Min(0)
  originalPrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  warranty?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean({ message: 'isActive must be a boolean' })
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean({ message: 'isPopular must be a boolean' })
  isPopular?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  displayOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  features?: string[];
}

export class ServiceFilterDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  serviceId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  categoryId?: string;
}
