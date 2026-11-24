import { BaseEntity } from "@/common/entities/base";
import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

/**
 * 试驾体验打分记录（终版六维）
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

  @Column({ type: "decimal", name: "score_power_response", precision: 2, scale: 1, comment: "动力响应与平顺性 0.5-5" })
  public scorePowerResponse: number;

  @Column({ type: "decimal", name: "score_chassis_control", precision: 2, scale: 1, comment: "底盘滤震与车身控制 0.5-5" })
  public scoreChassisControl: number;

  @Column({ type: "decimal", name: "score_steering_braking", precision: 2, scale: 1, comment: "转向与制动 0.5-5" })
  public scoreSteeringBraking: number;

  @Column({ type: "decimal", name: "score_nvh_posture", precision: 2, scale: 1, comment: "NVH与驾驶坐姿 0.5-5" })
  public scoreNvhPosture: number;

  @Column({ type: "decimal", name: "score_hmi_adas", precision: 2, scale: 1, comment: "驾驶相关人机与辅助驾驶 0.5-5" })
  public scoreHmiAdas: number;

  @Column({ type: "decimal", name: "score_energy_range", precision: 2, scale: 1, comment: "能耗/续航与补能 0.5-5" })
  public scoreEnergyRange: number;
}