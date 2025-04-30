import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

export interface SendMailOptionsType {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
  pushTask: {
    pushtaskId?: number;
    pushtaskName?: string;
    remark?: string;
  };
}

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
    const { to, subject, text, html } = options;
    try {
      const mailOptions = {
        from: this.mailConfig.auth.user,
        to,
        subject,
        text,
        html,
      };
      await this.transporter.sendMail(mailOptions);
    } catch (error) {
      this.logger.error('🚀 sendMail ~ error:', error);
    }
  }
}
