import { IsEmail, IsString, IsOptional, MinLength, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTechnicianDto {
  @ApiProperty({ example: 'Ravi Kumar' })
  @IsString({ message: 'Name must be a string' })
  name: string;

  @ApiProperty({ example: 'ravi@example.com' })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString({ message: 'Phone must be a string' })
  phone?: string;

  @ApiProperty({ minLength: 8 })
  @IsString({ message: 'Password must be a string' })
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  password: string;
}

export class ResetTechnicianPasswordDto {
  @ApiProperty({ minLength: 8 })
  @IsString({ message: 'Password must be a string' })
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  newPassword: string;
}

export class UpdateTechnicianDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString({ message: 'Name must be a string' })
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString({ message: 'Phone must be a string' })
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean({ message: 'isActive must be a boolean' })
  isActive?: boolean;
}
