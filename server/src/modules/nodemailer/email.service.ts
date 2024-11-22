import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private transporter;
  constructor(private readonly configService: ConfigService) {
    const mailConfig = this.configService.get('mail');
    this.transporter = nodemailer.createTransport(mailConfig);
  }

  // 发送邮件
  async sendMail(to: string, subject: string, text: string, html?: string): Promise<void> {
    const mailConfig = this.configService.get('mail');
    const mailOptions = {
      from: mailConfig.auth.user,
      to,
      subject,
      text,
      html,
    };
    await this.transporter.sendMail(mailOptions);
  }
}
