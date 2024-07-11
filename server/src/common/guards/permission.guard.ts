import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Observable } from 'rxjs';
import { Reflector } from '@nestjs/core';
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private reflector: Reflector) {}
  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    const req = context.switchToHttp().getRequest();
    const prem = this.reflector.getAllAndOverride('permission', [context.getClass(), context.getHandler()]);

    // 当接口调用需要功能权限控制时，在控制器中使用 @RequirePermission('system:user:query') 装饰器注入权限
    // 这里将会根据注入权限和用户功能权限进行判断，如果用户没有该权限，则不允许访问该接口
    // prem = @RequirePermission('system:user:query')
    // permissions 用户功能权限
    if (prem) {
      //调用鉴权
      return this.hasPermission(prem, req.user.permissions);
    }

    return true;
  }

  /**
   * 检查用户是否含有权限
   * @param permission
   * @param userId
   * @returns
   */
  hasPermission(permission: string, permissions: string[]) {
    const AllPermission = '*:*:*';
    return permissions.includes(AllPermission) || permissions.some((v) => v === permission);
  }
}
