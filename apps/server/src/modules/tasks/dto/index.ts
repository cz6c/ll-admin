import { IsString, IsEnum, Length, IsOptional, IsNumber, IsDate } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";
import { BaseVO, PagingDto } from "@/common/dto/index";
import { TaskTypeEnum, TaskStatusEnum } from "@/common/enum/dict";

export class CreateTaskDto {
  @ApiProperty({ required: true })
  @IsString()
  @Length(0, 50)
  taskName: string;

  @ApiProperty({ required: true })
  @IsString()
  @Length(0, 2000)
  payload: string;

  @ApiProperty({ required: true })
  @IsEnum(TaskTypeEnum)
  taskType: TaskTypeEnum;

  @ApiProperty({ required: true })
  @IsDate()
  executeAt: Date;

  @ApiProperty({ required: false })
  @IsString()
  @Length(0, 50)
  @IsOptional()
  cronExpression?: string;
}

export class UpdateTaskDto extends CreateTaskDto {
  @ApiProperty({ required: true })
  @IsNumber()
  taskId: number;
}

export class ListTaskDto extends PagingDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @Length(0, 50)
  taskName?: string;
}

export class TaskVO extends BaseVO {
  @ApiProperty({ description: "任务ID", example: 1 })
  public taskId: number;

  @ApiProperty({ description: "任务名称", example: "每日新闻推送" })
  public taskName: string;

  @ApiProperty({ description: "任务参数", example: "{...}" })
  public payload: string;

  @ApiProperty({
    description: "任务类型",
    enum: TaskTypeEnum,
    example: TaskTypeEnum.ONCE
  })
  public taskType: TaskTypeEnum;

  @ApiProperty({
    description: "执行时间",
    format: "date-time",
    example: "2023-04-01T09:00:00Z"
  })
  public executeAt: Date;

  @ApiProperty({ description: "定时任务表达式", example: "*/5 * * * * *" })
  public cronExpression: string;

  @ApiProperty({
    description: "任务状态",
    enum: TaskStatusEnum,
    example: TaskStatusEnum.PENDING
  })
  public taskStatus: TaskStatusEnum;

  @ApiProperty({ description: "备注", example: "这是一条备注" })
  public remark: string;
}
