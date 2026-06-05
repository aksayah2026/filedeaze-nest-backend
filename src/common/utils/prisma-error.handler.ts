import {
  ConflictException,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

const logger = new Logger('PrismaErrorHandler');

export function handlePrismaError(error: unknown, context?: string): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case 'P2002': {
        const fields = (error.meta?.['target'] as string[])?.join(', ') ?? 'field';
        throw new ConflictException(`A record with this ${fields} already exists`);
      }
      case 'P2025':
        throw new NotFoundException(context ? `${context} not found` : 'Record not found');
      case 'P2003':
        throw new BadRequestException('Related record does not exist');
      case 'P2014':
        throw new BadRequestException('Invalid relation — record dependency violation');
      default:
        logger.error(`Prisma error [${error.code}]: ${error.message}`);
        throw new InternalServerErrorException('Database operation failed');
    }
  }

  if (error instanceof Prisma.PrismaClientValidationError) {
    logger.error(`Prisma validation error: ${error.message}`);
    throw new BadRequestException('Invalid data provided');
  }

  if (error instanceof Error) {
    logger.error(`Unhandled error in ${context ?? 'service'}: ${error.message}`, error.stack);
  }

  throw error;
}
