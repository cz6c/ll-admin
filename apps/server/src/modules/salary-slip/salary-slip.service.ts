import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { QueryFailedError, Repository } from "typeorm";
import { DelFlagEnum } from "@/common/enum/dict";
import { CacheEnum } from "@/common/enum/loca";
import { UserEntity } from "@/modules/system/user/entities/user.entity";
import { RedisService } from "@/modules/redis/redis.service";
import { ResultData } from "@/common/utils/result";
import { SalaryHistoryType, SalaryVerifyHistoryItemDto, UpsertSalaryVerifyHistoryDto } from "./dto/salary-verify-history.dto";
import { SalarySlipResultDto } from "./dto/salary-slip-result.dto";
import { SalaryVerifyHistoryEntity } from "./entities/salary-verify-history.entity";
import { SalaryHistoryTypeEnum } from "./enums/salary-history.enum";
import { SalarySlipRecognizeOrchestrator } from "./recognize/salary-slip-recognize.orchestrator";
import { createTraceId, logSalarySlipRecognize, RecognizeTiming, OcrLogSnapshot, ResultLogSnapshot } from "./utils/recognize-logger";

/** 单用户每日识别上限；超限返回 429 */
const DAILY_RECOGNIZE_LIMIT = 10;
/** 日切按上海时区，与产品「自然日」口径一致 */
const SHANGHAI_TIMEZONE = "Asia/Shanghai";

/**
 * 工资条识别与薪资历史
 * 识别：限流 + 调 Orchestrator（VLM/OCR 主备）+ 写 Redis 日计数
 * 历史：verify/calc 共表 upsert / 列表 / 详情 / 软删
 */
@Injectable()
export class SalarySlipService {
  private readonly logger = new Logger(SalarySlipService.name);

  constructor(
    private readonly recognizeOrchestrator: SalarySlipRecognizeOrchestrator,
    private readonly redisService: RedisService,
    @InjectRepository(UserEntity)
    private readonly userRep: Repository<UserEntity>,
    @InjectRepository(SalaryVerifyHistoryEntity)
    private readonly salaryVerifyHistoryRep: Repository<SalaryVerifyHistoryEntity>
  ) {}

  private formatDateAsiaShanghai(date = new Date()): string {
    return new Intl.DateTimeFormat("en-CA", { timeZone: SHANGHAI_TIMEZONE }).format(date);
  }

  private secondsUntilEndOfDayAsiaShanghai(): number {
    const dateStr = this.formatDateAsiaShanghai();
    const endMs = new Date(`${dateStr}T23:59:59+08:00`).getTime() + 1000;
    return Math.max(60, Math.ceil((endMs - Date.now()) / 1000));
  }

  private buildDailyRecognizeKey(userId: number): string {
    return `${CacheEnum.SALARY_RECOGNIZE_DAILY_KEY}${userId}:${this.formatDateAsiaShanghai()}`;
  }

