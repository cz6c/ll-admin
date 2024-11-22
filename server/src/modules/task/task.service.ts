import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { SchedulerRegistry, Cron } from '@nestjs/schedule';
import { CronJob, CronTime } from 'cron';
import { EmailService } from '../nodemailer/email.service';

// 定时任务服务
@Injectable()
export class TaskService {
  constructor(
    // 定时任务注册器
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly emailService: EmailService,
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

  @Cron(`0 0 12 * * ?`)
  openForBusiness() {
    console.log('表达式');
    this.emailService.sendMail('1272654068@qq.com', 'pushTitle', 'pushContent');
  }

  // @Cron(new Date('2024-11-22 18:04:00'))
  // openForBusiness1() {
  //   console.log('时间对象，必须是未来时间');
  // }
}
