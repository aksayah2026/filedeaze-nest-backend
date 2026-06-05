import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary, UploadApiResponse, UploadApiErrorResponse } from 'cloudinary';
import { Readable } from 'stream';

@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);

  constructor(private readonly config: ConfigService) {
    cloudinary.config({
      cloud_name: config.get<string>('CLOUDINARY_CLOUD_NAME'),
      api_key: config.get<string>('CLOUDINARY_API_KEY'),
      api_secret: config.get<string>('CLOUDINARY_API_SECRET'),
    });
  }

  async uploadFile(
    buffer: Buffer,
    contentType: string,
    publicId: string,
  ): Promise<{ url: string; publicId: string }> {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { public_id: publicId, resource_type: 'image', overwrite: true },
        (error: UploadApiErrorResponse | undefined, result: UploadApiResponse | undefined) => {
          if (error || !result) {
            reject(new InternalServerErrorException('File upload failed: ' + (error?.message ?? 'unknown error')));
          } else {
            resolve({ url: result.secure_url, publicId: result.public_id });
          }
        },
      );

      const readable = new Readable();
      readable.push(buffer);
      readable.push(null);
      readable.pipe(uploadStream);
    });
  }

  async deleteFile(publicId: string): Promise<void> {
    try {
      await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
    } catch (error) {
      this.logger.error(`Cloudinary delete failed for ${publicId}: ${(error as Error).message}`);
      // Don't throw — file deletion failure should not crash the business operation
    }
  }

  buildPublicId(tenantId: string, folder: string, filename: string): string {
    const base = filename.replace(/\.[^/.]+$/, '');
    return `fieldeaze/tenants/${tenantId}/${folder}/${Date.now()}-${base}`;
  }
}
