import { Injectable } from '@nestjs/common';
import * as qiniu from 'qiniu';
import { ConfigService } from '@nestjs/config';

const QINIU = {
  ACCESS_KEY: 'LnBGTt5m6fy4JyleKCeYCh1Hhgh_tuSAN7kiLi4X',
  SECRET_KEY: 'TizLfssZ0aAhpGX_PM1r8wlnCgaTjgh1CBpiD9Sq',
  BUCKET_NAME: 'cz6-hw',
  DOMAIN: 'http://qiniu.cz6hy9.top',
};
@Injectable()
export class UploadService {
  private mac: qiniu.auth.digest.Mac;
  private config: qiniu.conf.Config;
  private bucketManager: qiniu.rs.BucketManager;

  constructor(private readonly configService: ConfigService) {
    this.mac = new qiniu.auth.digest.Mac(QINIU.ACCESS_KEY, QINIU.SECRET_KEY);
    this.config = new qiniu.conf.Config();
    this.bucketManager = new qiniu.rs.BucketManager(this.mac, this.config);
  }

  async uploadFile(localFilePath: string, key: string): Promise<string> {
    // get token
    const putPolicy = new qiniu.rs.PutPolicy({
      scope: `${QINIU.BUCKET_NAME}:${key}`,
    });
    const uploadToken = putPolicy.uploadToken(this.mac);
    // uoload
    const formUploader = new qiniu.form_up.FormUploader(this.config);
    const putExtra = new qiniu.form_up.PutExtra();

    return new Promise((resolve, reject) => {
      formUploader.putFile(uploadToken, key, localFilePath, putExtra, (respErr, respBody, respInfo) => {
        if (respErr) {
          reject(respErr);
        }
        if (respInfo.statusCode === 200) {
          const url = this.pathToDownloadUrl(respBody.key, false);
          resolve(url);
        } else {
          reject(respInfo);
        }
      });
    });
  }

  // 文件的存储路径==>访问链接
  pathToDownloadUrl(path: string, isPrivate: boolean) {
    let url = '';
    if (isPrivate) {
      const deadline = Math.floor(Date.now() / 1000) + 3600; // 1小时过期
      url = this.bucketManager.privateDownloadUrl(QINIU.DOMAIN, path, deadline);
    } else {
      url = this.bucketManager.publicDownloadUrl(QINIU.DOMAIN, path);
    }
    return url;
  }
}
