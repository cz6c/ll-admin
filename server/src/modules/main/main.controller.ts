import { Controller, Get, Post, Body, HttpCode, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody } from '@nestjs/swagger';
import * as Useragent from 'useragent';
import { MainService } from './main.service';
import { RegisterDto, LoginDto } from './dto/index';
import { createMath } from '@/common/utils/captcha';
import { ResultData } from '@/common/utils/result';
import { GenerateUUID } from '@/common/utils/index';
import { RedisService } from '@/modules/redis/redis.service';
import { CacheEnum } from '@/common/enum/index';
import { ConfigService } from '@/modules/system/config/config.service';
import { GetRequestUser, RequestUserPayload } from '@/common/decorator/getRequestUser.decorator';

@ApiTags('登录鉴权')
@Controller('/')
export class MainController {
  constructor(
    private readonly mainService: MainService,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
  ) {}
  @ApiOperation({
    summary: '用户登陆',
  })
  @ApiBody({
    type: LoginDto,
    required: true,
  })
  @Post('/login')
  @HttpCode(200)
  login(@Body() user: LoginDto, @Request() req) {
    const agent = Useragent.parse(req.headers['user-agent']);
    const os = agent.os.toJSON().family;
    const browser = agent.toAgent();
    const clientInfo = {
      userAgent: req.headers['user-agent'],
      ipaddr: req.ip,
      browser: browser,
      os: os,
      loginLocation: '',
    };
    return this.mainService.login(user, clientInfo);
  }

  @ApiOperation({
    summary: '退出登陆',
  })
  @ApiBody({
    type: LoginDto,
    required: true,
  })
  @Post('/logout')
  @HttpCode(200)
  logout(@Request() req) {
    const agent = Useragent.parse(req.headers['user-agent']);
    const os = agent.os.toJSON().family;
    const browser = agent.toAgent();
    const clientInfo = {
      userAgent: req.headers['user-agent'],
      ipaddr: req.ip,
      browser: browser,
      os: os,
      loginLocation: '',
    };
    return this.mainService.logout(clientInfo);
  }

  @ApiOperation({
    summary: '用户注册',
  })
  @ApiBody({
    type: RegisterDto,
    required: true,
  })
  @Post('/register')
  @HttpCode(200)
  register(@Body() user: RegisterDto) {
    return this.mainService.register(user);
  }

  @ApiOperation({
    summary: '获取验证图片',
  })
  @Get('/captchaImage')
  async captchaImage() {
    //是否开启验证码
    const enable = await this.configService.getConfigValue('sys.account.captchaEnabled');
    const captchaEnabled: boolean = enable === 'true';
    const data = {
      captchaEnabled,
      img: '',
      uuid: '',
    };
    try {
      if (captchaEnabled) {
        const captchaInfo = createMath();
        data.img = captchaInfo.data;
        data.uuid = GenerateUUID();
        await this.redisService.set(CacheEnum.CAPTCHA_CODE_KEY + data.uuid, captchaInfo.text.toLowerCase(), 1000 * 60 * 5);
      }
      return ResultData.ok(data, '操作成功');
    } catch (err) {
      return ResultData.fail(500, '生成验证码错误，请重试');
    }
  }

  @ApiOperation({
    summary: '用户信息',
  })
  @Get('/getInfo')
  async getInfo(@GetRequestUser() user: RequestUserPayload) {
    return {
      msg: '操作成功',
      code: 200,
      data: {
        permissions: user.permissions,
        roles: user.roles,
        user: user.user,
      },
    };
  }

  @ApiOperation({
    summary: '路由信息',
  })
  @Get('/getRouters')
  getRouters(@GetRequestUser('userId') userId: number) {
    return this.mainService.getRouters(userId);
  }
}
