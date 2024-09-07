import { SysDeptEntity } from '@/modules/system/dept/entities/dept.entity';
import { SysPostEntity } from '@/modules/system/post/entities/post.entity';
import { SysRoleEntity } from '@/modules/system/role/entities/role.entity';
import { UserEntity } from '@/modules/system/user/entities/user.entity';
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

type User = UserEntity & {
  dept: SysDeptEntity;
  roles: Array<SysRoleEntity>;
  posts: Array<SysPostEntity>;
};

export interface RequestUserPayload {
  browser: string;
  ipaddr: string;
  loginLocation: string;
  loginTime: Date;
  os: string;
  roles: string[];
  token: string;
  user: User;
  userId: number;
  username: string;
  deptId: number;
}

export const GetRequestUser = createParamDecorator((key: keyof RequestUserPayload, context: ExecutionContext) => {
  const request = context.switchToHttp().getRequest();
  return key ? request.user && request.user[key] : request.user;
});
