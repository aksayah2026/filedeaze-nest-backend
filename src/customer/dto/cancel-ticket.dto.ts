import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CancelTicketDto {
  @ApiProperty({ example: 'No longer need this service' })
  @IsString()
  reason: string;
}
