import { registerAs } from '@nestjs/config';

export default registerAs('minio', () => ({
  endpoint: process.env.MINIO_ENDPOINT ?? 'http://localhost:9000',
  accessKey: process.env.MINIO_ACCESS_KEY ?? '',
  secretKey: process.env.MINIO_SECRET_KEY ?? '',
  bucket: process.env.MINIO_BUCKET ?? 'fieldeaze',
  region: process.env.MINIO_REGION ?? 'us-east-1',
  publicUrl: process.env.MINIO_PUBLIC_URL ?? 'http://localhost:9000',
}));
