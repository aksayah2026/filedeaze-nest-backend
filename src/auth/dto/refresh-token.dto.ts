import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RefreshTokenDto {
  @ApiProperty()
  @IsString({ message: 'Refresh token must be a string' })
  refreshToken: string;
}
