import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { handlePrismaError } from '../common/utils/prisma-error.handler';

export interface InvoiceData {
  invoiceNumber: string;
  prefix: string;
  subtotal: number;
  gstPercent: number;
  gstAmount: number;
  total: number;
}

@Injectable()
export class InvoiceService {
  private readonly logger = new Logger(InvoiceService.name);

  constructor(private readonly prisma: PrismaService) {}

  async generateInvoiceData(tenantId: string, amount: number): Promise<InvoiceData> {
    try {
      const settings = await this.prisma.tenantSetting.findUnique({ where: { tenantId } });

      const prefix = settings?.invoicePrefix ?? 'INV';
      const gstEnabled = settings?.gstEnabled ?? false;
      const gstPercent = gstEnabled ? Number(settings?.gstPercent ?? 0) : 0;

      const invoiceCount = await this.prisma.invoice.count({ where: { tenantId } });
      const year = new Date().getFullYear();
      const invoiceNumber = `${prefix}-${year}-${String(invoiceCount + 1).padStart(5, '0')}`;

      const subtotal = amount;
      const gstAmount = Math.round((subtotal * gstPercent) / 100 * 100) / 100;
      const total = Math.round((subtotal + gstAmount) * 100) / 100;

      this.logger.log(`Generated invoice number: ${invoiceNumber} for tenant: ${tenantId}`);

      return { invoiceNumber, prefix, subtotal, gstPercent, gstAmount, total };
    } catch (error) {
      handlePrismaError(error, 'Invoice');
    }
  }
}
