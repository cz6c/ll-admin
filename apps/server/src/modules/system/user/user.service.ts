import { Repository, In, Not, EntityManager } from "typeorm";
import { Injectable, BadRequestException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { JwtService } from "@nestjs/jwt";
import { RedisService } from "@/modules/redis/redis.service";
import * as bcrypt from "bcryptjs";
import type { Response as ExpressResponse } from "express";
import { Uniq } from "@/common/utils/index";
import { formatToDatetime, generateUUID } from "@llcz/common";
import { ExportTable } from "@/common/utils/export";

import { DataScopeEnum, DelFlagEnum, StatusEnum } from "@/common/enum/dict";
import { LOGIN_TOKEN_EXPIRESIN } from "@/common/constant/index";
import { ResultData } from "@/common/utils/result";
import { CreateUserDto, UpdateUserDto, ListUserDto, UserChangeStatusDto, ResetPwdDto, UpdateProfileDto, UpdatePwdDto } from "./dto/index";
import { RegisterDto, LoginDto } from "../../main/dto/index";

import { UserEntity } from "./entities/user.entity";
import { SysUserWithPostEntity } from "./entities/user-post.entity";
import { SysUserWithRoleEntity } from "./entities/user-role.entity";
import { SysPostEntity } from "../post/entities/post.entity";
import { SysDeptEntity } from "../dept/entities/dept.entity";
import { RoleService } from "../role/role.service";
import { DeptService } from "../dept/dept.service";

import { ConfigService } from "../config/config.service";
import { RequestUserPayload } from "@/common/decorator/getRequestUser.decorator";
import { UserTypeEnum } from "@/common/enum/dict";
import { CacheEnum } from "@/common/enum/loca";
import { ClientInfoDto } from "@/modules/monitor/loginlog/dto";
@Injectable()
export class UserService {
  private salt: string;
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(SysPostEntity)
    private readonly sysPostEntityRep: Repository<SysPostEntity>,
    @InjectRepository(SysUserWithPostEntity)
    private readonly sysUserWithPostEntityRep: Repository<SysUserWithPostEntity>,
    @InjectRepository(SysUserWithRoleEntity)
    private readonly sysUserWithRoleEntityRep: Repository<SysUserWithRoleEntity>,
    private readonly roleService: RoleService,
    private readonly deptService: DeptService,
    private readonly jwtService: JwtService,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
    private entityManager: EntityManager
  ) {
    this.salt = bcrypt.genSaltSync(10);
  }

  /**
   * @description: 后台创建用户
   * @param {CreateUserDto} createUserDto
   * @param {number} userId
   * @return
   */
  async create(createUserDto: CreateUserDto, userId: number) {
    const loginDate = formatToDatetime();

    // 密码加密
    if (createUserDto.password) {
      createUserDto.password = bcrypt.hashSync(createUserDto.password, this.salt);
    }

    const { postIds, roleIds } = createUserDto;
    delete createUserDto.postIds;
    delete createUserDto.roleIds;

    return this.entityManager
      .transaction(async manager => {
        const user = await manager.save(UserEntity, {
          ...createUserDto,
          loginDate,
          createBy: userId
        });

        if (postIds?.length > 0) {
          await manager.insert(
            SysUserWithPostEntity,
            postIds.map(postId => ({ userId: user.userId, postId }))
          );
        }

        if (roleIds?.length > 0) {
          await manager.insert(
            SysUserWithRoleEntity,
            roleIds.map(roleId => ({ userId: user.userId, roleId }))
          );
        }

        return ResultData.ok();
      })
      .catch(err => {
        return ResultData.fail(400, "用户创建失败", err);
      });
  }

  /**
   * @description: 数据权限过滤
   * @param {RequestUserPayload} tokenData
   * @return
   */
  async handleDataScope(tokenData: RequestUserPayload) {
    const deptIds = [];
    let dataScopeAll = false;
    let dataScopeSelf = false;
    //数据权限过滤
    if (tokenData) {
      const roles = tokenData.roles;
      for (let index = 0; index < roles.length; index++) {
        const role = roles[index];
        if (role.dataScope === DataScopeEnum.DATA_SCOPE_ALL) {
          dataScopeAll = true;
          break;
        } else if (role.dataScope === DataScopeEnum.DATA_SCOPE_CUSTOM) {
          // 根据角色ID 查询部门ID列表
          const roleWithDeptIds = await this.roleService.findRoleWithDeptIds(role.roleId);
          deptIds.push(...roleWithDeptIds);
        } else if (role.dataScope === DataScopeEnum.DATA_SCOPE_DEPT || role.dataScope === DataScopeEnum.DATA_SCOPE_DEPT_AND_CHILD) {
          // 根据用户关联部门ID和数据权限范围 查询部门ID列表。
          const dataScopeWidthDeptIds = await this.deptService.findDeptIdsByDataScope(tokenData.user.deptId, role.dataScope);
          deptIds.push(...dataScopeWidthDeptIds);
        } else if (role.dataScope === DataScopeEnum.DATA_SCOPE_SELF) {
          dataScopeSelf = true;
        }
      }
    }
    return {
      deptIds,
      dataScopeAll,
      dataScopeSelf
    };
  }

  /**
   * @description: 用户列表
   * @param {ListUserDto} query
   * @param {RequestUserPayload} tokenData
   * @return
   */
  async findAll(query: ListUserDto, tokenData: RequestUserPayload) {
    const entity = this.userRepo.createQueryBuilder("user");
    entity.where("user.delFlag = :delFlag", { delFlag: DelFlagEnum.NORMAL });

    const { deptIds, dataScopeAll, dataScopeSelf } = await this.handleDataScope(tokenData);

    if (!dataScopeAll) {
      if (deptIds.length > 0) {
        // 只查和部门相关的数据
        entity.where("user.deptId IN (:...deptIds)", { deptIds: deptIds });
      } else if (dataScopeSelf) {
        // 自己
        entity.where("user.userId = :userId", {
          userId: tokenData.user.userId
        });
      }
    }

    if (query.deptId) {
      const deptIds = await this.deptService.findDeptIdsByDataScope(+query.deptId, DataScopeEnum.DATA_SCOPE_DEPT_AND_CHILD);
      entity.andWhere("user.deptId IN (:...deptIds)", { deptIds: deptIds });
    }

    if (query.userName) {
      entity.andWhere(`user.userName LIKE "%${query.userName}%"`);
    }

    if (query.phonenumber) {
      entity.andWhere(`user.phonenumber LIKE "%${query.phonenumber}%"`);
    }

    if (query.status) {
      entity.andWhere("user.status = :status", { status: query.status });
    }

    if (query?.beginTime && query?.endTime) {
      entity.andWhere("user.createTime BETWEEN :start AND :end", {
        start: query.beginTime,
        end: query.endTime
      });
    }

    if (query.pageSize && query.pageNum) {
      entity.skip(query.pageSize * (query.pageNum - 1)).take(query.pageSize);
    }
    //联查部门详情
    entity.leftJoinAndMapOne("user.dept", SysDeptEntity, "dept", "dept.deptId = user.deptId");

    const [list, total] = await entity.getManyAndCount();

    return ResultData.ok({
      list,
      total
    });
  }

  /**
   * @description: 用户详情
   * @param {number} userId
   * @return
   */
  async findOne(userId: number) {
    const data = await this.userRepo.findOne({
      where: {
        delFlag: DelFlagEnum.NORMAL,
        userId: userId
      }
    });

    const postIds = await this.getPostIds([userId]);
    const roleIds = await this.getRoleIds([userId]);

    return ResultData.ok({
      ...data,
      postIds,
      roleIds
    });
  }

  /**
   * @description: 更新用户
   * @param {UpdateUserDto} updateUserDto
   * @param {number} userId
   * @return
   */
  async update(updateUserDto: UpdateUserDto, userId: number) {
    //不能修改超级管理员
    if (updateUserDto.userId === 1) throw new BadRequestException("非法操作！");

    //过滤掉设置超级管理员角色
    updateUserDto.roleIds = updateUserDto.roleIds.filter(v => v !== 1);

    //当前用户不能修改自己的状态
    if (updateUserDto.userId === userId) {
      delete updateUserDto.status;
    }

    const { postIds, roleIds } = updateUserDto;
    delete updateUserDto.postIds;
    delete updateUserDto.roleIds;

    return this.entityManager
      .transaction(async manager => {
        // 1. 更新角色基本信息
        await manager.update(UserEntity, { userId: updateUserDto.userId }, { ...updateUserDto, updateBy: userId });

        // 2. 处理岗位关联
        await manager.delete(SysUserWithPostEntity, {
          userId: updateUserDto.userId
        });
        if (postIds?.length > 0) {
          await manager.insert(
            SysUserWithPostEntity,
            postIds.map(postId => ({ userId: updateUserDto.userId, postId }))
          );
        }

        // 3. 处理角色关联
        await manager.delete(SysUserWithRoleEntity, {
          userId: updateUserDto.userId
        });
        if (roleIds?.length > 0) {
          await manager.insert(
            SysUserWithRoleEntity,
            roleIds.map(roleId => ({ userId: updateUserDto.userId, roleId }))
          );
        }

        return ResultData.ok();
      })
      .catch(err => {
        return ResultData.fail(400, "用户更新失败", err);
      });
  }

  /**
   * @description: 登陆
   * @param {LoginDto} user
   * @param {ClientInfoDto} clientInfo
   * @return
   */
  async login(user: LoginDto, clientInfo: ClientInfoDto) {
    const enable = await this.configService.getConfigValue("sys.account.captchaEnabled");
    const captchaEnabled: boolean = enable === "true";

    if (captchaEnabled) {
      const code = await this.redisService.get(CacheEnum.CAPTCHA_CODE_KEY + user.uuid);
      if (!code) {
        return ResultData.fail(500, `验证码已过期`);
      }
      if (code !== user.code) {
        return ResultData.fail(500, `验证码错误`);
      }
    }

    const data = await this.userRepo.findOne({
      where: {
        userName: user.userName
      }
    });

    // 验证时，bcryptjs 会从存储的哈希值中提取 salt
    // 使用相同的 salt 对输入密码进行哈希，然后比较结果
    if (!(data && bcrypt.compareSync(user.password, data.password))) {
      return ResultData.fail(500, `帐号或密码错误`);
    }
    if (data.delFlag === DelFlagEnum.DELETE) {
      return ResultData.fail(500, `您已被禁用，如需正常使用请联系管理员`);
    }
    if (data.status === StatusEnum.STOP) {
      return ResultData.fail(500, `您已被停用，如需正常使用请联系管理员`);
    }

    const token = await this.afterLogin(data, clientInfo);
    return ResultData.ok(
      {
        token
      },
      "登录成功"
    );
  }

  /**
   * @description: 生成用户token
   * @param {UserEntity} data
   * @param {ClientInfoDto} clientInfo
   */
  async afterLogin(data: UserEntity, clientInfo: ClientInfoDto) {
    const loginDate = new Date();
    await this.userRepo.update(
      {
        userId: data.userId
      },
      {
        loginDate: loginDate,
        updateBy: data.userId
      }
    );

    const uuid = generateUUID();
    const token = this.createToken({ uuid: uuid, userId: data.userId });

    // 查用户角色 多对多关联
    const roleIds = await this.getRoleIds([data.userId]);
    const roles =
      (await this.roleService.findRoles({
        where: {
          delFlag: DelFlagEnum.NORMAL,
          roleId: In(roleIds)
        }
      })) || [];

    const tokenData: RequestUserPayload = {
      browser: clientInfo.browser,
      ipaddr: clientInfo.ipaddr,
      loginTime: loginDate,
      os: clientInfo.os,
      uuid,
      user: data,
      roles
    };
    await this.redisService.set(`${CacheEnum.LOGIN_TOKEN_KEY}${tokenData.uuid}`, tokenData, LOGIN_TOKEN_EXPIRESIN);
    return token;
  }

  /**
   * 获取用户关联角色Id列表
   * @param userId
   * @returns
   */
  async getRoleIds(userIds: Array<number>) {
    const roleIds = (
      await this.sysUserWithRoleEntityRep.find({
        where: {
          userId: In(userIds)
        },
        select: ["roleId"]
      })
    ).map(item => item.roleId);
    return Uniq(roleIds);
  }

  /**
   * 获取用户关联职位Id列表
   * @param userId
   * @returns
   */
  async getPostIds(userIds: Array<number>) {
    const postIds = (
      await this.sysUserWithPostEntityRep.find({
        where: {
          userId: In(userIds)
        },
        select: ["postId"]
      })
    ).map(item => item.postId);
    return Uniq(postIds);
  }

  /**
   * @description: 注册
   * @param {RegisterDto} user
   * @return
   */
  async register(user: RegisterDto) {
    const loginDate = formatToDatetime();
    const checkUserNameUnique = await this.userRepo.findOne({
      where: {
        userName: user.userName
      },
      select: ["userName"]
    });
    if (checkUserNameUnique) {
      return ResultData.fail(500, `保存用户'${user.userName}'失败，注册账号已存在`);
    }
    if (user.password) {
      user.password = bcrypt.hashSync(user.password, this.salt);
    }
    user["nickName"] = user.userName;
    await this.userRepo.save({ ...user, loginDate });
    return ResultData.ok();
  }

  /**
   * 从数据声明生成令牌
   * @param payload 数据声明
   * @return 令牌
   */
  createToken(payload: { uuid: string; userId: number }): string {
    const accessToken = this.jwtService.sign(payload);
    return accessToken;
  }

  /**
   * 从令牌中获取数据声明
   * @param token 令牌
   * @return 数据声明
   */
  parseToken(token: string): { uuid: string; userId: number } | null {
    try {
      if (!token) return null;
      const payload = this.jwtService.verify(token.replace("Bearer ", ""));
      return payload;
    } catch (error) {
      return null;
    }
  }

  /**
   * @description: 刷新token
   * @param {string} refreshToken
   * @param {ClientInfoDto} clientInfo
   */
  async refreshToken(refreshToken: string, clientInfo: ClientInfoDto) {
    const payload = this.parseToken(refreshToken);
    console.log("🚀 ~ UserService ~ refreshToken ~ user:", payload);
    const data = await this.userRepo.findOne({
      where: {
        userId: payload.userId
      }
    });
    if (data.delFlag === DelFlagEnum.DELETE) {
      return ResultData.fail(500, `您已被禁用，如需正常使用请联系管理员`);
    }
    if (data.status === StatusEnum.STOP) {
      return ResultData.fail(500, `您已被停用，如需正常使用请联系管理员`);
    }
    const _token = await this.afterLogin(data, clientInfo);
    return ResultData.ok(
      {
        token: _token
      },
      "刷新成功"
    );
  }

  /**
   * @description: 重置密码
   * @param {ResetPwdDto} body
   * @param {*} userId
   * @return
   */
  async resetPwd(body: ResetPwdDto, userId: number) {
    //不能修改超级管理员
    if (body.userId === 1) {
      return ResultData.fail(500, "非法操作");
    }
    if (body.password) {
      body.password = bcrypt.hashSync(body.password, this.salt);
    }
    await this.userRepo.update(
      {
        userId: body.userId
      },
      {
        password: body.password,
        updateBy: userId
      }
    );
    return ResultData.ok();
  }

  /**
   * @description: 批量删除用户
   * @param {number} ids
   * @param {number} userId
   * @return
   */
  async remove(ids: number[], userId: number) {
    // 忽略系统角色的删除
    await this.userRepo.update(
      { userId: In(ids), userType: Not(UserTypeEnum.SYS) },
      {
        delFlag: DelFlagEnum.DELETE,
        updateBy: userId
      }
    );
    return ResultData.ok();
  }

  /**
   * @description: 修改用户状态
   * @param {UserChangeStatusDto} UserChangeStatusDto
   * @param {number} userId
   * @return
   */
  async changeStatus(UserChangeStatusDto: UserChangeStatusDto, userId: number) {
    const userData = await this.userRepo.findOne({
      where: {
        userId: UserChangeStatusDto.userId
      },
      select: ["userType"]
    });
    if (userData.userType === UserTypeEnum.SYS) {
      return ResultData.fail(500, "系统角色不可停用");
    }

    await this.userRepo.update(
      { userId: UserChangeStatusDto.userId },
      {
        status: UserChangeStatusDto.status,
        updateBy: userId
      }
    );
    return ResultData.ok();
  }

  /**
   * 个人中心-用户信息
   * @param user
   * @returns
   */
  async profile(user: RequestUserPayload["user"]) {
    const { userId } = user;
    const entity = this.userRepo.createQueryBuilder("user");
    entity.where({
      userId: userId,
      delFlag: DelFlagEnum.NORMAL
    });

    // 联查部门详情 多对一
    entity.leftJoinAndMapOne("user.dept", SysDeptEntity, "dept", "dept.deptId = user.deptId");

    // 查用户角色 多对多关联
    const roleIds = await this.getRoleIds([userId]);
    const roles =
      (await this.roleService.findRoles({
        where: {
          delFlag: DelFlagEnum.NORMAL,
          roleId: In(roleIds)
        }
      })) || [];

    // 查用户职位 多对多关联
    const postIds = await this.getPostIds([userId]);
    const posts =
      (await this.sysPostEntityRep.find({
        where: {
          delFlag: DelFlagEnum.NORMAL,
          postId: In(postIds)
        }
      })) || [];

    const data = await entity.getOne();
    return ResultData.ok({ ...data, roles, posts });
  }

  /**
   * @description: 个人中心-用户信息
   * @param {RequestUserPayload} tokenData
   * @param {UpdateProfileDto} updateProfileDto
   * @return
   */
  async updateProfile(tokenData: RequestUserPayload, updateProfileDto: UpdateProfileDto) {
    await this.userRepo.update({ userId: tokenData.user.userId }, { ...updateProfileDto, updateBy: tokenData.user.userId });
    const userData = await this.redisService.get(`${CacheEnum.LOGIN_TOKEN_KEY}${tokenData.uuid}`);
    userData.user.nickName = updateProfileDto.nickName;
    userData.user.email = updateProfileDto.email;
    userData.user.sex = updateProfileDto.sex;
    await this.redisService.set(`${CacheEnum.LOGIN_TOKEN_KEY}${tokenData.uuid}`, userData);
    return ResultData.ok();
  }

  /**
   * @description: 个人中心-修改头像
   * @param {RequestUserPayload} tokenData
   * @param {string} avatar
   * @return
   */
  async updateAvatar(tokenData: RequestUserPayload, avatar: string) {
    await this.userRepo.update({ userId: tokenData.user.userId }, { avatar: avatar, updateBy: tokenData.user.userId });
    const userData = await this.redisService.get(`${CacheEnum.LOGIN_TOKEN_KEY}${tokenData.uuid}`);
    userData.user.avatar = avatar;
    await this.redisService.set(`${CacheEnum.LOGIN_TOKEN_KEY}${tokenData.uuid}`, userData);
    return ResultData.ok();
  }

  /**
   * @description: 个人中心-修改密码
   * @param {RequestUserPayload} tokenData
   * @param {UpdatePwdDto} updatePwdDto
   * @return
   */
  async updatePwd(tokenData: RequestUserPayload, updatePwdDto: UpdatePwdDto) {
    if (updatePwdDto.oldPassword === updatePwdDto.newPassword) {
      return ResultData.fail(500, "新密码不能与旧密码相同");
    }
    const userData = await this.userRepo.findOne({
      where: {
        userId: tokenData.user.userId
      },
      select: ["password"]
    });
    if (bcrypt.compareSync(userData.password, updatePwdDto.oldPassword)) {
      return ResultData.fail(500, "修改密码失败，旧密码错误");
    }
    const password = bcrypt.hashSync(updatePwdDto.newPassword, this.salt);
    await this.userRepo.update({ userId: tokenData.user.userId }, { password: password, updateBy: tokenData.user.userId });
    return ResultData.ok();
  }

  /**
   * 导出用户信息数据为xlsx
   * @param res
   */
  async export(res: ExpressResponse, body: ListUserDto, user: RequestUserPayload) {
    delete body.pageNum;
    delete body.pageSize;
    const list = await this.findAll(body, user);
    const options = {
      sheetName: "用户数据",
      data: list.data.list,
      header: [
        { title: "用户序号", dataIndex: "userId" },
        { title: "登录名称", dataIndex: "userName" },
        { title: "用户昵称", dataIndex: "nickName" },
        { title: "用户邮箱", dataIndex: "email" },
        { title: "手机号码", dataIndex: "phonenumber" },
        { title: "用户性别", dataIndex: "sex" },
        { title: "账号状态", dataIndex: "status" },
        { title: "最后登录IP", dataIndex: "loginIp" },
        { title: "最后登录时间", dataIndex: "loginDate", width: 20 },
        { title: "部门", dataIndex: "dept.deptName" },
        { title: "部门负责人", dataIndex: "dept.leader" }
      ]
    };
    await ExportTable(options, res);
  }
}
