import { Controller, Get, Post, Body, Request, Param, Query } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBody, ApiBearerAuth } from "@nestjs/swagger";
import * as Useragent from "useragent";
import { MainService } from "./main.service";
import { RegisterDto, LoginDto, TokenVo, DictVo, RoutersVo, CaptchaImageVo, RefreshTokenDto } from "./dto/index";
import { ApiResult, GetRequestUser, RequestUserPayload } from "@/common/decorator";
import { UserVo } from "../system/user/dto";

@ApiTags("auth")
@Controller("/")
export class MainController {
  constructor(private readonly mainService: MainService) {}

  @ApiOperation({ summary: "用户登陆" })
  @ApiBody({ type: LoginDto })
  @ApiResult(TokenVo)
  @Post("/login")
  login(@Body() user: LoginDto, @Request() req) {
    const agent = Useragent.parse(req.headers["user-agent"]);
    const os = agent.os.toJSON().family;
    const browser = agent.toAgent();
    const clientInfo = {
      ipaddr: req.ip,
      browser: browser,
      os: os
    };
    return this.mainService.login(user, clientInfo);
  }

  @ApiOperation({ summary: "刷新token" })
  @ApiBody({ type: RefreshTokenDto })
  @ApiResult(TokenVo)
  @Post("/refreshToken")
  refreshToken(@Body() data: RefreshTokenDto, @Request() req) {
    const agent = Useragent.parse(req.headers["user-agent"]);
    const os = agent.os.toJSON().family;
    const browser = agent.toAgent();
    const clientInfo = {
      ipaddr: req.ip,
      browser: browser,
      os: os
    };
    return this.mainService.refreshToken(data.refreshToken, clientInfo);
  }

  @ApiOperation({ summary: "用户注册" })
  @ApiBody({ type: RegisterDto })
  @ApiResult()
  @Post("/register")
  register(@Body() user: RegisterDto) {
    return this.mainService.register(user);
  }

  @ApiOperation({ summary: "获取验证图片" })
  @ApiResult(CaptchaImageVo)
  @Get("/captchaImage")
  captchaImage(@Query("uuid") uuid: string) {
    return this.mainService.captchaImage(uuid);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: "获取登录用户信息" })
  @ApiResult(UserVo)
  @Get("/getLoginUserInfo")
  getLoginUserInfo(@GetRequestUser() tokenData: RequestUserPayload) {
    return {
      msg: "操作成功",
      code: 200,
      data: tokenData.user
    };
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: "路由信息" })
  @ApiResult(RoutersVo, true)
  @Get("/getRouters")
  getRouters(@GetRequestUser("user") user: RequestUserPayload["user"]) {
    return this.mainService.getRouters(user.userId);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: "根据类型获取字典定义" })
  @ApiResult(DictVo, true)
  @Get("getDicts/:type")
  getDicts(@Param("type") type: string) {
    return this.mainService.getDicts(type);
  }
}
