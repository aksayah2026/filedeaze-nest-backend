import { IsEmail, IsOptional, IsUUID, IsString, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ForgotPasswordDto {
  @ApiProperty({ example: 'admin@abc.com' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ example: 'bc802c99-e88f-4952-82af-8a16f48aa61b', description: 'Required for tenant users; omit for super admin' })
  @IsOptional()
  @IsUUID('4')
  tenantId?: string;
}

export class ResetPasswordDto {
  @ApiProperty({ description: 'Token received in reset email' })
  @IsString()
  token: string;

  @ApiProperty({ example: 'NewPass@123', minLength: 8 })
  @IsString()
  @MinLength(8)
  newPassword: string;
}
