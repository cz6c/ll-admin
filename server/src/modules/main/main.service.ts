import { Injectable } from '@nestjs/common';
import { ResultData } from '@/common/utils/result';
import { SUCCESS_CODE } from '@/common/utils/result';
import { UserService } from '../system/user/user.service';
import { LoginlogService } from '../monitor/loginlog/loginlog.service';
import { AxiosService } from '@/plugins/axios.service';
import { RegisterDto, LoginDto } from './dto/index';
import { MenuService } from '../system/menu/menu.service';
import { StatusEnum } from '@/common/enum/dict';
import { getEnum2Array } from '@/common/enum';
import { ClientInfoDto } from '../monitor/loginlog/dto';
import { CacheEnum } from '@/common/enum/loca';
import { RequestUserPayload } from '@/common/decorator';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class MainService {
  constructor(
    private readonly userService: UserService,
    private readonly loginlogService: LoginlogService,
    private readonly axiosService: AxiosService,
    private readonly menuService: MenuService,
    private readonly redisService: RedisService,
  ) {}

  /**
   * 登陆
   * @param user
   * @returns
   */
  async login(user: LoginDto, clientInfo: ClientInfoDto) {
    const loginLog = {
      ...clientInfo,
      userName: user.userName,
      status: StatusEnum.NORMAL,
      msg: '',
      loginLocation: '',
    };
    try {
      const loginLocation = await this.axiosService.getIpAddress(clientInfo.ipaddr);
      loginLog.loginLocation = loginLocation;
    } catch (error) {}
    const loginRes = await this.userService.login(user, loginLog);
    loginLog.status = loginRes.code === SUCCESS_CODE ? StatusEnum.NORMAL : StatusEnum.STOP;
    loginLog.msg = loginRes.msg;
    this.loginlogService.create(loginLog);
    return loginRes;
  }
  /**
   * 退出登陆
   * @param tokenData
   */
  async logout(tokenData: RequestUserPayload) {
    await this.redisService.del(`${CacheEnum.LOGIN_TOKEN_KEY}${tokenData.token}`);
    return ResultData.ok();
  }
  /**
   * 注册
   * @param user
   * @returns
   */
  async register(user: RegisterDto) {
    return await this.userService.register(user);
  }

  /**
   * 获取路由菜单
   */
  async getRouters(userId: number) {
    const menus = await this.menuService.getMenuListByUserId(userId);
    return ResultData.ok(menus);
  }

  /**
   * 获取字典
   */
  async getDicts(type: string) {
    const data = getEnum2Array(type);
    return ResultData.ok(data);
  }
}
