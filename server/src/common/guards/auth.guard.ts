import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import { pathToRegexp } from 'path-to-regexp';
import { ExecutionContext, ForbiddenException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { UserService } from '@/modules/system/user/user.service';
import * as url from 'url';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  private globalWhiteList = [];
  constructor(
    @Inject(UserService)
    private readonly userService: UserService,
    private readonly config: ConfigService,
  ) {
    super();
    this.globalWhiteList = [].concat(this.config.get('perm.router.whitelist') || []);
  }

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isInWhiteList = this.checkWhiteList(ctx);
    if (isInWhiteList) {
      return true;
    }

    const req = ctx.switchToHttp().getRequest();
    const accessToken = req.get('Authorization');
    if (!accessToken) throw new ForbiddenException('请重新登录');
    const atUserId = await this.userService.parseToken(accessToken);
    if (!atUserId) throw new UnauthorizedException('当前登录已过期，请重新登录');
    return await this.activate(ctx);
  }

  async activate(ctx: ExecutionContext): Promise<boolean> {
    return super.canActivate(ctx) as Promise<boolean>;
  }

  /**
   * 检查接口是否在白名单内
   * @param ctx
   * @returns
   */
  checkWhiteList(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const pathname = url.parse(req.url).pathname;
    console.log('🚀 ~ JwtAuthGuard ~ checkWhiteList ~ pathname:', pathname);
    const i = this.globalWhiteList.findIndex((route) => {
      // 请求方法类型相同
      if (req.method.toUpperCase() === route.method.toUpperCase()) {
        // 对比 url
        return !!pathToRegexp(route.path).exec(pathname);
      }
      return false;
    });
    // 在白名单内 则 进行下一步， i === -1 ，则不在白名单，需要 比对是否有当前接口权限
    return i > -1;
  }
}
