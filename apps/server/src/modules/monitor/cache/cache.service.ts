import { Injectable } from "@nestjs/common";
import { RedisService } from "@/modules/redis/redis.service";
import { DeepClone } from "@/common/utils/index";
import { ResultData } from "@/common/utils/result";
import { CacheEnum } from "@/common/enum/loca";

@Injectable()
export class CacheService {
  constructor(private readonly redisService: RedisService) {}

  private readonly caches = [
    {
      cacheName: CacheEnum.LOGIN_TOKEN_KEY,
      cacheKey: "",
      cacheValue: "",
      remark: "用户信息"
    },
    {
      cacheName: CacheEnum.CAPTCHA_CODE_KEY,
      cacheKey: "",
      cacheValue: "",
      remark: "验证码"
    },
    {
      cacheName: CacheEnum.DISTRIBUTED_LOCK_KEY,
      cacheKey: "",
      cacheValue: "",
      remark: "分布式锁"
    }
    // {
    //   cacheName: 'pwd_err_cnt:',
    //   cacheKey: '',
    //   cacheValue: '',
    //   remark: '密码错误次数',
    // },
    // {
    //   cacheName: 'ma_code:',
    //   cacheKey: '',
    //   cacheValue: '',
    //   remark: '微信code存储',
    // },
  ];

  // 缓存列表
  getNames() {
    return ResultData.ok(this.caches);
  }

  // 键名列表
  async getKeys(id: string) {
    const data = await this.redisService.keys(id + "*");
    return ResultData.ok(data);
  }

  // 清理缓存名称
  async clearCacheName(id: string) {
    const keys = await this.redisService.keys(id + "*");
    const data = await this.redisService.del(keys);
    return ResultData.ok(data);
  }

  // 清理缓存键名
  async clearCacheKey(id: string) {
    const data = await this.redisService.del(id);
    return ResultData.ok(data);
  }

  async clearCacheAll() {
    const data = await this.redisService.reset();
    return ResultData.ok(data);
  }

  // 缓存内容
  async getValue(params) {
    const list = DeepClone(this.caches) as Array<any>;
    const data = list.find(item => item.cacheName === params.cacheName);
    const cacheValue = await this.redisService.get(params.cacheKey);
    data.cacheValue = JSON.stringify(cacheValue);
    data.cacheKey = params.cacheKey;
    return ResultData.ok(data);
  }

  /**
   * 缓存监控
   * @returns
   */
  async getInfo() {
    const info = await this.redisService.getInfo();
    const dbSize = await this.redisService.getDbSize();
    const commandStats = await this.redisService.commandStats();
    return ResultData.ok({
      dbSize: dbSize,
      info: info,
      commandStats: commandStats
    });
  }
}
