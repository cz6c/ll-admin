import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { HttpExceptionFilter, ExceptionsFilter } from './common/core/filter';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { mw as requestIpMw } from 'request-ip';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  // 开启跨域资源共享
  app.enableCors();

  // 设置访问频率
  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000, // 15分钟
      max: 1000, // 限制15分钟内最多只能访问1000次
    }),
  );

  // 设置 api 访问前缀
  const prefix = config.get<string>('app.prefix');
  app.setGlobalPrefix(prefix);

  // 注册全局过滤器
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalFilters(new ExceptionsFilter());

  // 注册全局拦截器
  // app.useGlobalInterceptors(new TransformInterceptor());

  // 注册全局管道
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // 当设置为 true 时，这将自动删除非白名单属性(在验证类中没有任何修饰符的属性)。提示：如果没有其他装饰器适合您的属性，请使用 @Allow 装饰器。
      transform: true, // 当设置为 true 时，class-transformer 将尝试根据 TS 反映的类型进行转换
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // web 安全，防常见漏洞
  // 注意： 开发环境如果开启 nest static module 需要将 crossOriginResourcePolicy 设置为 false 否则 静态资源 跨域不可访问
  app.use(
    helmet({
      crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
      crossOriginResourcePolicy: false,
    }),
  );

  // 设置swagger文档
  const swaggerOptions = new DocumentBuilder().setTitle('admin').setDescription('admin接口文档').setVersion('1.0').addBearerAuth().build();
  const document = SwaggerModule.createDocument(app, swaggerOptions);
  // 生产环境使用 nginx 可以将当前文档地址 屏蔽外部访问
  SwaggerModule.setup(`${prefix}/swagger-ui`, app, document);

  // 获取真实 ip
  app.use(requestIpMw({ attributeName: 'ip' }));

  // 获取端口号
  const port = config.get<number>('app.port') || 3000;
  await app.listen(port);

  console.log(`➜  运行环境：${process.env.NODE_ENV}`);
  console.log(`➜  服务地址：http://localhost:${port}${prefix}/`);
  console.log(`➜  swagger： http://localhost:${port}${prefix}/swagger-ui/`);
}
bootstrap();
