import { IsString, IsNumber, IsOptional, IsEnum, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod } from '@prisma/client';

export class CompleteTicketDto {
  @ApiProperty({ description: 'Customer signature — URL or base64 encoded string' })
  @IsString({ message: 'Customer signature is required' })
  customerSignature: string;

  @ApiProperty({ description: 'Completion notes — mandatory' })
  @IsString({ message: 'Completion notes are required' })
  notes: string;

  @ApiPropertyOptional({ example: 12.9716, description: 'GPS latitude at job completion' })
  @IsOptional()
  @IsNumber({}, { message: 'Latitude must be a number' })
  @Min(-90)
  @Max(90)
  lat?: number;

  @ApiPropertyOptional({ example: 77.5946, description: 'GPS longitude at job completion' })
  @IsOptional()
  @IsNumber({}, { message: 'Longitude must be a number' })
  @Min(-180)
  @Max(180)
  lng?: number;
}

export class CollectPaymentDto {
  @ApiProperty({ example: 500, description: 'Amount collected in INR' })
  @IsNumber({}, { message: 'Amount must be a number' })
  @Min(1, { message: 'Amount must be greater than zero' })
  amount: number;

  @ApiProperty({ enum: PaymentMethod })
  @IsEnum(PaymentMethod, { message: 'Payment method must be CASH, UPI_QR, or RAZORPAY' })
  method: PaymentMethod;
}
