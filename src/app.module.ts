import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { SharedModule } from './shared/shared.module';
import { AuthModule } from './auth/auth.module';
import { SuperAdminModule } from './super-admin/super-admin.module';
import { AdminModule } from './admin/admin.module';
import { ManagerModule } from './manager/manager.module';
import { TechnicianModule } from './technician/technician.module';
import { CustomerModule } from './customer/customer.module';
import { NotificationsModule } from './notifications/notifications.module';
import { UploadModule } from './upload/upload.module';
import { InvoiceModule } from './invoice/invoice.module';
import { OffersModule } from './offers/offers.module';
import { AvailabilityModule } from './availability/availability.module';
import { ServicesModule } from './services/services.module';
import { CategoriesModule } from './categories/categories.module';
import { PackagesModule } from './packages/packages.module';
import { SkillModule } from './skill/skill.module';
import appConfig from './config/app.config';
import jwtConfig from './config/jwt.config';
import cloudinaryConfig from './config/cloudinary.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, jwtConfig, cloudinaryConfig],
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    PrismaModule,
    SharedModule,
    AuthModule,
    SuperAdminModule,
    AdminModule,
    ManagerModule,
    TechnicianModule,
    CustomerModule,
    NotificationsModule,
    UploadModule,
    InvoiceModule,
    OffersModule,
    AvailabilityModule,
    ServicesModule,
    CategoriesModule,
    PackagesModule,
    SkillModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
