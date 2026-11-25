import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { DelFlagEnum } from "@/common/enum/dict";
import { ResultData } from "@/common/utils/result";
import { CreateDriveScoreDto, DriveScoreItemDto, UpdateDriveScoreDto } from "./dto/drive-score.dto";
import { DriveScoreRecordEntity } from "./entities/drive-score-record.entity";

/** decimal 列读出可能是 string，统一成 number 再算分 */
function toScoreNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** 六维算术平均，保留 1 位小数 */
function averageScore(scores: number[]): number {
  const sum = scores.reduce((total, score) => total + score, 0);
  return Math.round((sum / scores.length) * 10) / 10;
}

/**
 * 试驾体验打分：仅本人可读写自己的未删记录
 * 总分由接口计算，不落库
 */
@Injectable()
export class DriveScoreService {
  constructor(
    @InjectRepository(DriveScoreRecordEntity)
    private readonly driveScoreRep: Repository<DriveScoreRecordEntity>
  ) {}

  async list(userId: number) {
    if (!userId) {
      return ResultData.fail(400, "缺少用户信息");
    }
    const list = await this.driveScoreRep.find({
      where: { userId, delFlag: DelFlagEnum.NORMAL },
      order: { createTime: "DESC" }
    });
    return ResultData.ok(list.map(item => this.toItemDto(item)));
  }

  async detail(userId: number, id: number) {
    if (!userId) {
      return ResultData.fail(400, "缺少用户信息");
    }
    if (!Number.isInteger(id) || id <= 0) {
      return ResultData.fail(400, "记录ID不合法");
    }
    const record = await this.findOwn(userId, id);
    if (!record) {
      return ResultData.fail(404, "未找到打分记录");
    }
    return ResultData.ok(this.toItemDto(record));
  }

  async create(userId: number, dto: CreateDriveScoreDto) {
    if (!userId) {
      return ResultData.fail(400, "缺少用户信息");
    }
    if (!String(dto.vehicleName || "").trim()) {
      return ResultData.fail(400, "车辆名称不能为空");
    }
    const record = this.driveScoreRep.create({
      ...this.toScoreFields(dto),
      userId,
      createBy: userId,
      updateBy: userId
    });
    const saved = await this.driveScoreRep.save(record);
    return ResultData.ok(this.toItemDto(saved));
  }

  async update(userId: number, dto: UpdateDriveScoreDto) {
    if (!userId) {
      return ResultData.fail(400, "缺少用户信息");
    }
    if (!String(dto.vehicleName || "").trim()) {
      return ResultData.fail(400, "车辆名称不能为空");
    }
    const record = await this.findOwn(userId, dto.driveScoreId);
    if (!record) {
      return ResultData.fail(404, "未找到打分记录");
    }
    Object.assign(record, this.toScoreFields(dto), { updateBy: userId });
    const saved = await this.driveScoreRep.save(record);
    return ResultData.ok(this.toItemDto(saved));
  }

  async remove(userId: number, id: number) {
    if (!userId) {
      return ResultData.fail(400, "缺少用户信息");
    }
    if (!Number.isInteger(id) || id <= 0) {
      return ResultData.fail(400, "记录ID不合法");
    }
    const record = await this.findOwn(userId, id);
    if (!record) {
      return ResultData.fail(404, "未找到打分记录");
    }
    await this.driveScoreRep.update({ driveScoreId: record.driveScoreId }, { delFlag: DelFlagEnum.DELETE, updateBy: userId });
    return ResultData.ok();
  }

  private findOwn(userId: number, driveScoreId: number) {
    return this.driveScoreRep.findOne({
      where: { driveScoreId, userId, delFlag: DelFlagEnum.NORMAL }
    });
  }

  private toScoreFields(dto: CreateDriveScoreDto) {
    const vehicleName = String(dto.vehicleName || "").trim();
    const remark = dto.remark == null ? null : String(dto.remark).trim() || null;
    return {
      vehicleName,
      remark,
      scorePowerResponse: dto.scorePowerResponse,
      scoreChassisControl: dto.scoreChassisControl,
      scoreSteeringBraking: dto.scoreSteeringBraking,
      scoreNvhPosture: dto.scoreNvhPosture,
      scoreHmiAdas: dto.scoreHmiAdas,
      scoreEnergyRange: dto.scoreEnergyRange
    };
  }

  private toItemDto(record: DriveScoreRecordEntity): DriveScoreItemDto {
    const scorePowerResponse = toScoreNumber(record.scorePowerResponse);
    const scoreChassisControl = toScoreNumber(record.scoreChassisControl);
    const scoreSteeringBraking = toScoreNumber(record.scoreSteeringBraking);
    const scoreNvhPosture = toScoreNumber(record.scoreNvhPosture);
    const scoreHmiAdas = toScoreNumber(record.scoreHmiAdas);
    const scoreEnergyRange = toScoreNumber(record.scoreEnergyRange);
    const allScores = [scorePowerResponse, scoreChassisControl, scoreSteeringBraking, scoreNvhPosture, scoreHmiAdas, scoreEnergyRange];
    return {
      driveScoreId: record.driveScoreId,
      vehicleName: record.vehicleName,
      remark: record.remark,
      scorePowerResponse,
      scoreChassisControl,
      scoreSteeringBraking,
      scoreNvhPosture,
      scoreHmiAdas,
      scoreEnergyRange,
      totalScore: averageScore(allScores),
      createTime: record.createTime,
      updateTime: record.updateTime
    };
  }
}
