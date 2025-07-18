/**
 * 缓存的key 枚举
 *
 */
export enum CacheEnum {
  /**
   * 登录用户 redis key
   */
  LOGIN_TOKEN_KEY = "login_tokens:",

  /**
   * 验证码 redis key
   */
  CAPTCHA_CODE_KEY = "captcha_codes:",

  /**
   * 分布式锁 redis key
   */
  DISTRIBUTED_LOCK_KEY = "distributed_locks:"

  // /**
  //  * 登录账户密码错误次数 redis key
  //  */
  // PWD_ERR_CNT_KEY = 'pwd_err_cnt:',

  // /**
  //  * 微信code存储
  //  */
  // MA_CODE = 'ma_code:',
}
