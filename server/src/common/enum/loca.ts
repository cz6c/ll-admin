/**
 * 缓存的key 枚举
 *
 */
export enum CacheEnum {
  /**
   * 登录用户 redis key
   */
  LOGIN_TOKEN_KEY = 'login_tokens:',

  /**
   * 验证码 redis key
   */
  CAPTCHA_CODE_KEY = 'captcha_codes:',

  /**
   * 登录账户密码错误次数 redis key
   */
  PWD_ERR_CNT_KEY = 'pwd_err_cnt:',

  /**
   * 微信code存储
   */
  MA_CODE = 'ma_code:',

  /**
   * 字典管理 cache key
   */
  SYS_DICT_KEY = 'sys_dict:',
}

/**
 * 数据过滤规则枚举
 */
export enum DataScopeEnum {
  /**
   * 全部数据权限
   */
  DATA_SCOPE_ALL = '1',

  /**
   * 自定数据权限
   */
  DATA_SCOPE_CUSTOM = '2',

  /**
   * 部门数据权限
   */
  DATA_SCOPE_DEPT = '3',

  /**
   * 部门及以下数据权限
   */
  DATA_SCOPE_DEPT_AND_CHILD = '4',

  /**
   * 仅本人数据权限
   */
  DATA_SCOPE_SELF = '5',
}
