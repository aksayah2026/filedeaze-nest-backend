import { IsEmail, IsString, IsUUID, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class TechnicianLoginDto {
  @ApiProperty({ example: 'bc802c99-e88f-4952-82af-8a16f48aa61b' })
  @IsUUID('4', { message: 'tenantId must be a valid UUID' })
  tenantId: string;

  @ApiProperty({ example: 'tech@abc.com' })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email: string;

  @ApiProperty({ minLength: 6 })
  @IsString({ message: 'Password must be a string' })
  @MinLength(6, { message: 'Password must be at least 6 characters' })
  password: string;
}
