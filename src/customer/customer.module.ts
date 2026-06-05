import { Module } from '@nestjs/common';
import { CustomerController } from './customer.controller';
import { CustomerService } from './customer.service';
import { UploadModule } from '../upload/upload.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [UploadModule, NotificationsModule],
  controllers: [CustomerController],
  providers: [CustomerService],
})
export class CustomerModule {}
