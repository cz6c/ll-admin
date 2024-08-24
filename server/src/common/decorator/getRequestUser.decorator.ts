import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface RequestUserPayload {
  browser: string;
  ipaddr: string;
  loginLocation: string;
  loginTime: Date;
  os: string;
  roles: string[];
  token: string;
  user: any;
  userId: number;
  username: string;
  deptId: number;
}

export const GetRequestUser = createParamDecorator((key: keyof RequestUserPayload, context: ExecutionContext) => {
  const request = context.switchToHttp().getRequest();
  return key ? request.user && request.user[key] : request.user;
});
