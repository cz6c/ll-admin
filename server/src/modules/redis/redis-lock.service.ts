import { Injectable } from '@nestjs/common';
import { RedisService } from '@/modules/redis/redis.service';
import { Redis } from 'ioredis';

@Injectable()
export class RedisLockService {
  private readonly client: Redis;

  constructor(private readonly redisService: RedisService) {
    this.client = this.redisService.getClient();
  }

  /**
   * 获取分布式锁
   * @param lockKey 锁名称
   * @param instanceId 实例标识
   * @param ttl 锁有效期(毫秒)
   */
  async acquireLock(lockKey: string, instanceId: string, ttl: number): Promise<boolean> {
    const result = await this.client.set(
      lockKey,
      instanceId,
      'PX', // 毫秒级TTL
      ttl,
      'NX', // 仅当不存在时设置
    );
    return result === 'OK';
  }

  /**
   * 释放分布式锁
   * @param lockKey 锁名称
   * @param instanceId 实例标识
   */
  async releaseLock(lockKey: string, instanceId: string): Promise<void> {
    const script = `
      if redis.call("GET", KEYS[1]) == ARGV[1] then
        return redis.call("DEL", KEYS[1])
      else
        return 0
      end
    `;
    await this.client.eval(script, 1, lockKey, instanceId);
  }

  /**
   * 续期锁有效期
   * @param lockKey 锁名称
   * @param instanceId 实例标识
   * @param ttl 新的有效期(毫秒)
   */
  async renewLock(lockKey: string, instanceId: string, ttl: number): Promise<boolean> {
    const script = `
      if redis.call("GET", KEYS[1]) == ARGV[1] then
        return redis.call("PEXPIRE", KEYS[1], ARGV[2])
      else
        return 0
      end
    `;
    const result = await this.client.eval(script, 1, lockKey, instanceId, ttl);
    return result === 1;
  }
}
