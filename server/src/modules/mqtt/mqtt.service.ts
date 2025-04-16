import { Injectable, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { RedisLockService } from './redis-lock.service';
import MQTTClientSingleton from '@/common/utils/mqtt';

@Injectable()
export class MqttService implements OnApplicationBootstrap, OnApplicationShutdown {
  private instanceId: string; // 当前实例的唯一标识
  private isLeader = false; // 是否是当前集群的 Leader
  private renewalInterval: NodeJS.Timeout | null = null; // 锁续期定时器

  constructor(private readonly lockService: RedisLockService) {
    // 生成实例唯一ID，使用 PM2 实例编号（集群模式下有效）
    this.instanceId = `instance_${process.env.NODE_APP_INSTANCE || 0}`;
  }

  /**
   * 应用启动时自动执行
   * 1. 尝试获取分布式锁
   * 2. 如果成为 Leader，启动 MQTT 客户端
   */
  async onApplicationBootstrap() {
    await this.tryAcquireLock();
    if (this.isLeader) {
      this.startMqttClient();
      this.startLockRenewal();
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
      await this.lockService.releaseLock(this.instanceId);
      clearInterval(this.renewalInterval);
    }
  }

  /**
   * 尝试获取分布式锁（带失败重试机制）
   */
  private async tryAcquireLock() {
    this.isLeader = await this.lockService.acquireLock(this.instanceId);
    console.log('🚀 ~ MqttService ~ tryAcquireLock ~ this.isLeader:', this.isLeader);
    if (!this.isLeader) {
      console.log(`[${this.instanceId}] 当前实例未获得订阅权`);
      // 12秒后重试获取锁
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
    // 每20秒续期一次（早于30秒的TTL）
    this.renewalInterval = setInterval(async () => {
      await this.lockService.renewLock(this.instanceId);
    }, 20000);
  }

  /**
   * 启动 MQTT 客户端并订阅主题
   */
  private startMqttClient() {
    MQTTClientSingleton.createClient();
  }
}
