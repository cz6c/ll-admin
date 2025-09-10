import type { SysRoleVo } from "@/modules/system/role/dto";
import type { UserVo } from "@/modules/system/user/dto";
import { createParamDecorator, type ExecutionContext } from "@nestjs/common";

export interface RequestUserPayload {
  browser: string;
  ipaddr: string;
  loginTime: Date;
  os: string;
  uuid: string;
  user: UserVo;
  roles: Array<SysRoleVo>;
}

export const GetRequestUser = createParamDecorator((key: keyof RequestUserPayload, context: ExecutionContext) => {
  const request = context.switchToHttp().getRequest();
  return key ? request.user && request.user[key] : request.user;
});
