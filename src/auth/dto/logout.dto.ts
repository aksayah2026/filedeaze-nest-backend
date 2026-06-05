import { IsString, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class LogoutDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString({ message: 'Refresh token must be a string' })
  refreshToken?: string;
}
