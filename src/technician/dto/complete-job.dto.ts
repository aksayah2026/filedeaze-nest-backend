import { IsString, IsNumber, IsOptional, IsEnum, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod } from '@prisma/client';

export class CompleteTicketDto {
  @ApiProperty({ description: 'Customer signature — URL or base64 encoded string' })
  @IsString({ message: 'Customer signature is required' })
  customerSignature: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString({ message: 'Notes must be a string' })
  notes?: string;
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
