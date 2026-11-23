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
 * why：IsInt 会拒掉 3.5；仅 Min/Max 仍放行 1.2 等非法步进
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

/** 六维半分 0.5-5 的共用装饰 */
function ScoreProperty(description: string) {
  return function (target: object, propertyKey: string) {
    ApiProperty({ description, example: 3.5, minimum: 0.5, maximum: 5, multipleOf: 0.5 })(target, propertyKey);
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

  @ScoreProperty("底盘厚重感")
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0.5)
  @Max(5)
  @IsHalfStepScore()
  scoreChassisSolidity: number;

  @ScoreProperty("操控感")
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0.5)
  @Max(5)
  @IsHalfStepScore()
  scoreHandling: number;

  @ScoreProperty("高速稳定性")
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0.5)
  @Max(5)
  @IsHalfStepScore()
  scoreHighSpeedStability: number;

  @ScoreProperty("静谧性")
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0.5)
  @Max(5)
  @IsHalfStepScore()
  scoreQuietness: number;

  @ScoreProperty("坐姿与视野")
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0.5)
  @Max(5)
  @IsHalfStepScore()
  scoreSeatingVisibility: number;

  @ScoreProperty("盲操便利性")
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0.5)
  @Max(5)
  @IsHalfStepScore()
  scoreBlindOperation: number;
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

  @ApiProperty({ description: "底盘厚重感" })
  scoreChassisSolidity: number;

  @ApiProperty({ description: "操控感" })
  scoreHandling: number;

  @ApiProperty({ description: "高速稳定性" })
  scoreHighSpeedStability: number;

  @ApiProperty({ description: "静谧性" })
  scoreQuietness: number;

  @ApiProperty({ description: "坐姿与视野" })
  scoreSeatingVisibility: number;

  @ApiProperty({ description: "盲操便利性" })
  scoreBlindOperation: number;

  @ApiProperty({ description: "六维算术平均总分，保留 1 位小数", example: 3.8 })
  totalScore: number;

  @ApiProperty({ description: "硬件三项平均，保留 1 位小数", example: 4.0 })
  hardwareScore: number;

  @ApiProperty({ description: "舒适三项平均，保留 1 位小数", example: 3.7 })
  comfortScore: number;

  @ApiProperty({ description: "创建时间" })
  createTime: Date;

  @ApiProperty({ description: "更新时间" })
  updateTime: Date;
}
