import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";
import { BaseEntity } from "@/common/entities/base";
import { DataScopeEnum } from "@/common/enum/dict";

@Entity("sys_role", { comment: "角色信息表" })
export class SysRoleEntity extends BaseEntity {
  @PrimaryGeneratedColumn({ type: "int", name: "role_id", comment: "角色ID" })
  public roleId: number;

  @Column({
    type: "varchar",
    name: "role_name",
    length: 30,
    comment: "角色名称"
  })
  public roleName: string;

  @Column({ type: "int", name: "role_sort", default: 0, comment: "显示顺序" })
  public roleSort: number;

  @Column({
    type: "varchar",
    name: "role_key",
    length: 100,
    comment: "角色权限字符串"
  })
  public roleKey: string;

  //数据范围（1全部 2本部门 3本部门及以下 4仅本人）
  @Column({
    type: "enum",
    enum: DataScopeEnum,
    default: DataScopeEnum.DATA_SCOPE_ALL,
    name: "data_scope",
    comment: "数据范围（1全部 2本部门 3本部门及以下 4仅本人）"
  })
  public dataScope: DataScopeEnum;

  @Column({
    type: "varchar",
    name: "remark",
    length: 500,
    default: "",
    comment: "备注"
  })
  public remark: string;
}
