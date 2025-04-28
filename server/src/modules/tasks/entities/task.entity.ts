import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { BaseEntity } from '@/common/entities/base';
import { TaskStatusEnum, TaskTypeEnum } from '@/common/enum/dict';

@Entity('task', { comment: '任务队列表' })
export class TaskEntity extends BaseEntity {
  @PrimaryGeneratedColumn({ type: 'int', name: 'task_id', comment: '任务ID' })
  taskId: number;

  @Column({ type: 'varchar', length: 50, name: 'task_name', comment: '任务名称' })
  taskName: string;

  @Column({ type: 'text', name: 'payload', comment: 'JSON 序列化的任务参数' })
  payload: string;

  @Column({
    type: 'enum',
    enum: TaskTypeEnum,
    default: TaskTypeEnum.ONCE,
    name: 'task_type',
    comment: '任务类型',
  })
  taskType: TaskTypeEnum;

  @Column({
    type: 'datetime',
    name: 'execute_at',
    comment: '执行时间',
  })
  executeAt: Date;

  @Column({
    type: 'varchar',
    length: 50,
    default: null,
    name: 'cron_expression',
    comment: '定时任务表达式',
  })
  cronExpression?: string; // 仅循环任务需要

  @Column({
    type: 'enum',
    enum: TaskStatusEnum,
    default: TaskStatusEnum.PENDING,
    name: 'task_status',
    comment: '任务状态',
  })
  taskStatus: TaskStatusEnum;

  @Column({ type: 'int', default: 0, name: 'retries', comment: '任务重试计数' })
  retries: number;

  @Column({ type: 'int', default: 3, name: 'max_retries', comment: '任务最大重试次数' })
  maxRetries: number;

  @Column({ type: 'varchar', name: 'remark', length: 500, default: null, comment: '备注' })
  remark?: string;
}
