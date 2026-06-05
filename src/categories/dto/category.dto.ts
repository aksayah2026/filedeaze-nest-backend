import { IsString, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCategoryDto {
  @ApiProperty({ example: 'Home Appliances' })
  @IsString({ message: 'Category name must be a string' })
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString({ message: 'Description must be a string' })
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString({ message: 'Image URL must be a string' })
  imageUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString({ message: 'Price range must be a string' })
  price?: string;
}

export class UpdateCategoryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString({ message: 'Category name must be a string' })
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString({ message: 'Description must be a string' })
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString({ message: 'Image URL must be a string' })
  imageUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean({ message: 'isActive must be a boolean' })
  isActive?: boolean;
}
