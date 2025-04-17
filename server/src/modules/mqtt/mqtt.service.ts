import { Injectable, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { RedisLockService } from '@/modules/redis/redis-lock.service';
import MQTTClientSingleton from '@/common/utils/mqtt';

@Injectable()
export class MqttService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly LOCK_KEY = 'mqtt:subscription:lock'; // 分布式锁的存储键名
  private readonly LOCK_TTL = 30000; // 锁的默认有效期（毫秒）
  private instanceId = `instance_${process.env.NODE_APP_INSTANCE || 0}`; // 当前实例的唯一标识
  private renewalInterval: NodeJS.Timeout | null = null; // 锁续期定时器
  private isLeader = false; // 是否是当前集群的 Leader

  constructor(private readonly lockService: RedisLockService) {}

  /**
   * 应用启动时自动执行
   * 1. 尝试获取分布式锁
   * 2. 如果成为 Leader，启动 MQTT 客户端
   */
  async onApplicationBootstrap() {
    await this.tryAcquireLock();
    if (this.isLeader) {
      this.startLockRenewal();
      this.startMqttClient();
    }
  }

  /**
   * 应用关闭时自动执行
   * 1. 如果是 Leader，关闭 MQTT 连接
   * 2. 释放分布式锁
   */
  async onApplicationShutdown() {
    if (this.isLeader) {
      await MQTTClientSingleton.disconnect(); // 优雅关闭 MQTT 连接
      await this.lockService.releaseLock(this.LOCK_KEY, this.instanceId);
      clearInterval(this.renewalInterval);
    }
  }

  /**
   * 尝试获取分布式锁（带失败重试机制）
   */
  private async tryAcquireLock() {
    this.isLeader = await this.lockService.acquireLock(this.LOCK_KEY, this.instanceId, this.LOCK_TTL);
    if (!this.isLeader) {
      console.log(`[${this.instanceId}] 当前实例未获得订阅权`);
      // 12秒后重试获取锁  当订阅实例失效时，其他实例自动竞争获得订阅权
      setTimeout(() => this.tryAcquireLock(), 12000);
    }
  }

  /**
   * 启动锁续期定时器
   *
   * 为什么需要续期：
   * 如果锁的有效期（TTL）到期前业务未完成，
   * 需要定时续期防止锁自动失效导致多个实例同时成为 Leader
   */
  private startLockRenewal() {
    this.renewalInterval = setInterval(async () => {
      const success = await this.lockService.renewLock(this.LOCK_KEY, this.instanceId, this.LOCK_TTL);

      if (!success) {
        console.log(`[${this.instanceId}] 锁续期失败`);
        clearInterval(this.renewalInterval);
      }
    }, this.LOCK_TTL * 0.8); // 在80% TTL时续期
  }

  /**
   * 启动 MQTT 客户端并订阅主题
   */
  private startMqttClient() {
    MQTTClientSingleton.createClient();
  }
}
