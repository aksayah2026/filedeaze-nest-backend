import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { CloudinaryService } from '../shared/cloudinary/cloudinary.service';

export interface UploadedFile {
  url: string;
  key: string;
}

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);

  constructor(private readonly cloudinary: CloudinaryService) {}

  async uploadTicketImage(
    tenantId: string,
    ticketId: string,
    file: Express.Multer.File,
  ): Promise<UploadedFile> {
    this.validateFile(file);
    const publicId = this.cloudinary.buildPublicId(tenantId, `tickets/${ticketId}`, file.originalname);
    const { url, publicId: key } = await this.cloudinary.uploadFile(file.buffer, file.mimetype, publicId);
    this.logger.log(`Uploaded ticket image: ${key}`);
    return { url, key };
  }

  async uploadTenantLogo(tenantId: string, file: Express.Multer.File): Promise<UploadedFile> {
    this.validateFile(file);
    const publicId = this.cloudinary.buildPublicId(tenantId, 'logo', file.originalname);
    const { url, publicId: key } = await this.cloudinary.uploadFile(file.buffer, file.mimetype, publicId);
    this.logger.log(`Uploaded tenant logo: ${key}`);
    return { url, key };
  }

  async uploadProfilePhoto(tenantId: string, userId: string, file: Express.Multer.File): Promise<UploadedFile> {
    this.validateFile(file);
    const publicId = this.cloudinary.buildPublicId(tenantId, `profiles/${userId}`, file.originalname);
    const { url, publicId: key } = await this.cloudinary.uploadFile(file.buffer, file.mimetype, publicId);
    this.logger.log(`Uploaded profile photo: ${key}`);
    return { url, key };
  }

  async uploadUpiQr(tenantId: string, file: Express.Multer.File): Promise<UploadedFile> {
    this.validateFile(file);
    const publicId = this.cloudinary.buildPublicId(tenantId, 'upi-qr', file.originalname);
    const { url, publicId: key } = await this.cloudinary.uploadFile(file.buffer, file.mimetype, publicId);
    return { url, key };
  }

  async deleteFile(key: string): Promise<void> {
    await this.cloudinary.deleteFile(key);
    this.logger.log(`Deleted file: ${key}`);
  }

  private validateFile(file: Express.Multer.File): void {
    if (!file) throw new BadRequestException('No file provided');

    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(
        `Invalid file type "${file.mimetype}". Allowed types: ${ALLOWED_MIME_TYPES.join(', ')}`,
      );
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException(
        `File size exceeds the ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB limit`,
      );
    }
  }
}
