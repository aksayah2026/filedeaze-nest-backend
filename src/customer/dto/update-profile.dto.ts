import { IsString, IsEmail, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Ravi Kumar' })
  @IsOptional()
  @IsString({ message: 'Name must be a string' })
  name?: string;

  @ApiPropertyOptional({ example: 'ravi@example.com' })
  @IsOptional()
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email?: string;

  @ApiPropertyOptional({ example: '+919876543210' })
  @IsOptional()
  @IsString({ message: 'Phone must be a string' })
  phone?: string;

  @ApiPropertyOptional({ example: '+919876543211', description: 'Alternate contact number' })
  @IsOptional()
  @IsString({ message: 'Alternate phone must be a string' })
  alternatePhone?: string;

  @ApiPropertyOptional({ example: '123 Main Street' })
  @IsOptional()
  @IsString({ message: 'Address must be a string' })
  address?: string;

  @ApiPropertyOptional({ example: 'Chennai' })
  @IsOptional()
  @IsString({ message: 'City must be a string' })
  city?: string;

  @ApiPropertyOptional({ example: '600001' })
  @IsOptional()
  @IsString({ message: 'Pincode must be a string' })
  pincode?: string;
}
