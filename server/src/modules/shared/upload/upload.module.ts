import { Module } from '@nestjs/common';
import { UploadController } from './upload.controller';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { ServeStaticModule } from '@nestjs/serve-static';
import { UploadService } from './upload.service';
import * as path from 'path';
import * as fs from 'fs';

@Module({
  imports: [
    MulterModule.registerAsync({
      useFactory: () => ({
        storage: diskStorage({
          destination: function (req, file, cb) {
            const uploadDir = path.join(__dirname, `../../../public/uploads/`);
            let fileDir = '';
            // 根据接口参数决定存储目录  append额外的参数必须在append文件之前，不然读不到
            switch (req.body.fileType) {
              case '1':
                fileDir = 'avatar';
                break;
              case '2':
                fileDir = 'homeImg';
                break;
            }
            const dir = `${uploadDir}${fileDir}`;
            // 检查当前路径文件夹是否存在如果不存在则新建文件夹
            if (!fs.existsSync(dir)) {
              fs.mkdirSync(dir, { recursive: true });
            }
            cb(null, dir);
          },
          filename: (req, file, cb) => {
            const extname = path.extname(file.originalname);
            cb(null, `${Date.now()}${extname}`);
          },
        }),
      }),
    }),
    ServeStaticModule.forRoot({
      // 静态文件目录
      rootPath: path.join(__dirname, '../../../public/'),
      // 访问静态文件路径
      serveRoot: '/',
    }),
  ],
  controllers: [UploadController],
  providers: [UploadService],
})
export class UploadModule {}
