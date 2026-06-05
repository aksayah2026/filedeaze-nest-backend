import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Readable } from 'stream';

@Injectable()
export class MinioService {
  private readonly s3: S3Client;
  private readonly bucket: string;

  constructor(private config: ConfigService) {
    this.bucket = config.get<string>('MINIO_BUCKET', 'fieldeaze');
    this.s3 = new S3Client({
      endpoint: config.get<string>('MINIO_ENDPOINT'),
      region: config.get<string>('MINIO_REGION', 'us-east-1'),
      credentials: {
        accessKeyId: config.get<string>('MINIO_ACCESS_KEY'),
        secretAccessKey: config.get<string>('MINIO_SECRET_KEY'),
      },
      forcePathStyle: true,
    });
  }

  async uploadFile(
    key: string,
    body: Buffer | Readable,
    contentType: string,
  ): Promise<string> {
    try {
      const upload = new Upload({
        client: this.s3,
        params: {
          Bucket: this.bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
        },
      });
      await upload.done();
      return `${this.config.get('MINIO_PUBLIC_URL')}/${this.bucket}/${key}`;
    } catch (error) {
      throw new InternalServerErrorException('File upload failed: ' + (error as Error).message);
    }
  }

  async deleteFile(key: string): Promise<void> {
    await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async getSignedUrl(key: string, expiresIn = 3600): Promise<string> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(this.s3, command, { expiresIn });
  }

  buildKey(tenantId: string, folder: string, filename: string): string {
    return `tenants/${tenantId}/${folder}/${Date.now()}-${filename}`;
  }
}
