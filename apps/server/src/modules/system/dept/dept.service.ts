import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { ResultData } from "@/common/utils/result";
import { SysDeptEntity } from "./entities/dept.entity";
import { CreateDeptDto, UpdateDeptDto, ListDeptDto } from "./dto/index";
import { DataScopeEnum, DelFlagEnum } from "@/common/enum/dict";
import { listToTree } from "@llcz/common";
import { SysRoleWithDeptEntity } from "../role/entities/role-dept.entity";
import { Uniq } from "@/common/utils";

@Injectable()
export class DeptService {
  constructor(
    @InjectRepository(SysDeptEntity)
    private readonly sysDeptEntityRep: Repository<SysDeptEntity>,
    @InjectRepository(SysRoleWithDeptEntity)
    private readonly sysRoleWithDeptEntityRep: Repository<SysRoleWithDeptEntity>
  ) {}

  /**
   * @description: 部门管理-创建
   * @param {CreateDeptDto} createDeptDto
   * @param {number} userId
   * @return
   */
  async create(createDeptDto: CreateDeptDto, userId: number) {
    if (createDeptDto.parentId) {
      const parent = await this.sysDeptEntityRep.findOne({
        where: {
          deptId: createDeptDto.parentId,
          delFlag: DelFlagEnum.NORMAL
        },
        select: ["ancestors"]
      });
      if (!parent) {
        return ResultData.fail(500, "父级不存在");
      }
      const ancestors = parent.ancestors ? `${parent.ancestors},${createDeptDto.parentId}` : `${createDeptDto.parentId}`;
      Object.assign(createDeptDto, { ancestors: ancestors });
    }
    await this.sysDeptEntityRep.save({ ...createDeptDto, createBy: userId });
    return ResultData.ok();
  }

  /**
   * @description: 部门管理-树
   * @return
   */
  async treeSelect(query: ListDeptDto) {
    const entity = this.sysDeptEntityRep.createQueryBuilder("entity");
    entity.where("entity.delFlag = :delFlag", { delFlag: DelFlagEnum.NORMAL });

    if (query.deptName) {
      entity.andWhere(`entity.deptName LIKE "%${query.deptName}%"`);
    }
    if (query.status) {
      entity.andWhere("entity.status = :status", { status: query.status });
    }
    entity.orderBy("entity.orderNum", "ASC");
    const res = await entity.getMany();
    // 获取查询结果的所有祖级节点
    let ancestors = [];
    if (query.deptName || query.status) {
      let ids = [];
      // 合并祖级ids 去重
      ids = Uniq(res.reduce((pre, cur) => pre.concat(cur.ancestors.split(",").map(c => +c)), []));
      // 过滤掉查询结果
      ids = ids.filter(c => !res.some(z => z.deptId === c));
      if (ids.length > 0) {
        ancestors = await this.sysDeptEntityRep.find({
          where: {
            deptId: In(ids),
            delFlag: DelFlagEnum.NORMAL
          }
        });
      }
    }
    const tree = listToTree(res.concat(ancestors), {
      id: "deptId"
    });
    return ResultData.ok(tree);
  }

  /**
   * @description: 部门管理-详情
   * @param {number} deptId
   * @return
   */
  async findOne(deptId: number) {
    const res = await this.sysDeptEntityRep.findOne({
      where: {
        delFlag: DelFlagEnum.NORMAL,
        deptId: deptId
      }
    });
    let parentName = "";
    if (res.ancestors) {
      const parents = await this.sysDeptEntityRep.find({
        where: {
          deptId: In(res.ancestors.split(",").map(c => +c)),
          delFlag: DelFlagEnum.NORMAL
        },
        select: ["deptName"]
      });
      parentName = parents.map(c => c.deptName).join(">");
    }
    return ResultData.ok({ ...res, parentName });
  }

