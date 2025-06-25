import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';

// 应用级异常过滤器
@Catch()
export class ExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ExceptionsFilter.name);

  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    // 设置错误信息
    const exceptionResponse = exception instanceof HttpException ? exception.getResponse() : exception;
    this.logger.error('🚀 ~ ExceptionsFilter ~ exceptionResponse:', exceptionResponse);
    let validatorMessage = exceptionResponse;
    if (typeof exceptionResponse === 'object') {
      const { message } = exceptionResponse as { message: string[] | string };
      validatorMessage = Array.isArray(message) ? message[0] : message;
    }

    response.status(status).json({
      code: status,
      msg: `Service Error: ${validatorMessage}`,
      data: null,
    });
  }
}
