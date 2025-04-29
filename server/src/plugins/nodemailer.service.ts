import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { SendMailOptionsType } from '@/modules/nodemailer/dto';

@Injectable()
export class NodemailerService {
  private readonly logger = new Logger(NodemailerService.name);
  private transporter: nodemailer.Transporter;
  private mailConfig;
  constructor(
    // 定时任务注册器
    private readonly configService: ConfigService,
  ) {
    this.mailConfig = this.configService.get('mail');
    this.transporter = nodemailer.createTransport(this.mailConfig);
  }

  // 发送邮件
  async sendMail(options: SendMailOptionsType) {
    const { to, subject, text, html, pushTask } = options;
    // const pushLog = {
    //   acceptEmail: isArray(to) ? to.join(',') : to,
    //   pushTitle: subject,
    //   pushContent: html || text,
    //   ...pushTask,
    // };
    try {
      const mailOptions = {
        from: this.mailConfig.auth.user,
        to,
        subject,
        text,
        html,
      };
      await this.transporter.sendMail(mailOptions);
      // this.createPushLog({ ...pushLog, pushStatus: SuccessErrorEnum.SUCCESS });
    } catch (error) {
      // this.createPushLog({ ...pushLog, pushStatus: SuccessErrorEnum.FAIL });
      this.logger.error('🚀 sendMail ~ error:', error);
    }
  }
}
