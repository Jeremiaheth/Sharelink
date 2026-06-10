import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * Global exception filter for consistent error responses.
 * Handles both HttpException and unexpected errors.
 * Provides structured JSON error responses with logging.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? exception.getResponse()
        : { message: 'Internal server error' };

    const errorResponse = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      message,
    };

    // Log the error with stack trace for debugging
    if (exception instanceof Error) {
      this.logger.error(
        `${request.method} ${request.url} - Status: ${status}`,
        exception.stack,
      );
    } else {
      this.logger.error(
        `${request.method} ${request.url} - Status: ${status}`,
        JSON.stringify(exception),
      );
    }

    response.status(status).json(errorResponse);
  }
}
