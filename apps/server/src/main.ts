import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { HttpExceptionFilter, ExceptionsFilter } from './common/core/filter';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { mw as requestIpMw } from 'request-ip';
import { RedisLockService } from './modules/redis/redis-lock.service';
import { MqttService } from './plugins/mqtt.service';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { isArray } from '@packages/common';
import { promises as fs } from 'node:fs';
console.log(isArray([]));

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = app.get(WINSTON_MODULE_NEST_PROVIDER);
  app.useLogger(logger);
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
  if (process.env.NODE_ENV === 'development') {
    fs.writeFile('./swagger.json', JSON.stringify(document));
  }

  // 获取真实 ip
  app.use(requestIpMw({ attributeName: 'ip' }));

  // 获取端口号
  const port = config.get<number>('app.port') || 3000;
  await app.listen(port);

  logger.log(`➜  运行环境：${process.env.NODE_ENV}`);
  logger.log(`➜  服务地址：http://localhost:${port}${prefix}/`);
  logger.log(`➜  swagger： http://localhost:${port}${prefix}/swagger-ui/`);

  // 监听线程消息
  process.on('message', async function (msg) {
    // 处理进程关闭
    if (msg == 'shutdown') {
      logger.log(`${process.pid} Closing all connections...`);

      // 最大允许关闭时间
      setTimeout(() => {
        logger.error('关闭超时，强制退出');
        process.exit(1);
      }, 9000); // 略小于 PM2 的 kill_timeout

      const shutdownSteps = [
        { action: '释放分布式锁', handler: () => app.get(RedisLockService).onApplicationShutdown() },
        { action: '关闭MQTT连接', handler: () => app.get(MqttService).onApplicationShutdown() },
        // { action: '关闭HTTP服务', handler: () => app.close() },
      ];

      for (const step of shutdownSteps) {
        try {
          logger.log(`${process.pid} 执行步骤: ${step.action}`);
          await step.handler();
        } catch (err) {
          logger.error(`${process.pid} ${step.action} 失败`, err);
        }
      }
      logger.log(`${process.pid} Finished closing connections`);
      process.exit(0);
    }
  });
}
bootstrap();
