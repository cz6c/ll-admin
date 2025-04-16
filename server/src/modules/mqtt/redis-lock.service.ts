import { Injectable } from '@nestjs/common';
import { RedisService } from '@/modules/redis/redis.service';
import { Redis } from 'ioredis';

@Injectable()
export class RedisLockService {
  private readonly client: Redis;
  // 分布式锁的存储键名
  private readonly LOCK_KEY = 'mqtt:subscription:lock';
  // 锁的默认有效期（毫秒）
  private readonly LOCK_TTL = 30000;

  constructor(private readonly redisService: RedisService) {
    this.client = this.redisService.getClient();
  }

  /**
   * 尝试获取分布式锁
   * @param instanceId 当前实例的唯一标识
   * @returns 是否成功获得锁
   *
   * 实现原理：
   * 使用 Redis 的 SET 命令配合 NX 和 PX 参数：
   * - NX: 仅当键不存在时设置值
   * - PX: 设置键的过期时间（毫秒）
   * 这样可以保证原子性的获取锁操作
   */
  async acquireLock(instanceId: string): Promise<boolean> {
    const result = await this.client.set(
      this.LOCK_KEY,
      instanceId,
      'PX', // 以毫秒为单位设置过期时间
      this.LOCK_TTL,
      'NX', // 仅在键不存在时设置
    );
    console.log('🚀 ~ RedisLockService ~ acquireLock ~ result:', instanceId, result);
    return result === 'OK'; // 返回 'OK' 表示获取锁成功
  }

  /**
   * 续期锁的有效期
   * @param instanceId 当前实例的唯一标识
   *
   * 安全机制：
   * 1. 先检查当前锁的持有者是否是自己
   * 2. 只有持有者才能续期，避免其他实例干扰
   */
  async renewLock(instanceId: string): Promise<void> {
    const currentHolder = await this.client.get(this.LOCK_KEY);
    if (currentHolder === instanceId) {
      // 使用 PEXPIRE 命令延长锁的生存时间
      await this.client.pexpire(this.LOCK_KEY, this.LOCK_TTL);
    }
  }

  /**
   * 释放分布式锁
   * @param instanceId 当前实例的唯一标识
   *
   * 安全机制：
   * 1. 先验证锁的持有者是否是自己
   * 2. 只有持有者才能删除锁
   * 3. 使用 DEL 命令删除键
   */
  async releaseLock(instanceId: string): Promise<void> {
    const currentHolder = await this.client.get(this.LOCK_KEY);
    if (currentHolder === instanceId) {
      await this.client.del(this.LOCK_KEY);
    }
  }
}
