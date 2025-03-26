import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindManyOptions, In } from 'typeorm';
import { ResultData } from '@/common/utils/result';
import { SysMenuEntity } from './entities/menu.entity';
import { SysRoleWithMenuEntity } from '../role/entities/role-menu.entity';
import { CreateMenuDto, UpdateMenuDto, ListMenuDto } from './dto/index';
import { Uniq } from '@/common/utils/index';
import { UserService } from '../user/user.service';
import { buildMenus } from './utils';
import { listToTree } from '@/common/utils/tree';
import { DelFlagEnum, StatusEnum } from '@/common/enum/dict';
@Injectable()
export class MenuService {
  constructor(
    @Inject(forwardRef(() => UserService))
    private readonly userService: UserService,
    @InjectRepository(SysMenuEntity)
    private readonly sysMenuEntityRep: Repository<SysMenuEntity>,
    @InjectRepository(SysRoleWithMenuEntity)
    private readonly sysRoleWithMenuEntityRep: Repository<SysRoleWithMenuEntity>,
  ) {}

  /**
   * @description: 菜单管理-创建
   * @param {CreateMenuDto} createMenuDto
   * @param {number} userId
   * @return
   */
  async create(createMenuDto: CreateMenuDto, userId: number) {
    await this.sysMenuEntityRep.save({ ...createMenuDto, createBy: userId });
    return ResultData.ok();
  }

  /**
   * @description: 菜单管理-树
   * @param {ListMenuDto} query
   * @return
   */
  async treeSelect(query: ListMenuDto) {
    const entity = this.sysMenuEntityRep.createQueryBuilder('entity');
    entity.where('entity.delFlag = :delFlag', { delFlag: DelFlagEnum.NORMAL });

    if (query.menuName) {
      entity.andWhere(`entity.menuName LIKE "%${query.menuName}%"`);
    }
    if (query.status) {
      entity.andWhere('entity.status = :status', { status: query.status });
    }
    entity.orderBy('entity.orderNum', 'ASC');
    const res = await entity.getMany();
    const tree = listToTree(res, {
      id: 'menuId',
    });
    return ResultData.ok(tree);
  }

  /**
   * @description: 根据角色ID查询菜单
   * @param {number} roleId
   * @return
   */
  async roleMenuTreeSelect(roleId: number) {
    const res = await this.sysMenuEntityRep.find({
      where: {
        delFlag: DelFlagEnum.NORMAL,
      },
      order: {
        orderNum: 'ASC',
      },
    });
    const tree = listToTree(res, {
      id: 'menuId',
    });
    const menuIds = await this.sysRoleWithMenuEntityRep.find({
      where: { roleId: roleId },
      select: ['menuId'],
    });
    const checkedKeys = menuIds.map((item) => {
      return item.menuId;
    });
    return ResultData.ok({
      menus: tree,
      checkedIds: checkedKeys,
    });
  }

  /**
   * @description: 菜单管理-详情
   * @param {number} menuId
   * @return
   */
  async findOne(menuId: number) {
    const res = await this.sysMenuEntityRep.findOne({
      where: {
        delFlag: DelFlagEnum.NORMAL,
        menuId: menuId,
      },
    });
    let parentName = '';
    if (res.parentId !== 0) {
      const parent = await this.sysMenuEntityRep.findOne({
        where: {
          delFlag: DelFlagEnum.NORMAL,
          menuId: res.parentId,
        },
      });
      parentName = parent.menuName;
    }
    return ResultData.ok({ ...res, parentName });
  }

  /**
   * @description: 菜单管理-修改
   * @param {UpdateMenuDto} updateMenuDto
   * @param {number} userId
   * @return
   */
  async update(updateMenuDto: UpdateMenuDto, userId: number) {
    await this.sysMenuEntityRep.update({ menuId: updateMenuDto.menuId }, { ...updateMenuDto, updateBy: userId });
    return ResultData.ok();
  }

  /**
   * @description: 菜单管理-删除
   * @param {number} menuId
   * @param {number} userId
   * @return
   */
  async remove(menuId: number, userId: number) {
    await this.sysMenuEntityRep.update(
      { menuId: menuId },
      {
        delFlag: DelFlagEnum.DELETE,
        updateBy: userId,
      },
    );
    return ResultData.ok();
  }

  /**
   * @description: 构建查询菜单列表
   * @param {FindManyOptions} where
   * @return
   */
  async findMany(where: FindManyOptions<SysMenuEntity>) {
    return await this.sysMenuEntityRep.find(where);
  }

  /**
   * 根据用户ID查询菜单
   * @param userId 用户ID
   * @return 菜单列表
   */
  async getMenuListByUserId(userId: number) {
    let menuWidthRoleList = [];
    if (userId === 1) {
      // 超级管理员所有菜单权限
      menuWidthRoleList = await this.sysMenuEntityRep.find({
        where: {
          delFlag: DelFlagEnum.NORMAL,
          status: StatusEnum.NORMAL,
        },
        select: ['menuId'],
      });
    } else {
      const roleIds = await this.userService.getRoleIds([userId]);
      // 查询角色绑定的菜单
      menuWidthRoleList = await this.sysRoleWithMenuEntityRep.find({
        where: { roleId: In(roleIds) },
        select: ['menuId'],
      });
    }
    // 菜单Id去重
    const menuIds = Uniq(menuWidthRoleList.map((item) => item.menuId));
    // 菜单列表
    const menuList = await this.sysMenuEntityRep.find({
      where: {
        delFlag: DelFlagEnum.NORMAL,
        status: StatusEnum.NORMAL,
        menuId: In(menuIds),
      },
      order: {
        orderNum: 'ASC',
      },
    });
    // 构建前端需要的菜单树
    const menuTree = buildMenus(menuList);
    return menuTree;
  }
}