  /**
   * @description: 部门管理-更新
   * @param {UpdateDeptDto} updateDeptDto
   * @param {number} userId
   * @return
   */
  async update(updateDeptDto: UpdateDeptDto, userId: number) {
    if (updateDeptDto.parentId && updateDeptDto.parentId !== 0) {
      const parent = await this.sysDeptEntityRep.findOne({
        where: {
          deptId: updateDeptDto.parentId,
          delFlag: DelFlagEnum.NORMAL
        },
        select: ["ancestors"]
      });
      if (!parent) {
        return ResultData.fail(500, "父级不存在");
      }
      const ancestors = parent.ancestors ? `${parent.ancestors},${updateDeptDto.parentId}` : `${updateDeptDto.parentId}`;
      Object.assign(updateDeptDto, { ancestors: ancestors });
    }
    await this.sysDeptEntityRep.update({ deptId: updateDeptDto.deptId }, { ...updateDeptDto, updateBy: userId });
    return ResultData.ok();
  }

  /**
   * @description: 部门管理-删除
   * @param {number} deptId
   * @param {number} userId
   * @return
   */
  async remove(deptId: number, userId: number) {
    await this.sysDeptEntityRep.update(
      { deptId: deptId },
      {
        delFlag: DelFlagEnum.DELETE,
        updateBy: userId
      }
    );
    // 同步删除子集
    const all = await this.sysDeptEntityRep.find({
      where: {
        delFlag: DelFlagEnum.NORMAL
      },
      select: ["deptId", "ancestors"]
    });
    const ids = all.filter(c =>
      c.ancestors
        .split(",")
        .map(c => +c)
        .includes(deptId)
    );
    await this.sysDeptEntityRep.update(
      { deptId: In(ids.map(c => c.deptId)) },
      {
        delFlag: DelFlagEnum.DELETE,
        updateBy: userId
      }
    );
    return ResultData.ok();
  }

  /**
   * @description: 查询所有部门以及角色已关联的部门数据 --用于自定义数据权限范围
   * @param {number} roleId
   * @return
   */
  async roleDeptTreeSelect(roleId: number) {
    // 查询所有部门数据
    const res = await this.sysDeptEntityRep.find({
      where: {
        delFlag: DelFlagEnum.NORMAL
      }
    });
    const tree = listToTree(res, {
      id: "deptId"
    });

    // 查询角色id已关联的部门
    const deptIds = await this.sysRoleWithDeptEntityRep.find({
      where: { roleId: roleId },
      select: ["deptId"]
    });
    const checkedKeys = deptIds.map(item => {
      return item.deptId;
    });

    return ResultData.ok({
      depts: tree,
      checkedIds: checkedKeys
    });
  }

  /**
   * 根据数据权限范围和部门ID查询部门ID列表。
   * @param deptId 部门ID，表示需要查询的部门。
   * @param dataScope 数据权限范围，决定查询的部门范围。
   * @returns 返回一个部门ID数组，根据数据权限范围决定返回的部门ID集合。
   */
  async findDeptIdsByDataScope(deptId: number, dataScope: DataScopeEnum) {
    try {
      // 创建部门实体的查询构建器
      const entity = this.sysDeptEntityRep.createQueryBuilder("dept");
      // 筛选出删除标志为未删除的部门
      entity.where("dept.delFlag = :delFlag", { delFlag: DelFlagEnum.NORMAL });

      // 根据不同的数据权限范围添加不同的查询条件
      if (dataScope === DataScopeEnum.DATA_SCOPE_DEPT) {
        // 如果是本部门数据权限，则只查询指定部门
        entity.andWhere("dept.deptId = :deptId", { deptId: deptId });
      } else if (dataScope === DataScopeEnum.DATA_SCOPE_DEPT_AND_CHILD) {
        // 如果是本部门及子部门数据权限，则查询指定部门及其所有子部门
        // 使用参数化查询以防止SQL注入
        entity
          .andWhere("dept.ancestors LIKE :ancestors", {
            ancestors: `%${deptId}%`
          })
          .orWhere("dept.deptId = :deptId", { deptId: deptId });
      } else if (dataScope === DataScopeEnum.DATA_SCOPE_SELF) {
        // 如果是仅本人数据权限，则不查询任何部门，直接返回空数组
        return [];
      }
      // 执行查询并获取结果
      const list = await entity.getMany();
      // 将查询结果映射为部门ID数组后返回
      return list.map(item => item.deptId);
    } catch (error) {
      console.error("Failed to query department IDs:", error);
      throw new Error("Querying department IDs failed");
    }
  }
}
