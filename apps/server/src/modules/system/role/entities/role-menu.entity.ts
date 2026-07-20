import { Entity, Index, PrimaryColumn } from "typeorm";

@Entity("sys_role_menu", { comment: "角色和菜单关联表  角色1-N菜单" })
@Index("idx_sys_role_menu_menu_id", ["menuId"])
export class SysRoleWithMenuEntity {
  @PrimaryColumn({
    type: "int",
    name: "role_id",
    default: 0,
    comment: "角色ID"
  })
  public roleId: number;

  @PrimaryColumn({
    type: "int",
    name: "menu_id",
    default: 0,
    comment: "菜单ID"
  })
  public menuId: number;
}
