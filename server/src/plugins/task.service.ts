import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AxiosService } from './axios.service';
import { NodemailerService } from '@/modules/nodemailer/nodemailer.service';
import { RedisLockService } from '@/modules/redis/redis-lock.service';

@Injectable()
export class TaskService {
  constructor(
    private readonly nodemailerService: NodemailerService,
    private readonly axiosService: AxiosService,
    private readonly lockService: RedisLockService,
  ) {}

  @Cron(CronExpression.EVERY_5_SECONDS)
  async test() {
    const key = 'test:task:lock',
      ttl = 5000;
    let acquired = false;

    try {
      // 尝试获取锁
      acquired = await this.lockService.acquireLock(key, ttl);
      if (!acquired) return;
      console.log('获得执行权');

      const taskStatus = await this.lockService.getTaskStatus();
      console.log('🚀 ~ TaskService ~ test ~ taskStatus:', taskStatus);
    } catch (error) {
      console.error('任务执行失败:', error);
    } finally {
      if (acquired) await this.lockService.releaseLock(key); // 执行后释放锁
    }
  }

  // @Cron(new Date('2024-11-26 16:01:08'))
  // async test1() {
  //   console.log('🚀 ~ TaskService ~ test1');
  // }

  /**
   * 工作日18点推送最新金价（带分布式锁控制）
   */
  @Cron(CronExpression.MONDAY_TO_FRIDAY_AT_6PM)
  async getGoldInfo() {
    const key = 'gold_price:task:lock',
      ttl = 120 * 1000;
    let acquired = false;

    try {
      // 尝试获取锁
      acquired = await this.lockService.acquireLock(key, ttl);
      if (!acquired) return;
      console.log('获得执行权');

      const res = await this.axiosService.getGoldInfo();

      const html = this.buildEmailHtml(res);
      const options = {
        to: ['1272654068@qq.com', '769763659@qq.com'],
        subject: '最新金价',
        text: 'pushContent',
        html,
        pushTask: { remark: '工作日18点 推送最新金价' },
      };

      await this.nodemailerService.sendMail(options);
    } catch (error) {
      console.error('任务执行失败:', error);
    } finally {
      if (acquired) await this.lockService.releaseLock(key);
    }
  }

  /**
   * 构建邮件HTML内容
   */
  private buildEmailHtml(data: any): string {
    return `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #333;">
        <h2 style="color: #2c3e50;">黄金价格更新</h2>
        <p><strong>品种名称：</strong>${data.varietynm}</p>
        <p style="color: ${this.getPriceColor(data.last_price, data.yesy_price)};">
          <strong>当前价：</strong>${data.last_price}
        </p>
        <p><strong>昨收价：</strong>${data.yesy_price}</p>
        <p><strong>涨跌额：</strong>${data.change_price}</p>
        <p><strong>更新时间：</strong>${data.uptime}</p>
        <hr style="border: 1px solid #eee;">
        <p style="font-size: 0.9em; color: #666;">
          此邮件由系统自动发送，请勿直接回复
        </p>
      </div>
    `;
  }

  /**
   * 根据价格变化获取颜色样式
   */
  private getPriceColor(current: number, previous: number): string {
    return current > previous
      ? '#c0392b' // 上涨红色
      : current < previous
        ? '#27ae60' // 下跌绿色
        : '#7f8c8d'; // 平盘灰色
  }
}
