import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { RedisService } from './redis.service';
import { Redis } from 'ioredis';

@Injectable()
export class RedisLockService implements OnApplicationShutdown {
  private client: Redis;
  private activeLocks = new Set<string>();

  constructor(private readonly redisService: RedisService) {
    this.client = this.redisService.getClient();
  }

  /**
   * 获取分布式锁
   * @param key 锁标识
   * @param ttl 锁有效期(ms)
   * @param renewal 锁启动自动续期
   */
  async acquireLock(key: string, ttl: number, renewal = false): Promise<boolean> {
    const instanceId = `instance_${process.pid || 0}`; // 当前实例的唯一标识
    const result = await this.client.set(key, instanceId, 'PX', ttl, 'NX');

    if (result === 'OK') {
      this.activeLocks.add(key);
      if (renewal) this.startRenewal(key, ttl);
      return true;
    }
    return false;
  }

  /** 启动自动续期 */
  private startRenewal(key: string, ttl: number) {
    const timer = setInterval(async () => {
      if (this.activeLocks.has(key)) {
        const result = await this.client.pexpire(key, ttl);
        console.log('🚀 ~ RedisLockService ~ timer ~ result:', result);
        if (result !== 1) {
          console.log(`[${key}] 锁续期失败`);
          clearInterval(timer);
        }
      } else {
        console.log(`[${key}] 锁已在执行后被释放`);
        clearInterval(timer);
      }
    }, ttl * 0.8); // 在80% TTL时续期
  }

  /** 释放锁 */
  async releaseLock(key: string): Promise<void> {
    this.activeLocks.delete(key);
    await this.client.del(key);
  }

  /** 应用关闭时自动清理 */
  async onApplicationShutdown() {
    await Promise.all(Array.from(this.activeLocks).map((key) => this.releaseLock(key)));
  }

  // 任务状态监控
  async getTaskStatus() {
    const status: Record<string, boolean> = {};
    for (const key of this.activeLocks) {
      status[key] = (await this.client.exists(key)) === 1;
    }
    return status;
  }
}
