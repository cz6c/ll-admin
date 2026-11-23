import { BaseEntity } from "@/common/entities/base";
import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

/**
 * 试驾体验打分记录
 * 逻辑外键 user_id 指向 sys_user.user_id，不建库级 FK
 * 总分不落库，由接口按六维算术平均计算
 */
@Entity("drive_score_record", { comment: "试驾体验打分记录" })
@Index("idx_drive_score_record_user_list", ["userId", "delFlag"])
export class DriveScoreRecordEntity extends BaseEntity {
  @PrimaryGeneratedColumn({ type: "int", name: "drive_score_id", comment: "主键ID" })
  public driveScoreId: number;

  /** 逻辑外键：sys_user.user_id；不建库级 FK */
  @Column({ type: "int", name: "user_id", comment: "用户ID" })
  public userId: number;

  @Column({ type: "varchar", name: "vehicle_name", length: 64, comment: "车辆名称/型号" })
  public vehicleName: string;

  @Column({ type: "varchar", name: "remark", length: 255, nullable: true, default: null, comment: "备注" })
  public remark: string | null;

  // decimal：支持 wd-rate allow-half（0.5 步进）；TypeORM 读出可能是 string，出参前 Number()
  @Column({ type: "decimal", name: "score_chassis_solidity", precision: 2, scale: 1, comment: "底盘厚重感 0.5-5 半分" })
  public scoreChassisSolidity: number;

  @Column({ type: "decimal", name: "score_handling", precision: 2, scale: 1, comment: "操控感 0.5-5 半分" })
  public scoreHandling: number;

  @Column({ type: "decimal", name: "score_high_speed_stability", precision: 2, scale: 1, comment: "高速稳定性 0.5-5 半分" })
  public scoreHighSpeedStability: number;

  @Column({ type: "decimal", name: "score_quietness", precision: 2, scale: 1, comment: "静谧性 0.5-5 半分" })
  public scoreQuietness: number;

  @Column({ type: "decimal", name: "score_seating_visibility", precision: 2, scale: 1, comment: "坐姿与视野 0.5-5 半分" })
  public scoreSeatingVisibility: number;

  @Column({ type: "decimal", name: "score_blind_operation", precision: 2, scale: 1, comment: "盲操便利性 0.5-5 半分" })
  public scoreBlindOperation: number;
}
