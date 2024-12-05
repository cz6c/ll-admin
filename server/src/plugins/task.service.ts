import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AxiosService } from './axios.service';
import { NodemailerService } from '@/modules/nodemailer/nodemailer.service';

// 定时任务服务
@Injectable()
export class TaskService {
  constructor(
    private readonly nodemailerService: NodemailerService,
    private readonly axiosService: AxiosService,
  ) {}

  // @Cron(CronExpression.EVERY_10_SECONDS)
  // async test() {
  //   console.log('🚀 ~ TaskService ~ test');
  // }

  // @Cron(new Date('2024-11-26 16:01:08'))
  // async test1() {
  //   console.log('🚀 ~ TaskService ~ test1');
  // }

  /**
   * @description: 工作日18点 推送最新金价
   */
  @Cron(CronExpression.MONDAY_TO_FRIDAY_AT_6PM)
  async getGoldInfo() {
    console.log(process.env.NODE_APP_INSTANCE);
    // PM2集群模式下 保证只有一个实例执行任务
    if (process.env.NODE_APP_INSTANCE === '0') {
      const res = await this.axiosService.getGoldInfo();
      console.log('🚀 ~ TaskService ~ openForBusiness ~ res:', res);
      const html = `<p>品种名称：${res.varietynm}</p> <p>当前价：${res.last_price}</p> <p>昨收价：${res.yesy_price}</p> <p>涨跌额：${res.change_price}</p> <p>更新时间：${res.uptime}</p>`;
      const options = { to: ['1272654068@qq.com', '769763659@qq.com'], subject: '最新金价', text: 'pushContent', html, pushTask: { remark: '工作日18点 推送最新金价' } };
      this.nodemailerService.sendMail(options);
    }
  }
}
