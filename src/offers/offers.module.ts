import { Module } from '@nestjs/common';
import { OffersService } from './offers.service';
import { WebOffersController, MobileOffersController } from './offers.controller';

@Module({
  controllers: [WebOffersController, MobileOffersController],
  providers: [OffersService],
})
export class OffersModule {}
