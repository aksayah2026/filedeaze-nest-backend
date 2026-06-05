import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
export class FirebaseService implements OnModuleInit {
  private readonly logger = new Logger(FirebaseService.name);

  constructor(private config: ConfigService) {}

  onModuleInit() {
    if (admin.apps.length === 0) {
      const serviceAccountPath = this.config.get<string>('FIREBASE_SERVICE_ACCOUNT_PATH');
      if (serviceAccountPath) {
        const resolved = path.resolve(process.cwd(), serviceAccountPath);
        const serviceAccount = JSON.parse(fs.readFileSync(resolved, 'utf8'));
        admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
      } else {
        admin.initializeApp({ credential: admin.credential.applicationDefault() });
      }
      this.logger.log('Firebase Admin initialized');
    }
  }

  async sendPushNotification(token: string, title: string, body: string, data?: Record<string, string>) {
    try {
      const message: admin.messaging.Message = {
        token,
        notification: { title, body },
        data: data || {},
        android: { priority: 'high' },
        apns: { payload: { aps: { sound: 'default' } } },
      };
      const result = await admin.messaging().send(message);
      return result;
    } catch (error) {
      this.logger.error(`Push notification failed: ${(error as Error).message}`);
    }
  }

  async sendMulticast(tokens: string[], title: string, body: string, data?: Record<string, string>) {
    if (!tokens.length) return;
    try {
      const message: admin.messaging.MulticastMessage = {
        tokens,
        notification: { title, body },
        data: data || {},
        android: { priority: 'high' },
      };
      const result = await admin.messaging().sendEachForMulticast(message);
      this.logger.log(`Sent ${result.successCount}/${tokens.length} notifications`);
      return result;
    } catch (error) {
      this.logger.error(`Multicast notification failed: ${(error as Error).message}`);
    }
  }
}
