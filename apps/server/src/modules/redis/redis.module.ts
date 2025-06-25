import { RedisModule as liaoliaoRedisModule, RedisModuleAsyncOptions } from '@liaoliaots/nestjs-redis';
import { DynamicModule, Global, Module } from '@nestjs/common';

import { RedisService } from './redis.service';
import { RedisLockService } from './redis-lock.service';

@Global()
@Module({
  providers: [RedisService, RedisLockService],
  exports: [RedisService, RedisLockService],
})
export class RedisModule {
  static forRootAsync(options: RedisModuleAsyncOptions, isGlobal = true): DynamicModule {
    return {
      module: RedisModule,
      imports: [liaoliaoRedisModule.forRootAsync(options, isGlobal)],
      providers: [RedisService, RedisLockService],
      exports: [RedisService, RedisLockService],
    };
  }
}
