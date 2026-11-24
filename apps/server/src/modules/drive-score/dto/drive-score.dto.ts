import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  registerDecorator,
  ValidationOptions
} from "class-validator";

/**
 * 评分须为 0.5～5、步进 0.5（与 uni wd-rate allow-half 对齐）
 */
function IsHalfStepScore(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: "isHalfStepScore",
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          if (typeof value !== "number" || Number.isNaN(value)) {
            return false;
          }
          if (value < 0.5 || value > 5) {
            return false;
          }
          return Math.abs(value * 2 - Math.round(value * 2)) < 1e-8;
        },
        defaultMessage() {
          return "评分须为 0.5～5 的半分（步进 0.5）";
        }
      }
    });
  };
}

function ScoreProperty(description: string) {
  return function (target: object, propertyKey: string) {
    ApiProperty({ description, example: 3.5, minimum: 0.5, maximum: 5, multipleOf: 0.5 })(target, propertyKey);
  };
}

function HalfScoreField(description: string) {
  return function (target: object, propertyKey: string) {
    ScoreProperty(description)(target, propertyKey);
    Type(() => Number)(target, propertyKey);
    IsNumber({ maxDecimalPlaces: 1 })(target, propertyKey);
    Min(0.5)(target, propertyKey);
    Max(5)(target, propertyKey);
    IsHalfStepScore()(target, propertyKey);
  };
}

export class CreateDriveScoreDto {
  @ApiProperty({ description: "车辆名称/型号", example: "Model Y 后驱" })
  @IsString()
  @MinLength(1, { message: "车辆名称不能为空" })
  @MaxLength(64)
  vehicleName: string;

  @ApiPropertyOptional({ description: "备注", example: "雨天城区+高速", nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  remark?: string | null;

  @HalfScoreField("动力响应与平顺性")
  scorePowerResponse: number;

  @HalfScoreField("底盘滤震与车身控制")
  scoreChassisControl: number;

  @HalfScoreField("转向与制动")
  scoreSteeringBraking: number;

  @HalfScoreField("NVH与驾驶坐姿")
  scoreNvhPosture: number;

  @HalfScoreField("驾驶相关人机与辅助驾驶")
  scoreHmiAdas: number;

  @HalfScoreField("能耗/续航与补能")
  scoreEnergyRange: number;
}

export class UpdateDriveScoreDto extends CreateDriveScoreDto {
  @ApiProperty({ description: "记录ID", example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  driveScoreId: number;
}

export class DriveScoreItemDto {
  @ApiProperty({ description: "记录ID", example: 1 })
  driveScoreId: number;

  @ApiProperty({ description: "车辆名称/型号", example: "Model Y 后驱" })
  vehicleName: string;

  @ApiPropertyOptional({ description: "备注", nullable: true })
  remark: string | null;

  @ApiProperty({ description: "动力响应与平顺性" })
  scorePowerResponse: number;

  @ApiProperty({ description: "底盘滤震与车身控制" })
  scoreChassisControl: number;

  @ApiProperty({ description: "转向与制动" })
  scoreSteeringBraking: number;

  @ApiProperty({ description: "NVH与驾驶坐姿" })
  scoreNvhPosture: number;

  @ApiProperty({ description: "驾驶相关人机与辅助驾驶" })
  scoreHmiAdas: number;

  @ApiProperty({ description: "能耗/续航与补能" })
  scoreEnergyRange: number;

  @ApiProperty({ description: "六维算术平均总分，保留 1 位小数", example: 3.8 })
  totalScore: number;

  @ApiProperty({ description: "创建时间" })
  createTime: Date;

  @ApiProperty({ description: "更新时间" })
  updateTime: Date;
}