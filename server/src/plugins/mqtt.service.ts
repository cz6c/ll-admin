import { Injectable, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { RedisLockService } from '@/modules/redis/redis-lock.service';
import MQTTClientSingleton from '@/common/utils/mqtt';

@Injectable()
export class MqttService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly LOCK_KEY = 'mqtt:subscription:lock'; // 分布式锁的存储键名
  private readonly LOCK_TTL = 30 * 1000; // 锁的有效期
  private isLeader = false; // 是否是当前集群的 Leader

  constructor(private readonly lockService: RedisLockService) {}

  /**
   * 应用启动时自动执行
   */
  async onApplicationBootstrap() {
    await this.tryAcquireLock();
  }

  /**
   * 应用关闭时自动执行
   */
  async onApplicationShutdown() {
    if (this.isLeader) {
      await MQTTClientSingleton.disconnect(); // 优雅关闭 MQTT 连接
      await this.lockService.releaseLock(this.LOCK_KEY);
    }
  }

  /**
   * 尝试获取分布式锁（带失败重试机制）
   * 1. 尝试获取分布式锁
   * 2. 如果成为 Leader，启动 MQTT 客户端
   */
  private async tryAcquireLock() {
    this.isLeader = await this.lockService.acquireLock(this.LOCK_KEY, this.LOCK_TTL, true);
    if (this.isLeader) {
      // 如果成为 Leader，启动 MQTT 客户端
      MQTTClientSingleton.createClient();
    } else {
      // 重试获取锁  当订阅实例失效时，其他实例自动竞争获得订阅权
      setTimeout(() => this.tryAcquireLock(), this.LOCK_TTL);
    }
  }
}
