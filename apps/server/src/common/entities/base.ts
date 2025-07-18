import { Column, CreateDateColumn, Entity, UpdateDateColumn } from "typeorm";
import { DelFlagEnum, StatusEnum } from "../enum/dict";

//基础实体信息
@Entity()
export abstract class BaseEntity {
  //0正常 1停用
  @Column({
    type: "enum",
    enum: StatusEnum,
    default: StatusEnum.NORMAL,
    name: "status",
    comment: "状态"
  })
  public status: StatusEnum;

  //0代表存在 1代表删除
  @Column({
    type: "enum",
    enum: DelFlagEnum,
    default: DelFlagEnum.NORMAL,
    name: "del_flag",
    comment: "删除标志"
  })
  public delFlag: DelFlagEnum;

  @Column({ type: "int", name: "create_by", default: null, comment: "创建者" })
  public createBy: number;

  @CreateDateColumn({
    type: "datetime",
    name: "create_time",
    default: null,
    comment: "创建时间"
  })
  public createTime: Date;

  @Column({ type: "int", name: "update_by", default: null, comment: "更新者" })
  public updateBy: number;

  @UpdateDateColumn({
    type: "datetime",
    name: "update_time",
    default: null,
    comment: "更新时间"
  })
  public updateTime: Date;
}
