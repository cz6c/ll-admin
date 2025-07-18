import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { UploadService } from "./upload.service";
import { UploadController } from "./upload.controller";
import { SysUploadEntity } from "./entities/upload.entity";
import { ServeStaticModule } from "@nestjs/serve-static";
import { ConfigModule, ConfigService } from "@nestjs/config";
import * as path from "path";

@Module({
  imports: [
    TypeOrmModule.forFeature([SysUploadEntity]),
    ServeStaticModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => [
        {
          // 静态文件目录
          rootPath: path.join(process.cwd(), config.get("app.file.location")),
          // 访问静态文件路径
          serveRoot: config.get("app.file.serveRoot")
        }
      ],
      inject: [ConfigService]
    })
  ],
  controllers: [UploadController],
  providers: [UploadService]
})
export class UploadModule {}
