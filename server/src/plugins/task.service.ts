import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AxiosService } from './axios.service';
import { NodemailerService } from '@/modules/nodemailer/nodemailer.service';
import { RedisLockService } from '@/modules/redis/redis-lock.service';

@Injectable()
export class TaskService implements OnApplicationShutdown {
  private readonly LOCK_KEY = 'gold:price:task:lock';
  private readonly LOCK_TTL = 30000; // 锁的默认有效期（毫秒）
  private instanceId = `task_${process.env.NODE_APP_INSTANCE || 0}`; // 当前实例的唯一标识
  private renewalInterval: NodeJS.Timeout | null = null; // 锁续期定时器

  constructor(
    private readonly nodemailerService: NodemailerService,
    private readonly axiosService: AxiosService,
    private readonly lockService: RedisLockService,
  ) {}

  // 应用关闭时清理资源
  async onApplicationShutdown() {
    await this.lockService.releaseLock(this.LOCK_KEY, this.instanceId);
    clearInterval(this.renewalInterval);
  }

  /**
   * 工作日18点推送最新金价（带分布式锁控制）
   */
  @Cron(CronExpression.MONDAY_TO_FRIDAY_AT_6PM)
  async getGoldInfo() {
    try {
      // 尝试获取分布式锁
      const isLeader = await this.lockService.acquireLock(this.LOCK_KEY, this.instanceId, this.LOCK_TTL);

      if (!isLeader) {
        console.log(`[${this.instanceId}] 未获得任务执行权`);
        return;
      }

      console.log(`[${this.instanceId}] 获得任务执行权`);

      //启动锁续期定时器
      this.renewalInterval = setInterval(async () => {
        const success = await this.lockService.renewLock(this.LOCK_KEY, this.instanceId, this.LOCK_TTL);

        if (!success) {
          console.log(`[${this.instanceId}] 锁续期失败`);
          clearInterval(this.renewalInterval);
        }
      }, this.LOCK_TTL * 0.8); // 在80% TTL时续期

      // 执行核心业务逻辑
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
      this.onApplicationShutdown();
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
