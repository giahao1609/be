import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class BusinessExceptionFilter implements ExceptionFilter {
  catch(exception: any, host: ArgumentsHost): any {
    const ctx = host.switchToHttp();
    // logger.error(`[${exception.name}] - ${exception.message}`);

    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const status =
      exception instanceof HttpException ? (exception.getStatus() ?? 500) : 400;
    //logger.error(JSON.stringify(exception, null, 2));

    return response.status(400).send({
      message:
        exception?.message ??
        exception?.response?.message ??
        'INTERNAL_ERROR_SERVER',
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      hostname: request.hostname,
      ip: request.ip,
      method: request.method,
      stacktrace: exception,
    });
  }
}
