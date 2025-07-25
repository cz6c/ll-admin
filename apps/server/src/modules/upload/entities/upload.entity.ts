import { SuccessErrorEnum } from "@/common/enum/dict";
import { Entity, Column, PrimaryColumn } from "typeorm";

@Entity("sys_upload", { comment: "文件上传记录" })
export class SysUploadEntity {
  @PrimaryColumn({ type: "varchar", name: "upload_id", comment: "任务Id" })
  uploadId: string;

  @Column({
    type: "int",
    comment: "文件大小",
    name: "size"
  })
  size: number;

  @Column({
    type: "varchar",
    comment: "文件路径",
    name: "file_name"
  })
  fileName: string;

  @Column({
    type: "varchar",
    comment: "文件名",
    name: "new_file_name"
  })
  newFileName: string;

  @Column({
    type: "varchar",
    comment: "文件地址",
    name: "url"
  })
  url: string;

  @Column({
    type: "varchar",
    comment: "拓展名",
    nullable: true,
    name: "ext"
  })
  ext: string;

  //成功失败
  @Column({
    type: "enum",
    enum: SuccessErrorEnum,
    default: SuccessErrorEnum.FAIL,
    name: "status",
    comment: "状态"
  })
  public status: SuccessErrorEnum;
}
