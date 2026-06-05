import { Module } from '@nestjs/common';
import { TechnicianController } from './technician.controller';
import { TechnicianService } from './technician.service';
import { UploadModule } from '../upload/upload.module';
import { InvoiceModule } from '../invoice/invoice.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [UploadModule, InvoiceModule, NotificationsModule],
  controllers: [TechnicianController],
  providers: [TechnicianService],
})
export class TechnicianModule {}
