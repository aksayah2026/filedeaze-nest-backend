import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Request, Response } from 'express';

export interface ApiResponse<T> {
  success: boolean;
  statusCode: number;
  message?: string;
  data: T;
  timestamp: string;
  path: string;
}

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<ApiResponse<T>> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    return next.handle().pipe(
      map((payload) => {
        const statusCode = response.statusCode;
        const timestamp = new Date().toISOString();
        const path = request.url;

        // If service returned a structured object with a 'data' or 'message' key,
        // unwrap it to avoid double-nesting (e.g. { data: X } → { success, data: X })
        if (payload !== null && typeof payload === 'object') {
          const p = payload as Record<string, unknown>;
          if ('data' in p || 'message' in p) {
            return {
              success: true,
              statusCode,
              timestamp,
              path,
              ...(p['message'] !== undefined && { message: p['message'] }),
              data: 'data' in p ? p['data'] : null,
            } as ApiResponse<T>;
          }
        }

        return { success: true, statusCode, timestamp, path, data: payload };
      }),
    );
  }
}
