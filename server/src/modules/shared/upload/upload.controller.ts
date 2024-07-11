import { Controller, Post, UseInterceptors, UploadedFile, HttpException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Express } from 'express';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import { UploadService } from './upload.service';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

@ApiTags('文件上传')
@Controller('api/files')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @ApiConsumes('multipart/form-data')
  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(@UploadedFile() file: Express.Multer.File) {
    // const url = file.path.split('public')[1].replace(/\\/g, '/');
    // return { url };

    // 读取文件内容
    const fileContent = fs.readFileSync(file.path);
    // 计算文件内容的哈希值
    const hash = crypto.createHash('md5').update(fileContent).digest('hex');
    const extname = path.extname(file.originalname);
    const isProd = process.env.NODE_ENV === 'production';
    const key = isProd ? `${hash}${extname}` : `test/${hash}${extname}`;
    try {
      const url = await this.uploadService.uploadFile(file.path, key);
      fs.unlinkSync(file.path);
      return { url };
    } catch (error) {
      throw new HttpException(error.message || error, 200);
    }
  }
}
