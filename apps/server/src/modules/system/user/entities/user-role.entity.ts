import { Entity, Index, PrimaryColumn } from "typeorm";

@Entity("sys_user_role", { comment: "用户和角色关联表  用户N-1角色" })
@Index("idx_sys_user_role_role_id", ["roleId"])
export class SysUserWithRoleEntity {
  @PrimaryColumn({ type: "int", name: "user_id", comment: "用户ID" })
  public userId: number;

  @PrimaryColumn({ type: "int", name: "role_id", comment: "角色ID" })
  public roleId: number;
}
