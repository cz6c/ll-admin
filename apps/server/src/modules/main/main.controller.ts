import { Controller, Get, Post, Body, Request, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
import * as Useragent from 'useragent';
import { MainService } from './main.service';
import { RegisterDto, LoginDto, TokenVo, DictVo, RoutersVo, CaptchaImageVo } from './dto/index';
import { createMath } from '@/common/utils/captcha';
import { ResultData } from '@/common/utils/result';
import { RedisService } from '@/modules/redis/redis.service';
import { ConfigService } from '@/modules/system/config/config.service';
import { ApiResult, GetRequestUser, RequestUserPayload } from '@/common/decorator';
import { CacheEnum } from '@/common/enum/loca';
import { UserVo } from '../system/user/dto';

@ApiTags('登录鉴权')
@Controller('/')
export class MainController {
  constructor(
    private readonly mainService: MainService,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
  ) {}

  @ApiOperation({ summary: '用户登陆' })
  @ApiBody({ type: LoginDto })
  @ApiResult(TokenVo)
  @Post('/login')
  login(@Body() user: LoginDto, @Request() req) {
    const agent = Useragent.parse(req.headers['user-agent']);
    const os = agent.os.toJSON().family;
    const browser = agent.toAgent();
    const clientInfo = {
      ipaddr: req.ip,
      browser: browser,
      os: os,
    };
    return this.mainService.login(user, clientInfo);
  }

  @ApiOperation({ summary: '用户注册' })
  @ApiBody({ type: RegisterDto })
  @ApiResult()
  @Post('/register')
  register(@Body() user: RegisterDto) {
    return this.mainService.register(user);
  }

  @ApiOperation({ summary: '获取验证图片' })
  @ApiResult(CaptchaImageVo)
  @Get('/captchaImage')
  async captchaImage(@Query('uuid') uuid: string) {
    //是否开启验证码
    const enable = await this.configService.getConfigValue('sys.account.captchaEnabled');
    const captchaEnabled: boolean = enable.toLowerCase() === 'true';
    const data = {
      captchaEnabled,
      img: '',
      uuid,
    };
    try {
      if (captchaEnabled && data.uuid) {
        const captchaInfo = createMath();
        data.img = captchaInfo.data;
        await this.redisService.set(CacheEnum.CAPTCHA_CODE_KEY + data.uuid, captchaInfo.text.toLowerCase(), 1000 * 60 * 5);
      }
      return ResultData.ok(data, '操作成功');
    } catch (err) {
      return ResultData.fail(500, '生成验证码错误，请重试');
    }
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: '获取登录用户信息' })
  @ApiResult(UserVo)
  @Get('/getLoginUserInfo')
  async getLoginUserInfo(@GetRequestUser() tokenData: RequestUserPayload) {
    return {
      msg: '操作成功',
      code: 200,
      data: tokenData.user,
    };
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: '路由信息' })
  @ApiResult(RoutersVo, true)
  @Get('/getRouters')
  getRouters(@GetRequestUser('user') user: RequestUserPayload['user']) {
    return this.mainService.getRouters(user.userId);
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: '根据类型获取字典定义' })
  @ApiResult(DictVo, true)
  @Get('getDicts/:type')
  getDicts(@Param('type') type: string) {
    return this.mainService.getDicts(type);
  }
}