  private isDuplicateEntryError(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) {
      return false;
    }
    const driverError = error.driverError as { code?: string } | undefined;
    return driverError?.code === "ER_DUP_ENTRY";
  }

  private async getDailyRecognizeCount(userId: number): Promise<number> {
    const raw = await this.redisService.getClient().get(this.buildDailyRecognizeKey(userId));
    return Number(raw || 0);
  }

  private async incrementDailyRecognizeCount(userId: number): Promise<void> {
    const redisKey = this.buildDailyRecognizeKey(userId);
    const count = await this.redisService.getClient().incr(redisKey);
    if (count === 1) {
      await this.redisService.getClient().expire(redisKey, this.secondsUntilEndOfDayAsiaShanghai());
    }
  }

  /** 含软删行：同月再 upsert 时复活（del_flag 置回 NORMAL），与唯一键语义一致 */
  private async findVerifyHistory(userId: number, payPeriod: string) {
    return this.salaryVerifyHistoryRep.findOne({
      where: {
        userId,
        historyType: SalaryHistoryTypeEnum.VERIFY,
        payPeriod
      }
    });
  }

  private async saveVerifyHistoryUpdate(existed: SalaryVerifyHistoryEntity, payload: Partial<SalaryVerifyHistoryEntity>) {
    const updatedEntity = this.salaryVerifyHistoryRep.create({
      ...existed,
      ...payload,
      delFlag: DelFlagEnum.NORMAL
    });
    const updated = await this.salaryVerifyHistoryRep.save(updatedEntity);
    return ResultData.ok(this.toHistoryItemDto(updated));
  }

  private toHistoryItemDto(row: SalaryVerifyHistoryEntity): SalaryVerifyHistoryItemDto {
    return {
      id: row.id,
      historyType: row.historyType ?? SalaryHistoryTypeEnum.VERIFY,
      payPeriod: row.payPeriod,
      preTaxMonthly: Number(row.preTaxMonthly),
      ssPersonalAmount: Number(row.ssPersonalAmount),
      hfPersonalAmount: Number(row.hfPersonalAmount),
      otherDeductionAmount: Number(row.otherDeductionAmount ?? 0),
      specialDeductionMonthly: Number(row.specialDeductionMonthly),
      personalIncomeTax: Number(row.personalIncomeTax),
      yearEndTaxMode: row.yearEndTaxMode,
      yearEndBonus: Number(row.yearEndBonus ?? 0),
      postTaxMonthly: Number(row.postTaxMonthly),
      inferredPreTax: row.inferredPreTax == null ? null : Number(row.inferredPreTax),
      reportBias: row.reportBias ?? null,
      useInferredForCumulative: Boolean(row.useInferredForCumulative),
      updateTime: row.updateTime
    };
  }

  private ensureHistoryPayload(dto: UpsertSalaryVerifyHistoryDto) {
    const historyType: SalaryHistoryType = dto.historyType ?? SalaryHistoryTypeEnum.VERIFY;
    if (historyType === SalaryHistoryTypeEnum.VERIFY) {
      if (!dto.payPeriod) {
        return { ok: false as const, message: "verify 类型缺少 payPeriod" };
      }
      if (typeof dto.personalIncomeTax !== "number") {
        return { ok: false as const, message: "verify 类型缺少 personalIncomeTax" };
      }
      if (typeof dto.postTaxMonthly !== "number") {
        return { ok: false as const, message: "verify 类型缺少 postTaxMonthly" };
      }
      return { ok: true as const, historyType };
    }
    if (!dto.yearEndTaxMode) {
      return { ok: false as const, message: "calc 类型缺少 yearEndTaxMode" };
    }
    if (typeof dto.yearEndBonus !== "number") {
      return { ok: false as const, message: "calc 类型缺少 yearEndBonus" };
    }
    return { ok: true as const, historyType };
  }

  /**
   * 工资条智能识别
   * @returns ResultData 包装的 SalarySlipResultDto；限流/空文件/识别失败映射为对应业务文案
   */
  async recognize(file: Express.Multer.File, userId: number) {
    const traceId = createTraceId();
    const startedAt = Date.now();
    let timing: RecognizeTiming = { preprocess: 0, ocr: 0, align: 0, rules: 0, vlm: 0 };
    let ocrSnapshot: OcrLogSnapshot | undefined;
    let resultSnapshot: ResultLogSnapshot | undefined;

    const emit = (outcome: "success" | "fail", errorCode?: string) => {
      logSalarySlipRecognize(this.logger, {
        event: "salary_slip_recognize",
        traceId,
        outcome,
        durationMs: Date.now() - startedAt,
        errorCode,
        timing,
        ocr: ocrSnapshot,
        result: resultSnapshot
      });
    };

    if (!file?.buffer?.length) {
      emit("fail", "empty_file");
      return ResultData.fail(400, "请上传工资条图片");
    }
    if (!userId) {
      emit("fail", "missing_user_id");
      return ResultData.fail(400, "缺少用户信息");
    }

    const dailyCount = await this.getDailyRecognizeCount(userId);
    if (dailyCount >= DAILY_RECOGNIZE_LIMIT) {
      emit("fail", "daily_limit_exceeded");
      return ResultData.fail(429, "今日识别次数已达上限（10次），请明天再试");
    }

    try {
      const engineOutcome = await this.recognizeOrchestrator.recognize(file.buffer);
      timing = engineOutcome.timing;
      ocrSnapshot = engineOutcome.ocr;
      resultSnapshot = engineOutcome.resultSnapshot;

      if (engineOutcome.ok === false) {
        emit("fail", engineOutcome.errorCode);
        return ResultData.fail(engineOutcome.httpStatus, engineOutcome.message);
      }

      const result: SalarySlipResultDto = engineOutcome.result;

      const user = await this.userRep.findOne({ where: { userId } });
      if (!user) {
        emit("fail", "user_not_found");
        return ResultData.fail(404, "用户不存在");
      }
      // 日限流走 Redis；不再累计 sys_user.recognize_count（与历史表重复）
      await this.incrementDailyRecognizeCount(userId);

      emit("success");

      return ResultData.ok(result);
    } catch (error: unknown) {
      const code = error instanceof Error ? error.message : "unknown_error";
      emit("fail", code);
      return ResultData.fail(500, "识别失败，请稍后重试");
    }
  }

  /**
   * 新增或更新薪资历史
   * - 有 id：按 id 更新本人未删记录（编辑）
   * - 无 id：verify 按 period upsert（含软删复活）；calc 新增快照
   */
  async upsertHistory(userId: number, dto: UpsertSalaryVerifyHistoryDto) {
    if (!userId) {
      return ResultData.fail(400, "缺少用户信息");
    }
    const checked = this.ensureHistoryPayload(dto);
    if (!checked.ok) {
      return ResultData.fail(400, checked.message);
    }

    const historyType = checked.historyType;
    const payload: Partial<SalaryVerifyHistoryEntity> = {
      userId,
      historyType,
      payPeriod: historyType === SalaryHistoryTypeEnum.VERIFY ? dto.payPeriod : null,
      preTaxMonthly: String(dto.preTaxMonthly),
      ssPersonalAmount: String(dto.ssPersonalAmount ?? 0),
      hfPersonalAmount: String(dto.hfPersonalAmount ?? 0),
      otherDeductionAmount: String(dto.otherDeductionAmount ?? 0),
      specialDeductionMonthly: String(dto.specialDeductionMonthly ?? 0),
      personalIncomeTax: String(dto.personalIncomeTax ?? 0),
      yearEndTaxMode: dto.yearEndTaxMode ?? null,
      yearEndBonus: String(dto.yearEndBonus ?? 0),
      postTaxMonthly: String(dto.postTaxMonthly ?? 0)
    };

    // 反推三字段：仅 DTO 显式传入时写入，避免普通保存误清、也避免 calc 带脏数据
    if (historyType === SalaryHistoryTypeEnum.VERIFY) {
      if (dto.inferredPreTax !== undefined) {
        payload.inferredPreTax = dto.inferredPreTax == null ? null : String(dto.inferredPreTax);
      }
      if (dto.reportBias !== undefined) {
        payload.reportBias = dto.reportBias ?? null;
      }
      if (dto.useInferredForCumulative !== undefined) {
        payload.useInferredForCumulative = Boolean(dto.useInferredForCumulative);
      }
    } else {
      payload.inferredPreTax = null;
      payload.reportBias = null;
      payload.useInferredForCumulative = false;
    }

    if (dto.id != null) {
      return this.updateHistoryById(userId, dto.id, historyType, payload, dto.payPeriod);
    }

    if (historyType === SalaryHistoryTypeEnum.VERIFY) {
      const existed = await this.findVerifyHistory(userId, dto.payPeriod);
      if (existed) {
        return this.saveVerifyHistoryUpdate(existed, payload);
      }

      try {
        const createdEntity = this.salaryVerifyHistoryRep.create({
          ...payload,
          delFlag: DelFlagEnum.NORMAL
        });
        const created = await this.salaryVerifyHistoryRep.save(createdEntity);
        return ResultData.ok(this.toHistoryItemDto(created));
      } catch (error: unknown) {
        if (this.isDuplicateEntryError(error)) {
          const retryExisted = await this.findVerifyHistory(userId, dto.payPeriod);
          if (retryExisted) {
            return this.saveVerifyHistoryUpdate(retryExisted, payload);
          }
        }
        throw error;
      }
    }

    const createdEntity = this.salaryVerifyHistoryRep.create(payload);
    const created = await this.salaryVerifyHistoryRep.save(createdEntity);
    return ResultData.ok(this.toHistoryItemDto(created));
  }

  /**
   * 按 id 编辑更新；校验归属、类型；verify 改月份时不可撞到他行唯一键
   */
  private async updateHistoryById(userId: number, id: number, historyType: SalaryHistoryType, payload: Partial<SalaryVerifyHistoryEntity>, payPeriod?: string) {
    if (!Number.isInteger(id) || id <= 0) {
      return ResultData.fail(400, "历史记录ID不合法");
    }
    const existed = await this.salaryVerifyHistoryRep.findOne({
      where: {
        id,
        userId,
        delFlag: DelFlagEnum.NORMAL
      }
    });
    if (!existed) {
      return ResultData.fail(404, "历史记录不存在");
    }
    if ((existed.historyType ?? SalaryHistoryTypeEnum.VERIFY) !== historyType) {
      return ResultData.fail(400, "记录类型不匹配");
    }
    if (historyType === SalaryHistoryTypeEnum.VERIFY && payPeriod) {
      const conflict = await this.findVerifyHistory(userId, payPeriod);
      if (conflict && conflict.id !== existed.id) {
        return ResultData.fail(400, "该月份已有核对记录");
      }
    }
    return this.saveVerifyHistoryUpdate(existed, payload);
  }

  /**
   * 当前用户历史列表；keyword 模糊匹配 payPeriod / 税前月薪
   * 排序契约（前端须保持该顺序，勿再本地重排）：
   * 1. payPeriod DESC（所属月新→旧，如 2026-06 → 2026-05 → 2026-04）
   * 2. 同所属月再按 updateTime DESC；calc 的 payPeriod 为 NULL，MySQL DESC 下排在有所属月记录之后
   */
  async listHistory(userId: number, keyword?: string, historyType?: SalaryHistoryType) {
    if (!userId) {
      return ResultData.fail(400, "缺少用户信息");
    }
    const queryBuilder = this.salaryVerifyHistoryRep.createQueryBuilder("history");
    queryBuilder.where("history.userId = :userId", { userId });
    queryBuilder.andWhere("history.delFlag = :delFlag", { delFlag: DelFlagEnum.NORMAL });
    if (historyType) {
      queryBuilder.andWhere("history.historyType = :historyType", { historyType });
    }
    const trimmedKeyword = String(keyword || "").trim();
    if (trimmedKeyword) {
      queryBuilder.andWhere("(history.payPeriod LIKE :keyword OR history.preTaxMonthly LIKE :keyword)", {
        keyword: `%${trimmedKeyword}%`
      });
    }
    queryBuilder.orderBy("history.payPeriod", "DESC").addOrderBy("history.updateTime", "DESC");
    const list = await queryBuilder.getMany();
    return ResultData.ok(list.map(item => this.toHistoryItemDto(item)));
  }

  /**
   * 历史详情：按 id 取本人未删记录。
   * 仅 verify 附带 relatedVerifyList（同年核对，供累计预扣）；calc 只返回 item。
   */
  async getHistoryDetail(userId: number, id: number) {
    if (!userId) {
      return ResultData.fail(400, "缺少用户信息");
    }
    if (!Number.isInteger(id) || id <= 0) {
      return ResultData.fail(400, "历史记录ID不合法");
    }
    const history = await this.salaryVerifyHistoryRep.findOne({
      where: {
        id,
        userId,
        delFlag: DelFlagEnum.NORMAL
      }
    });
    if (!history) {
      return ResultData.fail(404, "未找到历史记录");
    }

    const item = this.toHistoryItemDto(history);

    if (history.historyType !== SalaryHistoryTypeEnum.VERIFY || !history.payPeriod) {
      return ResultData.ok({ item });
    }

    const year = String(history.payPeriod).slice(0, 4);
    if (!/^\d{4}$/.test(year)) {
      return ResultData.ok({ item, relatedVerifyList: [item] });
    }

    const related = await this.salaryVerifyHistoryRep
      .createQueryBuilder("history")
      .where("history.userId = :userId", { userId })
      .andWhere("history.delFlag = :delFlag", { delFlag: DelFlagEnum.NORMAL })
      .andWhere("history.historyType = :historyType", { historyType: SalaryHistoryTypeEnum.VERIFY })
      .andWhere("history.payPeriod LIKE :yearPrefix", { yearPrefix: `${year}-%` })
      .orderBy("history.payPeriod", "ASC")
      .getMany();

    return ResultData.ok({
      item,
      relatedVerifyList: related.map(row => this.toHistoryItemDto(row))
    });
  }

  /** 软删单条历史（delFlag）；仅能删本人记录 */
  async removeHistory(userId: number, id: number) {
    if (!userId) {
      return ResultData.fail(400, "缺少用户信息");
    }
    if (!Number.isInteger(id) || id <= 0) {
      return ResultData.fail(400, "历史记录ID不合法");
    }
    const history = await this.salaryVerifyHistoryRep.findOne({
      where: {
        id,
        userId,
        delFlag: DelFlagEnum.NORMAL
      }
    });
    if (!history) {
      return ResultData.fail(404, "未找到历史记录");
    }
    await this.salaryVerifyHistoryRep.update({ id: history.id }, { delFlag: DelFlagEnum.DELETE });
    return ResultData.ok();
  }
}
