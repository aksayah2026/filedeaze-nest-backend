import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CloudinaryService } from '../shared/cloudinary/cloudinary.service';
import { handlePrismaError } from '../common/utils/prisma-error.handler';
import * as PDFDocument from 'pdfkit';

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

  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinary: CloudinaryService,
  ) {}

  async generateInvoiceData(tenantId: string, amount: number): Promise<InvoiceData> {
    try {
      const settings = await this.prisma.tenantSetting.findUnique({ where: { tenantId } });

      const prefix      = settings?.invoicePrefix ?? 'INV';
      const gstEnabled  = settings?.gstEnabled ?? false;
      const gstPercent  = gstEnabled ? Number(settings?.gstPercent ?? 0) : 0;

      const invoiceCount = await this.prisma.invoice.count({ where: { tenantId } });
      const year         = new Date().getFullYear();
      const seq          = String(invoiceCount + 1).padStart(5, '0');
      const invoiceNumber = settings?.invoiceNumberFormat
        ? settings.invoiceNumberFormat
            .replace('{PREFIX}', prefix)
            .replace('{YEAR}',   String(year))
            .replace('{SEQ}',    seq)
        : `${prefix}-${year}-${seq}`;

      const subtotal  = amount;
      const gstAmount = Math.round((subtotal * gstPercent) / 100 * 100) / 100;
      const total     = Math.round((subtotal + gstAmount) * 100) / 100;

      this.logger.log(`Generated invoice number: ${invoiceNumber} for tenant: ${tenantId}`);
      return { invoiceNumber, prefix, subtotal, gstPercent, gstAmount, total };
    } catch (error) {
      handlePrismaError(error, 'Invoice');
    }
  }

  // ── PDF generation ────────────────────────────────────────────────────────

  async generateAndUploadPdf(invoiceId: string, tenantId: string): Promise<string | null> {
    try {
      // Fetch all data needed for the PDF
      const invoice = await this.prisma.invoice.findUnique({
        where: { id: invoiceId },
        include: {
          ticket: {
            include: {
              customer:    { select: { name: true, phone: true, address: true, city: true } },
              technician:  { select: { name: true, phone: true } },
              subCategory: { include: { category: { select: { name: true } } } },
            },
          },
          payment: { select: { method: true, collectedAt: true } },
        },
      });

      if (!invoice) return null;

      const tenant = await this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { companyName: true, email: true, phone: true, address: true, city: true, state: true },
      });

      const buffer = await this.buildPdf(invoice, tenant);

      const publicId = this.cloudinary.buildPublicId(
        tenantId,
        `invoices/${invoice.invoiceNumber}`,
        `${invoice.invoiceNumber}.pdf`,
      );

      const { url } = await this.cloudinary.uploadDocument(buffer, publicId);

      // Persist the PDF URL on the invoice record
      await this.prisma.invoice.update({ where: { id: invoiceId }, data: { pdfUrl: url } });

      this.logger.log(`Invoice PDF uploaded: ${url}`);
      return url;
    } catch (error) {
      // PDF generation failure must never crash payment collection
      this.logger.error(`PDF generation failed for invoice ${invoiceId}: ${(error as Error).message}`);
      return null;
    }
  }

  private buildPdf(invoice: any, tenant: any): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc    = new (PDFDocument as any)({ size: 'A4', margin: 50 });
      const chunks: Buffer[] = [];

      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end',  () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const BrandColor = '#4F46E5';
      const Muted      = '#6B7280';
      const Dark       = '#111827';
      const Light      = '#F9FAFB';
      const lineW      = 495; // usable width (595 - 50*2)

      // ── Header band ───────────────────────────────────────────────────────
      doc.rect(50, 45, lineW, 70).fill(BrandColor);

      doc.fillColor('#ffffff')
         .fontSize(22).font('Helvetica-Bold')
         .text('INVOICE', 65, 60);

      doc.fontSize(10).font('Helvetica')
         .text(tenant?.companyName ?? 'FieldEaze', 65, 86)
         .text(tenant?.city ?? '', 65, 100);

      doc.fontSize(10).font('Helvetica-Bold')
         .text(invoice.invoiceNumber, 400, 60, { align: 'right', width: 140 });
      doc.font('Helvetica').fillColor('#ccccff')
         .text(`Date: ${new Date(invoice.generatedAt).toLocaleDateString('en-IN')}`, 400, 78, { align: 'right', width: 140 });

      // ── Bill To / Service ─────────────────────────────────────────────────
      doc.fillColor(Dark).fontSize(10).font('Helvetica-Bold')
         .text('BILL TO', 50, 135);
      doc.font('Helvetica').fillColor(Dark)
         .text(invoice.ticket?.customer?.name ?? '—', 50, 150)
         .fillColor(Muted)
         .text(invoice.ticket?.customer?.phone ?? '', 50, 163)
         .text(
           [invoice.ticket?.customer?.address, invoice.ticket?.customer?.city].filter(Boolean).join(', ') || '',
           50, 176,
         );

      doc.fillColor(Dark).font('Helvetica-Bold').text('SERVICE', 320, 135);
      doc.font('Helvetica').fillColor(Dark)
         .text(invoice.ticket?.subCategory?.category?.name ?? '—', 320, 150)
         .fillColor(Muted)
         .text(invoice.ticket?.subCategory?.name ?? '', 320, 163)
         .text(`Technician: ${invoice.ticket?.technician?.name ?? '—'}`, 320, 176);

      // ── Line items table ──────────────────────────────────────────────────
      const tableTop = 215;
      doc.rect(50, tableTop, lineW, 22).fill(BrandColor);
      doc.fillColor('#ffffff').fontSize(10).font('Helvetica-Bold')
         .text('Description',    60, tableTop + 6)
         .text('Amount (₹)', 430, tableTop + 6, { width: 110, align: 'right' });

      const row1 = tableTop + 30;
      doc.rect(50, row1 - 4, lineW, 20).fill(Light);
      doc.fillColor(Dark).font('Helvetica').fontSize(10)
         .text('Service Charge', 60, row1)
         .text(`₹ ${Number(invoice.subtotal).toFixed(2)}`, 430, row1, { width: 110, align: 'right' });

      if (Number(invoice.gstAmount) > 0) {
        const row2 = row1 + 24;
        doc.fillColor(Dark)
           .text(`GST @ ${Number(invoice.gstPercent)}%`, 60, row2)
           .text(`₹ ${Number(invoice.gstAmount).toFixed(2)}`, 430, row2, { width: 110, align: 'right' });
      }

      // ── Total box ─────────────────────────────────────────────────────────
      const totalY = row1 + (Number(invoice.gstAmount) > 0 ? 56 : 32);
      doc.rect(350, totalY, lineW - 300, 28).fill(BrandColor);
      doc.fillColor('#ffffff').fontSize(12).font('Helvetica-Bold')
         .text('TOTAL', 360, totalY + 8)
         .text(`₹ ${Number(invoice.total).toFixed(2)}`, 430, totalY + 8, { width: 110, align: 'right' });

      // ── Payment info ──────────────────────────────────────────────────────
      const payY = totalY + 48;
      doc.fillColor(Muted).fontSize(9).font('Helvetica')
         .text(
           `Payment Method: ${invoice.payment?.method ?? '—'}   |   ` +
           `Collected: ${invoice.payment?.collectedAt ? new Date(invoice.payment.collectedAt).toLocaleDateString('en-IN') : '—'}`,
           50, payY,
         );

      // ── Footer ────────────────────────────────────────────────────────────
      doc.rect(50, 770, lineW, 1).fill('#E5E7EB');
      doc.fillColor(Muted).fontSize(8)
         .text('Thank you for choosing FieldEaze. For support: support@fieldeaze.com', 50, 776, { align: 'center', width: lineW });

      doc.end();
    });
  }
}
