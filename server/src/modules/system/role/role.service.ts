import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, FindManyOptions } from 'typeorm';
import { Response } from 'express';
import { ResultData } from '@/common/utils/result';
import { ExportTable } from '@/common/utils/export';

import { SysRoleEntity } from './entities/role.entity';
import { SysRoleWithMenuEntity } from './entities/role-menu.entity';
import { SysRoleWithDeptEntity } from './entities/role-dept.entity';
import { CreateRoleDto, UpdateRoleDto, ListRoleDto, ChangeStatusDto } from './dto/index';
import { DelFlagEnum } from '@/common/enum/dict';

@Injectable()
export class RoleService {
  constructor(
    @InjectRepository(SysRoleEntity)
    private readonly sysRoleEntityRep: Repository<SysRoleEntity>,
    @InjectRepository(SysRoleWithMenuEntity)
    private readonly sysRoleWithMenuEntityRep: Repository<SysRoleWithMenuEntity>,
    @InjectRepository(SysRoleWithDeptEntity)
    private readonly sysRoleWithDeptEntityRep: Repository<SysRoleWithDeptEntity>,
  ) {}

  // 关联菜单
  sysRoleWithMenu(menuIds: number[], roleId: number) {
    if (menuIds.length > 0) {
      const entity = this.sysRoleWithMenuEntityRep.createQueryBuilder('entity');
      const values = menuIds.map((id) => {
        return {
          roleId: roleId,
          menuId: id,
        };
      });
      entity.insert().values(values).execute();
    }
  }

  sysRoleWithDept(deptIds: number[], roleId: number) {
    // 关联部门
    if (deptIds.length > 0) {
      const entity = this.sysRoleWithDeptEntityRep.createQueryBuilder('entity');
      const values = deptIds.map((id) => {
        return {
          roleId: roleId,
          deptId: id,
        };
      });
      entity.insert().values(values).execute();
    }
  }

  /**
   * @description: 创建角色
   * @param {CreateRoleDto} createRoleDto
   * @param {number} userId
   * @return
   */
  async create(createRoleDto: CreateRoleDto, userId: number) {
    const { menuIds, deptIds } = createRoleDto;
    delete createRoleDto.menuIds;
    delete createRoleDto.deptIds;

    const res = await this.sysRoleEntityRep.save({ ...createRoleDto, createBy: userId });

    this.sysRoleWithMenu(menuIds, res.roleId);
    this.sysRoleWithDept(deptIds, res.roleId);

    return ResultData.ok();
  }

  /**
   * @description: 分页查询角色列表
   * @param {ListRoleDto} query
   * @return
   */
  async findAll(query: ListRoleDto) {
    const entity = this.sysRoleEntityRep.createQueryBuilder('entity');
    entity.where('entity.delFlag = :delFlag', { delFlag: DelFlagEnum.NORMAL });

    if (query.roleName) {
      entity.andWhere(`entity.roleName LIKE "%${query.roleName}%"`);
    }

    if (query.roleKey) {
      entity.andWhere(`entity.roleKey LIKE "%${query.roleKey}%"`);
    }

    if (query.roleId) {
      entity.andWhere('entity.roleId = :roleId', { roleId: query.roleId });
    }

    if (query.status) {
      entity.andWhere('entity.status = :status', { status: query.status });
    }

    if (query?.beginTime && query?.endTime) {
      entity.andWhere('entity.createTime BETWEEN :start AND :end', { start: query.beginTime, end: query.endTime });
    }

    if (query.pageSize && query.pageNum) {
      entity.skip(query.pageSize * (query.pageNum - 1)).take(query.pageSize);
    }
    const [list, total] = await entity.getManyAndCount();

    return ResultData.ok({
      list,
      total,
    });
  }

  /**
   * @description:查询角色详情
   * @param {number} roleId
   * @return
   */
  async findOne(roleId: number) {
    const res = await this.sysRoleEntityRep.findOne({
      where: {
        roleId: roleId,
        delFlag: DelFlagEnum.NORMAL,
      },
    });
    return ResultData.ok(res);
  }

