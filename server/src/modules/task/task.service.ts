import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { SchedulerRegistry, Cron, CronExpression } from '@nestjs/schedule';
import { CronJob } from 'cron';

// 定时任务服务
@Injectable()
export class TaskService {
  constructor(
    // 定时任务注册器
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {}

  // 注册定时任务
  public registerTask(name: string, cronTime: string, onTick: () => void) {
    try {
      // 创建定时任务
      const job: any = new CronJob(
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
    this.schedulerRegistry.deleteCronJob(name);
  }

  @Cron(CronExpression.EVERY_10_SECONDS)
  openForBusiness() {
    console.log('美味的蛋糕开门营业...');
  }
}
