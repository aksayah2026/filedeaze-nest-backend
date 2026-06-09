import { IsNumber, IsOptional, IsString, MaxLength, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CheckInDto {
  @ApiProperty({ example: 12.9716 })
  @IsNumber({}, { message: 'Latitude must be a number' })
  @Min(-90, { message: 'Latitude must be between -90 and 90' })
  @Max(90, { message: 'Latitude must be between -90 and 90' })
  lat: number;

  @ApiProperty({ example: 77.5946 })
  @IsNumber({}, { message: 'Longitude must be a number' })
  @Min(-180, { message: 'Longitude must be between -180 and 180' })
  @Max(180, { message: 'Longitude must be between -180 and 180' })
  lng: number;

  @ApiPropertyOptional({ example: 'Starting shift from home office', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  remarks?: string;
}

export class UpdateLocationDto {
  @ApiProperty({ example: 12.9716 })
  @IsNumber({}, { message: 'Latitude must be a number' })
  @Min(-90)
  @Max(90)
  lat: number;

  @ApiProperty({ example: 77.5946 })
  @IsNumber({}, { message: 'Longitude must be a number' })
  @Min(-180)
  @Max(180)
  lng: number;
}
