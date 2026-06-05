import { IsString, IsOptional, IsNumber, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SubmitFeedbackDto {
  @ApiProperty()
  @IsString({ message: 'Ticket ID must be a string' })
  ticketId: string;

  @ApiProperty({ example: 5, minimum: 1, maximum: 5 })
  @IsNumber({}, { message: 'Rating must be a number' })
  @Min(1, { message: 'Rating must be at least 1' })
  @Max(5, { message: 'Rating cannot exceed 5' })
  rating: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString({ message: 'Review must be a string' })
  review?: string;
}