  /**
   * @description: 更新角色
   * @param {UpdateRoleDto} updateRoleDto
   * @param {number} userId
   * @return
   */
  async update(updateRoleDto: UpdateRoleDto, userId: number) {
    const { menuIds, deptIds } = updateRoleDto;
    delete updateRoleDto.menuIds;
    delete updateRoleDto.deptIds;

    // 关联菜单
    const hasId = await this.sysRoleWithMenuEntityRep.findOne({
      where: {
        roleId: updateRoleDto.roleId,
      },
      select: ['menuId'],
    });
    //角色已关联菜单 先删除关联
    if (hasId) {
      await this.sysRoleWithMenuEntityRep.delete({
        roleId: updateRoleDto.roleId,
      });
    }
    // 角色重新关联菜单 TODO 后续改造为事务
    this.sysRoleWithMenu(menuIds, updateRoleDto.roleId);

    // 关联部门
    const hasId1 = await this.sysRoleWithDeptEntityRep.findOne({
      where: {
        roleId: updateRoleDto.roleId,
      },
      select: ['deptId'],
    });
    //角色已关联部门 先删除关联
    if (hasId1) {
      await this.sysRoleWithDeptEntityRep.delete({
        roleId: updateRoleDto.roleId,
      });
    }
    // 角色重新关联部门 TODO 后续改造为事务
    this.sysRoleWithDept(deptIds, updateRoleDto.roleId);

    await this.sysRoleEntityRep.update({ roleId: updateRoleDto.roleId }, { ...updateRoleDto, updateBy: userId });
    return ResultData.ok();
  }

  /**
   * @description: 更新角色状态
   * @param {ChangeStatusDto} changeStatusDto
   * @param {number} userId
   * @return
   */
  async changeStatus(changeStatusDto: ChangeStatusDto, userId: number) {
    await this.sysRoleEntityRep.update(
      { roleId: changeStatusDto.roleId },
      {
        status: changeStatusDto.status,
        updateBy: userId,
      },
    );
    return ResultData.ok();
  }

  /**
   * @description: 批量删除角色
   * @param {number} roleIds
   * @param {number} userId
   * @return
   */
  async remove(roleIds: number[], userId: number) {
    // 忽略系统角色的删除
    await this.sysRoleEntityRep.update(
      { roleId: In(roleIds.filter((id) => id !== 1)) },
      {
        delFlag: DelFlagEnum.DELETE,
        updateBy: userId,
      },
    );
    return ResultData.ok();
  }

  /**
   * @description: 根据条件查角色列表
   * @param {FindManyOptions} where
   * @return
   */
  async findRoles(where: FindManyOptions<SysRoleEntity>) {
    return await this.sysRoleEntityRep.find(where);
  }

  /**
   * 根据角色ID异步查找与之关联的部门ID列表。
   * @param roleId - 角色的ID，用于查询与该角色关联的部门。
   * @returns 返回一个Promise，该Promise解析为一个部门ID的数组。
   */
  async findRoleWithDeptIds(roleId: number) {
    // 使用TypeORM的实体仓库查询方法，异步查找与指定角色ID相关联的部门ID。
    const res = await this.sysRoleWithDeptEntityRep.find({
      select: ['deptId'],
      where: {
        roleId: roleId,
      },
    });
    // 将查询结果映射为仅包含部门ID的数组并返回。
    return res.map((item) => item.deptId);
  }

  /**
   * 导出角色管理数据为xlsx
   * @param res
   */
  async export(res: Response, body: ListRoleDto) {
    delete body.pageNum;
    delete body.pageSize;
    const list = await this.findAll(body);
    const options = {
      sheetName: '角色数据',
      data: list.data.list,
      header: [
        { title: '角色编号', dataIndex: 'roleId' },
        { title: '角色名称', dataIndex: 'roleName', width: 15 },
        { title: '权限字符', dataIndex: 'roleKey' },
        { title: '显示顺序', dataIndex: 'roleSort' },
        { title: '状态', dataIndex: 'status' },
        { title: '创建时间', dataIndex: 'createTime', width: 15 },
      ],
    };
    ExportTable(options, res);
  }
}
