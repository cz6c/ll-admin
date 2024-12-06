import { SysRoleEntity } from '@/modules/system/role/entities/role.entity';
import { UserEntity } from '@/modules/system/user/entities/user.entity';
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface RequestUserPayload {
  browser: string;
  ipaddr: string;
  loginLocation: string;
  loginTime: Date;
  os: string;
  token: string;
  user: UserEntity;
  roles: Array<SysRoleEntity>;
}

export const GetRequestUser = createParamDecorator((key: keyof RequestUserPayload, context: ExecutionContext) => {
  const request = context.switchToHttp().getRequest();
  return key ? request.user && request.user[key] : request.user;
});
