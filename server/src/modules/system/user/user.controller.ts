import { Controller, Get, Post, Body, Param, Query, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
import { UserService } from './user.service';
import { Response } from 'express';
import { ApiResult, GetRequestUser, RequestUserPayload, RequireRole } from '@/common/decorator';
import {
  CreateUserDto,
  UpdateUserDto,
  ListUserDto,
  ChangeStatusDto,
  ResetPwdDto,
  UpdateProfileDto,
  UpdatePwdDto,
  UpdateAuthRoleDto,
  UpdateAvatarDto,
  UserVo,
  UserProfileVo,
  AuthRoleVo,
} from './dto/index';

@ApiTags('用户管理')
@ApiBearerAuth()
@Controller('system/user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @ApiOperation({ summary: '个人中心-用户信息' })
  @ApiResult(UserProfileVo)
  @Get('/profile')
  profile(@GetRequestUser('user') user: RequestUserPayload['user']) {
    return this.userService.profile(user);
  }

  @ApiOperation({ summary: '个人中心-修改用户信息' })
  @ApiBody({ type: UpdateProfileDto })
  @ApiResult()
  @Post('/profile')
  updateProfile(@GetRequestUser() tokenData: RequestUserPayload, @Body() updateProfileDto: UpdateProfileDto) {
    return this.userService.updateProfile(tokenData, updateProfileDto);
  }

  @ApiOperation({ summary: '个人中心-修改用户头像' })
  @ApiBody({ type: UpdateAvatarDto })
  @ApiResult()
  @Post('/profile/avatar')
  updateAvatar(@GetRequestUser() tokenData: RequestUserPayload, @Body() body: UpdateAvatarDto) {
    return this.userService.updateAvatar(tokenData, body.avatar);
  }

  @ApiOperation({ summary: '个人中心-修改密码' })
  @ApiBody({ type: UpdatePwdDto })
  @ApiResult()
  @Post('/profile/updatePwd')
  updatePwd(@GetRequestUser() tokenData: RequestUserPayload, @Body() updatePwdDto: UpdatePwdDto) {
    return this.userService.updatePwd(tokenData, updatePwdDto);
  }

  @ApiOperation({ summary: '用户-创建' })
  @ApiBody({ type: CreateUserDto })
  @ApiResult()
  @Post()
  create(@Body() createUserDto: CreateUserDto, @GetRequestUser('user') user: RequestUserPayload['user']) {
    return this.userService.create(createUserDto, user.userId);
  }

  @ApiOperation({ summary: '用户-列表' })
  @ApiResult(UserVo, true, true)
  @Get('/list')
  findAll(@Query() query: ListUserDto, @GetRequestUser() tokenData: RequestUserPayload) {
    return this.userService.findAll(query, tokenData);
  }

  @ApiOperation({ summary: '用户-分配角色列表' })
  @ApiResult(AuthRoleVo)
  @RequireRole('admin')
  @Get('/authRole/:id')
  getAuthRole(@Param('id') id: string) {
    return this.userService.getAuthRole(+id);
  }

  @ApiOperation({ summary: '用户-分配角色' })
  @RequireRole('admin')
  @ApiBody({ type: UpdateAuthRoleDto })
  @ApiResult()
  @Post('/updateAuthRole')
  updateAuthRole(@Body() data: UpdateAuthRoleDto) {
    return this.userService.updateAuthRole(data);
  }

  @ApiOperation({ summary: '用户-详情' })
  @ApiResult(UserVo)
  @Get('/:userId')
  findOne(@Param('userId') userId: string) {
    return this.userService.findOne(+userId);
  }

  @ApiOperation({ summary: '用户-停用角色' })
  @ApiBody({ type: ChangeStatusDto })
  @ApiResult()
  @RequireRole('admin')
  @Post('/changeStatus')
  changeStatus(@Body() changeStatusDto: ChangeStatusDto, @GetRequestUser('user') user: RequestUserPayload['user']) {
    return this.userService.changeStatus(changeStatusDto, user.userId);
  }

  @ApiOperation({ summary: '用户-更新' })
  @ApiBody({ type: UpdateUserDto })
  @ApiResult()
  @Post('/update')
  update(@Body() updateUserDto: UpdateUserDto, @GetRequestUser('user') user: RequestUserPayload['user']) {
    return this.userService.update(updateUserDto, user.userId);
  }

  @ApiOperation({ summary: '用户-重置密码' })
  @ApiBody({ type: ResetPwdDto })
  @ApiResult()
  @RequireRole('admin')
  @Post('/resetPwd')
  resetPwd(@Body() body: ResetPwdDto, @GetRequestUser('user') user: RequestUserPayload['user']) {
    return this.userService.resetPwd(body, user.userId);
  }

  @ApiOperation({ summary: '用户-删除' })
  @ApiResult()
  @RequireRole('admin')
  @Get('/delete/:id')
  remove(@Param('id') ids: string, @GetRequestUser('user') user: RequestUserPayload['user']) {
    return this.userService.remove(
      ids.split(',').map((id) => +id),
      user.userId,
    );
  }

  @ApiOperation({ summary: '导出用户信息数据为xlsx' })
  @Post('/export')
  async export(@Res() res: Response, @Body() body: ListUserDto, @GetRequestUser() tokenData: RequestUserPayload): Promise<void> {
    return this.userService.export(res, body, tokenData);
  }
}
