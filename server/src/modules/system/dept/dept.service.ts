import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ResultData } from '@/common/utils/result';
import { SysDeptEntity } from './entities/dept.entity';
import { CreateDeptDto, UpdateDeptDto, ListDeptDto } from './dto/index';
import { listToTree } from '@/common/utils/tree';
import { DataScopeEnum } from '@/common/enum/index';

@Injectable()
export class DeptService {
  constructor(
    @InjectRepository(SysDeptEntity)
    private readonly sysDeptEntityRep: Repository<SysDeptEntity>,
  ) {}

  async create(createDeptDto: CreateDeptDto) {
    if (createDeptDto.parentId) {
      const parent = await this.sysDeptEntityRep.findOne({
        where: {
          deptId: createDeptDto.parentId,
          delFlag: '0',
        },
        select: ['ancestors'],
      });
      if (!parent) {
        return ResultData.fail(500, '父级部门不存在');
      }
      const ancestors = parent.ancestors ? `${parent.ancestors},${createDeptDto.parentId}` : `${createDeptDto.parentId}`;
      Object.assign(createDeptDto, { ancestors: ancestors });
    }
    await this.sysDeptEntityRep.save(createDeptDto);
    return ResultData.ok();
  }

  async findAll(query: ListDeptDto) {
    const entity = this.sysDeptEntityRep.createQueryBuilder('entity');
    entity.where('entity.delFlag = :delFlag', { delFlag: '0' });

    if (query.deptName) {
      entity.andWhere(`entity.deptName LIKE "%${query.deptName}%"`);
    }
    if (query.status) {
      entity.andWhere('entity.status = :status', { status: query.status });
    }
    const res = await entity.getMany();
    return ResultData.ok(res);
  }

  async findOne(deptId: number) {
    const data = await this.sysDeptEntityRep.findOne({
      where: {
        deptId: deptId,
        delFlag: '0',
      },
    });
    return ResultData.ok(data);
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
      const entity = this.sysDeptEntityRep.createQueryBuilder('dept');
      // 筛选出删除标志为未删除的部门
      entity.where('dept.delFlag = :delFlag', { delFlag: '0' });

      // 根据不同的数据权限范围添加不同的查询条件
      if (dataScope === DataScopeEnum.DATA_SCOPE_DEPT) {
        // 如果是本部门数据权限，则只查询指定部门
        entity.andWhere('dept.deptId = :deptId', { deptId: deptId });
      } else if (dataScope === DataScopeEnum.DATA_SCOPE_DEPT_AND_CHILD) {
        // 如果是本部门及子部门数据权限，则查询指定部门及其所有子部门
        // 使用参数化查询以防止SQL注入
        entity
          .andWhere('dept.ancestors LIKE :ancestors', {
            ancestors: `%${deptId}%`,
          })
          .orWhere('dept.deptId = :deptId', { deptId: deptId });
      } else if (dataScope === DataScopeEnum.DATA_SCOPE_SELF) {
        // 如果是仅本人数据权限，则不查询任何部门，直接返回空数组
        return [];
      }
      // 执行查询并获取结果
      const list = await entity.getMany();
      // 将查询结果映射为部门ID数组后返回
      return list.map((item) => item.deptId);
    } catch (error) {
      console.error('Failed to query department IDs:', error);
      throw new Error('Querying department IDs failed');
    }
  }

  async findListExclude(id: number) {
    console.log('🚀 ~ DeptService ~ findListExclude ~ id:', id);
    //TODO 需排出ancestors 中不出现id的数据
    const data = await this.sysDeptEntityRep.find({
      where: {
        delFlag: '0',
      },
    });
    return ResultData.ok(data);
  }

  async update(updateDeptDto: UpdateDeptDto) {
    if (updateDeptDto.parentId && updateDeptDto.parentId !== 0) {
      const parent = await this.sysDeptEntityRep.findOne({
        where: {
          deptId: updateDeptDto.parentId,
          delFlag: '0',
        },
        select: ['ancestors'],
      });
      if (!parent) {
        return ResultData.fail(500, '父级部门不存在');
      }
      const ancestors = parent.ancestors ? `${parent.ancestors},${updateDeptDto.parentId}` : `${updateDeptDto.parentId}`;
      Object.assign(updateDeptDto, { ancestors: ancestors });
    }
    await this.sysDeptEntityRep.update({ deptId: updateDeptDto.deptId }, updateDeptDto);
    return ResultData.ok();
  }

  async remove(deptId: number) {
    const data = await this.sysDeptEntityRep.update(
      { deptId: deptId },
      {
        delFlag: '1',
      },
    );
    return ResultData.ok(data);
  }

  /**
   * 部门树
   * @returns
   */
  async deptTree() {
    const res = await this.sysDeptEntityRep.find({
      where: {
        delFlag: '0',
      },
    });
    const tree = listToTree(res, {
      id: 'deptId',
    });
    return ResultData.ok(tree);
  }
}
