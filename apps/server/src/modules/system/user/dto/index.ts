import { IsString, IsEnum, IsArray, Length, IsOptional, IsNumber } from 'class-validator';
import { ApiProperty, OmitType, PickType } from '@nestjs/swagger';
import { BaseVO, PagingDto } from '@/common/dto/index';
import { StatusEnum, UserSexEnum, UserTypeEnum } from '@/common/enum/dict';
import { SysRoleVo } from '../../role/dto';
import { SysPostVo } from '../../post/dto';
import { SysDeptVo } from '../../dept/dto';

export class CreateUserDto {
  @ApiProperty({ required: true })
  @IsString()
  @Length(0, 50)
  nickName: string;

  @ApiProperty({ required: true })
  @IsString()
  @Length(0, 50)
  userName: string;

  @ApiProperty({ required: true })
  @IsString()
  @Length(5, 20)
  password: string;

  @ApiProperty({ required: true })
  @IsString()
  // @IsPhoneNumber('CN')
  phonenumber: string;

  @ApiProperty({ required: true })
  @IsArray()
  postIds: Array<number>;

  @ApiProperty({ required: true })
  @IsArray()
  roleIds: Array<number>;

  @ApiProperty({ required: true })
  @IsEnum(UserTypeEnum)
  userType: UserTypeEnum;

  @ApiProperty({ required: true })
  @IsEnum(StatusEnum)
  status: StatusEnum;

  @ApiProperty({ required: true })
  @IsEnum(UserSexEnum)
  sex: UserSexEnum;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  deptId?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @Length(0, 50)
  @IsString()
  email?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @Length(0, 500)
  remark?: string;
}

export class UpdateUserDto extends OmitType(CreateUserDto, ['userName', 'password', 'phonenumber'] as const) {
  @ApiProperty({ required: true })
  @IsNumber()
  userId: number;
}

export class ChangeStatusDto extends PickType(UpdateUserDto, ['userId', 'status'] as const) {}

export class UpdateProfileDto extends PickType(UpdateUserDto, ['nickName', 'email', 'sex'] as const) {}

export class UpdateAvatarDto {
  @ApiProperty({ required: true })
  @IsString()
  avatar: string;
}

export class ResetPwdDto {
  @ApiProperty({ required: true })
  @IsNumber()
  userId: number;

  @ApiProperty({ required: true })
  @IsString()
  @Length(5, 20)
  password: string;
}

export class UpdatePwdDto {
  @ApiProperty({ required: true })
  @IsString()
  @Length(5, 20)
  oldPassword: string;

  @ApiProperty({ required: true })
  @IsString()
  @Length(5, 20)
  newPassword: string;
}

export class ListUserDto extends PagingDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  deptId?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @Length(0, 50)
  nickName?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @Length(0, 50)
  email?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @Length(0, 50)
  userName?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  phonenumber?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsEnum(StatusEnum)
  status?: StatusEnum;
}

export class UserVo extends BaseVO {
  @ApiProperty({ description: '用户ID', example: 1 })
  public userId: number;

  @ApiProperty({ description: '部门ID', example: 101 })
  public deptId: number;

  @ApiProperty({ description: '部门信息', example: {} })
  dept?: SysDeptVo;

  @ApiProperty({ description: '用户账号', example: 'user123' })
  public userName: string;

  @ApiProperty({ description: '用户昵称', example: '张三' })
  public nickName: string;

  @ApiProperty({
    description: '用户类型',
    enum: UserTypeEnum,
    example: UserTypeEnum.CUSTOM,
  })
  public userType: UserTypeEnum;

  @ApiProperty({ description: '邮箱', example: 'zhangsan@example.com' })
  public email: string;

  @ApiProperty({ description: '手机号码', example: '13800138000' })
  public phonenumber: string;

  @ApiProperty({
    description: '性别',
    enum: UserSexEnum,
    example: UserSexEnum.MAN,
  })
  public sex: UserSexEnum;

  @ApiProperty({ description: '头像地址', example: 'http://example.com/avatar.jpg' })
  public avatar: string;

  @ApiProperty({ description: '最后登录IP', example: '192.168.1.1' })
  public loginIp: string;

  @ApiProperty({ description: '最后登录时间', example: '2023-10-05T14:48:00.000Z' })
  public loginDate: Date;

  @ApiProperty({ description: '备注', example: '这是张三的备注信息' })
  public remark: string;
}

export class UserInfoVo extends UserVo {
  @ApiProperty({ description: '角色信息ids', example: [] })
  roleIds: number[];

  @ApiProperty({ description: '岗位信息ids', example: [] })
  postIds: number[];
}

export class UserProfileVo extends UserVo {
  @ApiProperty({ description: '角色信息', example: [] })
  roles: SysRoleVo[];

  @ApiProperty({ description: '岗位信息', example: [] })
  posts: SysPostVo[];
}
