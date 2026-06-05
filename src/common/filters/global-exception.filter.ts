import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { status, message, error } = this.resolveException(exception);

    if (status >= 500) {
      this.logger.error(
        `[${request.method}] ${request.url} → ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(`[${request.method}] ${request.url} → ${status}: ${message}`);
    }

    const isValidationError = Array.isArray(message);

    response.status(status).json({
      success: false,
      statusCode: status,
      error,
      message: isValidationError ? 'Validation failed' : message,
      ...(isValidationError && {
        errors: (message as string[]).map((m) => ({ message: m })),
      }),
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }

  private resolveException(exception: unknown): {
    status: number;
    message: string | string[];
    error: string;
  } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const res = exception.getResponse();

      if (typeof res === 'object' && res !== null) {
        const body = res as Record<string, unknown>;
        return {
          status,
          message: (body['message'] as string | string[]) ?? exception.message,
          error: (body['error'] as string) ?? exception.name,
        };
      }

      return { status, message: res as string, error: exception.name };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'An unexpected error occurred',
      error: 'InternalServerError',
    };
  }
}
