import { SysRoleVo } from '@/modules/system/role/dto';
import { UserVo } from '@/modules/system/user/dto';
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface RequestUserPayload {
  browser: string;
  ipaddr: string;
  loginTime: Date;
  os: string;
  token: string;
  user: UserVo;
  roles: Array<SysRoleVo>;
}

export const GetRequestUser = createParamDecorator((key: keyof RequestUserPayload, context: ExecutionContext) => {
  const request = context.switchToHttp().getRequest();
  return key ? request.user && request.user[key] : request.user;
});
