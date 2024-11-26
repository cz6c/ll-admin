import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { SchedulerRegistry, Cron, CronExpression } from '@nestjs/schedule';
import { CronJob, CronTime } from 'cron';
import { EmailService } from './email.service';
import { AxiosService } from './axios.service';

// 定时任务服务
@Injectable()
export class TaskService {
  constructor(
    // 定时任务注册器
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly emailService: EmailService,
    private readonly axiosService: AxiosService,
  ) {}

  // 注册定时任务
  public registerTask(name: string, cronTime: string | Date, onTick: () => void) {
    try {
      // 创建定时任务
      const job: CronJob = new CronJob(
        cronTime,
        onTick,
        null, // onComplete
      );
      // 添加定时任务
      this.schedulerRegistry.addCronJob(name, job);
      // 启动定时任务
      job.start();
    } catch (e) {
      throw new HttpException(e, HttpStatus.BAD_REQUEST);
    }
  }
  // 删除任务
  public deleteCron(name: string) {
    this.schedulerRegistry.getCronJob(name) && this.schedulerRegistry.deleteCronJob(name);
  }
  // 暂停CronJob
  public stopCronJob(name: string) {
    return this.schedulerRegistry.getCronJob(name)?.stop();
  }
  // 启动CronJob
  public startCronJob(name: string) {
    return this.schedulerRegistry.getCronJob(name)?.start();
  }
  // 重新设置CronJob时间
  public setTimeCronJob(name: string, cronTime: CronTime) {
    return this.schedulerRegistry.getCronJob(name)?.setTime(cronTime);
  }

  // @Cron(CronExpression.EVERY_10_SECONDS)
  // async test() {
  //   const res = await this.axiosService.getGoldInfo();
  //   console.log('🚀 ~ TaskService ~ openForBusiness ~ res:', res);
  // }

  /**
   * @description: 工作日18点 推送最新金价
   * @return
   */
  @Cron(CronExpression.MONDAY_TO_FRIDAY_AT_6PM)
  async getGoldInfo() {
    const res = await this.axiosService.getGoldInfo();
    console.log('🚀 ~ TaskService ~ openForBusiness ~ res:', res);
    const html = `<p>品种名称：${res.varietynm}</p> <p>当前价：${res.last_price}</p> <p>昨收价：${res.yesy_price}</p> <p>涨跌额：${res.change_price}</p> <p>更新时间：${res.uptime}</p>`;
    this.emailService.sendMail(['1272654068@qq.com', '769763659@qq.com'], '最新金价', 'pushContent', html);
  }

  // @Cron(new Date('2024-11-26 16:01:08'))
  // async openForBusiness1() {
  //   const res = await this.axiosService.getGoldInfo();
  //   console.log('🚀 ~ TaskService ~ openForBusiness ~ res:', res);
  //   const html = `<p>品种名称：${res.varietynm}</p> <p>当前价：${res.last_price}</p> <p>昨收价：${res.yesy_price}</p> <p>涨跌额：${res.change_price}</p> <p>更新时间：${res.uptime}</p>`;
  //   this.emailService.sendMail(['1272654068@qq.com', '769763659@qq.com'], '最新金价', 'pushContent', html);
  // }
}
