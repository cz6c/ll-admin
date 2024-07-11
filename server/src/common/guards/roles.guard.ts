import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    // 全局配置，
    const req = ctx.switchToHttp().getRequest();

    const role = this.reflector.getAllAndOverride('role', [ctx.getClass(), ctx.getHandler()]);

    // 当接口调用需要角色权限控制时，在控制器中使用 @RequireRole('admin') 装饰器注入权限
    // 这里将会根据注入权限和用户角色权限进行判断，如果用户没有该权限，则不允许访问该接口
    // role = @RequireRole('admin')
    // roles 用户角色权限
    if (role) {
      return this.hasRole(role, req.user.roles);
    }

    return true;
  }

  /**
   * 检测用户是否属于某个角色
   * @param role
   * @param roles
   * @returns
   */
  hasRole(role: string, roles: string[]) {
    return roles.some((v) => v === role);
  }
}
