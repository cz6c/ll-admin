import { applyDecorators } from '@nestjs/common';
import { RedisLockService } from '@/modules/redis/redis-lock.service';

interface LockOptions {
  lockKey: string; // 锁的key
  ttl?: number; // 锁何时过期
  renewal?: boolean; // 锁是否需要续期
}

export function DistributedLock({ lockKey, ttl = 60000, renewal = true }: LockOptions) {
  const injectDependencies = (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
    const originalMethod = descriptor.value;

    // 定义依赖项的引用
    let lockService: RedisLockService;

    // 通过构造函数注入
    const originalInit = target.constructor.prototype.onModuleInit;
    target.constructor.prototype.onModuleInit = function (...args: any[]) {
      lockService = this.lockService;
      return originalInit?.apply(this, args);
    };

    descriptor.value = async function (...args: any[]) {
      if (!lockService) {
        console.error('lockService 未初始化');
      }

      const instanceId = `task_${process.pid}`;

      let renewalTimer: NodeJS.Timeout;
      try {
        // 尝试获取分布式锁
        const acquired = await lockService.acquireLock(lockKey, instanceId, ttl);
        if (!acquired) {
          console.log(`[${this.instanceId}] 未获得任务执行权`);
          return;
        }

        console.log(`[${this.instanceId}] 获得任务执行权`);

        //启动锁续期定时器
        if (renewal) {
          renewalTimer = setInterval(async () => {
            await lockService.renewLock(lockKey, instanceId, ttl);
          }, ttl * 0.8);
        }

        // 执行核心业务逻辑
        await originalMethod.apply(this, args);
      } catch (error) {
        console.error(`[${lockKey}] 任务执行失败:`, error);
      } finally {
        await lockService.releaseLock(lockKey, instanceId);
        if (renewalTimer) {
          clearInterval(renewalTimer);
        }
      }
    };
  };

  return applyDecorators(injectDependencies);
}
