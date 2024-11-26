import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private transporter: nodemailer.Transporter;
  private mailConfig;
  constructor(private readonly configService: ConfigService) {
    this.mailConfig = this.configService.get('mail');
    this.transporter = nodemailer.createTransport(this.mailConfig);
  }

  // 发送邮件
  async sendMail(to: string | string[], subject: string, text: string, html?: string): Promise<void> {
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
      console.log('🚀 ~ EmailService ~ sendMail ~ error:', error);
    }
  }
}
