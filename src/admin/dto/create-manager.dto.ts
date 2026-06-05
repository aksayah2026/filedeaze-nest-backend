import { IsEmail, IsString, IsOptional, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateManagerDto {
  @ApiProperty({ example: 'John Manager' })
  @IsString({ message: 'Name must be a string' })
  name: string;

  @ApiProperty({ example: 'manager@example.com' })
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

export class UpdateManagerDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString({ message: 'Name must be a string' })
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString({ message: 'Phone must be a string' })
  phone?: string;
}
