import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';

// HttpException异常过滤器
@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp(); // 获取请求上下文
    const response = ctx.getResponse(); // 获取请求上下文中的 response对象
    const status = exception.getStatus(); // 获取异常状态码

    // 设置错误信息
    const exceptionResponse = exception.getResponse();
    let validatorMessage = exceptionResponse;
    if (typeof exceptionResponse === 'object') {
      const { message } = exceptionResponse as { message: string[] | string };
      validatorMessage = Array.isArray(message) ? message[0] : message;
    }

    response.status(200).json({
      code: status,
      message: validatorMessage || `${status >= 500 ? 'Service Error' : 'Client Error'}`,
      data: null,
    });
  }
}
