import { Injectable } from "@nestjs/common";
import { ResultData } from "@/common/utils/result";
import { SUCCESS_CODE } from "@/common/utils/result";
import { UserService } from "../system/user/user.service";
import { LoginlogService } from "../monitor/loginlog/loginlog.service";
import { AxiosService } from "@/plugins/axios.service";
import { RegisterDto, LoginDto } from "./dto/index";
import { MenuService } from "../system/menu/menu.service";
import { RedisService } from "@/modules/redis/redis.service";
import { ConfigService } from "@/modules/system/config/config.service";
import { SuccessErrorEnum } from "@/common/enum/dict";
import { getEnum2Array } from "@/common/enum";
import { ClientInfoDto } from "../monitor/loginlog/dto";
import { createMath } from "@/common/utils/captcha";
import { CacheEnum } from "@/common/enum/loca";

@Injectable()
export class MainService {
  constructor(
    private readonly userService: UserService,
    private readonly loginlogService: LoginlogService,
    private readonly axiosService: AxiosService,
    private readonly menuService: MenuService,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService
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
      status: SuccessErrorEnum.SUCCESS,
      msg: "",
      loginLocation: ""
    };
    try {
      const loginLocation = await this.axiosService.getIpAddress(clientInfo.ipaddr);
      loginLog.loginLocation = loginLocation;
    } catch (error) {
      loginLog.loginLocation = "未知ip";
    }
    const loginRes = await this.userService.login(user, loginLog);
    loginLog.status = loginRes.code === SUCCESS_CODE ? SuccessErrorEnum.SUCCESS : SuccessErrorEnum.FAIL;
    loginLog.msg = loginRes.msg;
    await this.loginlogService.create(loginLog);
    return loginRes;
  }

  /**
   * @description: 刷新token
   * @param {string} refreshToken
   * @param {ClientInfoDto} clientInfo
   */
  async refreshToken(refreshToken: string, clientInfo: ClientInfoDto) {
    return await this.userService.refreshToken(refreshToken, clientInfo);
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
  getDicts(type: string) {
    const data = getEnum2Array(type);
    return ResultData.ok(data);
  }

  /**
   * @description: 获取图形验证码
   * @param {string} uuid
   */
  async captchaImage(uuid: string) {
    //是否开启验证码
    const enable = await this.configService.getConfigValue("sys.account.captchaEnabled");
    const captchaEnabled: boolean = enable.toLowerCase() === "true";
    const data = {
      captchaEnabled,
      img: "",
      uuid
    };
    try {
      if (captchaEnabled && data.uuid) {
        const captchaInfo = createMath();
        data.img = captchaInfo.data;
        await this.redisService.set(CacheEnum.CAPTCHA_CODE_KEY + data.uuid, captchaInfo.text.toLowerCase(), 1000 * 60 * 5);
      }
      return ResultData.ok(data, "操作成功");
    } catch (error) {
      return ResultData.fail(500, "生成验证码错误，请重试");
    }
  }
}
