import { Injectable } from '@nestjs/common';
import { RedisService } from './redis.service';
import { Redis } from 'ioredis';
import { CacheEnum } from '@/common/enum/loca';

@Injectable()
export class RedisLockService {
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
      console.log(`[${k}], [${instanceId}] 获得执行权`);
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
    const k = key.includes(CacheEnum.DISTRIBUTED_LOCK_KEY) ? key : this.composeKey(key);
    this.activeLocks.delete(k);
    const result = await this.client.del(k);
    if (result !== 1) {
      console.log(`[${k}] 释放锁失败`);
    } else {
      console.log(`[${k}] 锁释放成功`);
    }
  }

  async getLockKeys() {
    const keys = await this.client.keys(`${CacheEnum.DISTRIBUTED_LOCK_KEY}*`);
    console.log('🚀 ~ RedisLockService ~ getLockKeys ~ keys:', keys);
  }

  /**
   * 应用关闭时执行
   */
  async onApplicationShutdown() {
    await Promise.all(Array.from(this.activeLocks).map((key) => this.releaseLock(key)));
  }
}
