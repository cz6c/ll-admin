import { Injectable } from "@nestjs/common";
import { ResultData } from "@/common/utils/result";
import { SUCCESS_CODE } from "@/common/utils/result";
import { UserService } from "../system/user/user.service";
import { LoginlogService } from "../monitor/loginlog/loginlog.service";
import { AxiosService } from "@/plugins/axios.service";
import { RegisterDto, LoginDto } from "./dto/index";
import { MenuService } from "../system/menu/menu.service";
import { SuccessErrorEnum } from "@/common/enum/dict";
import { getEnum2Array } from "@/common/enum";
import { ClientInfoDto } from "../monitor/loginlog/dto";

@Injectable()
export class MainService {
  constructor(
    private readonly userService: UserService,
    private readonly loginlogService: LoginlogService,
    private readonly axiosService: AxiosService,
    private readonly menuService: MenuService
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
}
