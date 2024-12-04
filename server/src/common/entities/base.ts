import { Column, CreateDateColumn, Entity, UpdateDateColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { DelFlagEnum, StatusEnum } from '../enum/dict';

//基础实体信息
@Entity()
export abstract class BaseEntity {
  //0正常 1停用
  @ApiProperty({ type: StatusEnum, description: '状态' })
  @Column({ type: 'enum', enum: StatusEnum, default: StatusEnum.NORMAL, name: 'status', comment: '状态' })
  public status: StatusEnum;

  //0代表存在 1代表删除
  @ApiProperty({ type: DelFlagEnum, description: '删除标志' })
  @Column({ type: 'enum', enum: DelFlagEnum, default: DelFlagEnum.NORMAL, name: 'del_flag', comment: '删除标志' })
  public delFlag: DelFlagEnum;

  @ApiProperty({ type: String, description: '创建者' })
  @Column({ type: 'varchar', name: 'create_by', length: 64, default: '', comment: '创建者' })
  public createBy: string;

  @ApiProperty({ type: Date, description: '创建时间' })
  @CreateDateColumn({ type: 'datetime', name: 'create_time', default: null, comment: '创建时间' })
  public createTime: Date;

  @ApiProperty({ type: String, description: '更新者' })
  @Column({ type: 'varchar', name: 'update_by', length: 64, default: '', comment: '更新者' })
  public updateBy: string;

  @ApiProperty({ type: Date, description: '更新时间' })
  @UpdateDateColumn({ type: 'datetime', name: 'update_time', default: null, comment: '更新时间' })
  public updateTime: Date;
}
