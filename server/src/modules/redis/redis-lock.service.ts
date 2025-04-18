import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { RedisService } from './redis.service';
import { Redis } from 'ioredis';
import { CacheEnum } from '@/common/enum/loca';

@Injectable()
export class RedisLockService implements OnApplicationShutdown {
  private client: Redis;
  private activeLocks = new Set<string>();

  constructor(private readonly redisService: RedisService) {
    this.client = this.redisService.getClient();
  }

  private composeKey(key: string): string {
    return `${CacheEnum.DISTRIBUTED_LOCK_KEY}${key}`;
  }

  /**
   * 获取分布式锁
   * @param key 锁标识
   * @param ttl 锁有效期(ms)
   * @param renewal 锁启动自动续期
   */
  async acquireLock(key: string, ttl: number, renewal = false): Promise<boolean> {
    const k = this.composeKey(key);
    const instanceId = `instance_${process.pid || 0}`; // 当前实例的唯一标识
    const result = await this.client.set(k, JSON.stringify({ instanceId, ttl, renewal }), 'PX', ttl, 'NX');

    if (result === 'OK') {
      this.activeLocks.add(k);
      if (renewal) this.startRenewal(k, ttl);
      return true;
    }
    return false;
  }

  /** 启动自动续期 */
  private startRenewal(key: string, ttl: number) {
    const timer = setInterval(async () => {
      if (this.activeLocks.has(key)) {
        const result = await this.client.pexpire(key, ttl);
        if (result !== 1) {
          console.log(`[${key}] 锁续期失败`);
          clearInterval(timer);
        }
      } else {
        console.log(`[${key}] 锁不存在或者执行后被释放`);
        clearInterval(timer);
      }
    }, ttl * 0.8); // 在80% TTL时续期
  }

  /** 释放锁 */
  async releaseLock(key: string): Promise<void> {
    const k = this.composeKey(key);
    this.activeLocks.delete(k);
    await this.client.del(k);
  }

  /** 应用关闭时自动清理 */
  async onApplicationShutdown() {
    await Promise.all(Array.from(this.activeLocks).map((key) => this.releaseLock(key)));
  }
}
