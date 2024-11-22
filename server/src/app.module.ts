import { Module, Global } from '@nestjs/common';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ConfigService, ConfigModule } from '@nestjs/config';
import configuration from './config/index';
import { HttpModule } from '@nestjs/axios';
import { RedisClientOptions } from '@liaoliaots/nestjs-redis';
import { RedisModule } from './modules/redis/redis.module';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from 'src/common/guards/auth.guard';
import { RolesGuard } from './common/guards/roles.guard';

import { AxiosModule } from './modules/axios/axios.module';
import { NodemailerModule } from './modules/nodemailer/nodemailer.module';
import { AreaModule } from './modules/area/area.module';
import { UploadModule } from './modules/upload/upload.module';

import { AuthModule } from './modules/system/auth/auth.module';
import { UserModule } from './modules/system/user/user.module';
import { DeptModule } from './modules/system/dept/dept.module';
import { DictModule } from './modules/system/dict/dict.module';
import { MenuModule } from './modules/system/menu/menu.module';
import { RoleModule } from './modules/system/role/role.module';
import { PostModule } from './modules/system/post/post.module';
import { SysConfigModule } from './modules/system/config/config.module';
import { NoticeModule } from './modules/system/notice/notice.module';
import { MainModule } from './modules/main/main.module';
import { CacheModule } from './modules/monitor/cache/cache.module';
import { LoginlogModule } from './modules/monitor/loginlog/loginlog.module';
import { OperlogModule } from './modules/monitor/operlog/operlog.module';
import { OnlineModule } from './modules/monitor/online/online.module';
import { ServerModule } from './modules/monitor/server/server.module';
import { ScheduleModule } from '@nestjs/schedule';
import { EmailService } from './modules/nodemailer/email.service';
import { TaskService } from './modules/task/task.service';

@Global()
@Module({
  imports: [
    // 配置模块
    ConfigModule.forRoot({
      cache: true,
      load: [configuration],
      isGlobal: true, // 设置为全局
    }),
    // 数据库
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (config: ConfigService) =>
        ({
          type: 'mysql',
          autoLoadEntities: true, // 自动导入实体
          keepConnectionAlive: true,
          timezone: '+08:00', //服务器上配置的时区
          ...config.get('db.mysql'),
        }) as TypeOrmModuleOptions,
    }),
    // redis
    RedisModule.forRootAsync(
      {
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService) => {
          return {
            closeClient: true,
            readyLog: true,
            errorLog: true,
            config: config.get<RedisClientOptions>('redis'),
          };
        },
      },
      true,
    ),
    ScheduleModule.forRoot(),
    HttpModule,
    AxiosModule,
    NodemailerModule,
    AreaModule,
    UploadModule,
    AuthModule,
    UserModule,
    DeptModule,
    DictModule,
    MenuModule,
    RoleModule,
    PostModule,
    SysConfigModule,
    NoticeModule,
    MainModule,
    CacheModule,
    LoginlogModule,
    OperlogModule,
    OnlineModule,
    ServerModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    EmailService,
    TaskService,
  ],
  exports: [EmailService, TaskService],
})
export class AppModule {}
