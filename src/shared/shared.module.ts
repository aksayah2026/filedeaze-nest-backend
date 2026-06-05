import { Global, Module } from '@nestjs/common';
import { CloudinaryService } from './cloudinary/cloudinary.service';
import { FirebaseService } from './firebase/firebase.service';
import { ResendService } from './resend/resend.service';
import { PlanLimitService } from './plan-limit/plan-limit.service';

@Global()
@Module({
  providers: [CloudinaryService, FirebaseService, ResendService, PlanLimitService],
  exports: [CloudinaryService, FirebaseService, ResendService, PlanLimitService],
})
export class SharedModule {}
