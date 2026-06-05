import { IsEmail, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateSuperAdminDto {
  @ApiProperty({ example: 'John Super' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'superadmin@fieldeaze.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'StrongPass@123', minLength: 8 })
  @IsString()
  @MinLength(8)
  password: string;
}
