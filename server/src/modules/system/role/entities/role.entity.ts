import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { BaseEntity } from '@/common/entities/base';
import { DataScopeEnum } from '@/common/enum/dict';

@Entity('sys_role', { comment: '角色信息表' })
export class SysRoleEntity extends BaseEntity {
  @ApiProperty({ type: String, description: '角色ID' })
  @PrimaryGeneratedColumn({ type: 'int', name: 'role_id', comment: '角色ID' })
  public roleId: number;

  @Column({ type: 'varchar', name: 'role_name', length: 30, comment: '角色名称' })
  public roleName: string;

  @Column({ type: 'int', name: 'role_sort', default: 0, comment: '显示顺序' })
  public roleSort: number;

  @Column({ type: 'varchar', name: 'role_key', length: 100, comment: '角色权限字符串' })
  public roleKey: string;

  //数据范围（1：全部数据权限 2：自定数据权限 3：本部门数据权限 4：本部门及以下数据权限 5：仅本人数据权限）
  @Column({ type: 'enum', enum: DataScopeEnum, default: DataScopeEnum.DATA_SCOPE_ALL, name: 'data_scope', comment: '数据范围' })
  public dataScope: DataScopeEnum;

  @Column({ type: 'boolean', name: 'menu_check_strictly', default: false, comment: '菜单树选择项是否关联显示' })
  public menuCheckStrictly: boolean;

  @Column({ type: 'boolean', name: 'dept_check_strictly', default: false, comment: '部门树选择项是否关联显示' })
  public deptCheckStrictly: boolean;

  @Column({ type: 'varchar', name: 'remark', length: 500, default: '', comment: '备注' })
  public remark: string;
}
