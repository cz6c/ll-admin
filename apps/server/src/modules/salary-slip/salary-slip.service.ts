import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { QueryFailedError, Repository } from "typeorm";
import { DelFlagEnum } from "@/common/enum/dict";
import { CacheEnum } from "@/common/enum/loca";
import { UserEntity } from "@/modules/system/user/entities/user.entity";
import { RedisService } from "@/modules/redis/redis.service";
import { ResultData } from "@/common/utils/result";
import { ImagePreprocessService } from "@/plugins/image-preprocess.service";
import { OcrService } from "@/plugins/ocr.service";
import { OcrProviderError } from "@/plugins/ocr/ocr-provider.interface";
import { detectTableSkew, extractAlignedPairs } from "@/plugins/utils/ocr-layout";
import { SalaryHistoryType, SalaryVerifyHistoryItemDto, UpsertSalaryVerifyHistoryDto } from "./dto/salary-verify-history.dto";
import { SalarySlipResultDto } from "./dto/salary-slip-result.dto";
import { SalaryVerifyHistoryEntity } from "./entities/salary-verify-history.entity";
import { SalaryHistoryTypeEnum } from "./enums/salary-history.enum";
import { lineItemsFromOcr } from "./utils/line-items-from-ocr";
import {
  buildOcrLogSnapshot,
  buildResultLogSnapshot,
  createTraceId,
  logSalarySlipRecognize,
  OcrLogSnapshot,
  RecognizeTiming,
  ResultLogSnapshot
} from "./utils/recognize-logger";

const MIME_BY_FORMAT: Record<string, string> = {
  png: "image/png",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  webp: "image/webp"
};

/** 单用户每日识别上限；超限返回 429 */
const DAILY_RECOGNIZE_LIMIT = 10;
/** 日切按上海时区，与产品「自然日」口径一致 */
const SHANGHAI_TIMEZONE = "Asia/Shanghai";

/**
 * 工资条识别与薪资历史
 * 识别主流程：1. 限流校验 2. 图片预处理 3. OCR 4. 列对齐 5. 规则出 line_items
 * 历史：verify/calc 共表 upsert / 列表 / 详情 / 软删
 */
@Injectable()
export class SalarySlipService {
  private readonly logger = new Logger(SalarySlipService.name);

  constructor(
    private readonly imagePreprocessService: ImagePreprocessService,
    private readonly ocrService: OcrService,
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
      specialDeductionMonthly: Number(row.specialDeductionMonthly),
      personalIncomeTax: Number(row.personalIncomeTax),
      yearEndTaxMode: row.yearEndTaxMode,
      yearEndBonus: Number(row.yearEndBonus ?? 0),
      postTaxMonthly: Number(row.postTaxMonthly),
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
   * @returns ResultData 包装的 SalarySlipResultDto；限流/空文件/OCR 失败映射为对应业务文案
   */
  async recognize(file: Express.Multer.File, userId: number) {
    const traceId = createTraceId();
    const startedAt = Date.now();
    const timing: RecognizeTiming = { preprocess: 0, ocr: 0, align: 0, rules: 0 };
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
      const preprocessStart = Date.now();
      const { buffer: ocrBuffer, meta: preprocessMeta } = await this.imagePreprocessService.preprocessForOcr(file.buffer, {
        mode: "auto"
      });
      timing.preprocess = Date.now() - preprocessStart;

      const mimeType = MIME_BY_FORMAT[preprocessMeta.outputFormat] || "image/jpeg";

      let ocrResult;
      const ocrStart = Date.now();
      try {
        ocrResult = await this.ocrService.recognize(ocrBuffer, mimeType);
        timing.ocr = Date.now() - ocrStart;
        ocrSnapshot = buildOcrLogSnapshot({
          ok: true,
          provider: ocrResult.provider,
          layout: ocrResult.layout,
          fallbackFrom: ocrResult.fallbackFrom,
          fallbackReason: ocrResult.fallbackReason,
          providerMeta: ocrResult.meta,
          priorAttempt: ocrResult.priorAttempt,
          cells: ocrResult.cells,
          text: ocrResult.text
        });
      } catch (error: unknown) {
        timing.ocr = Date.now() - ocrStart;
        const code = error instanceof Error ? error.message : "ocr_error";
        const providerMeta = error instanceof OcrProviderError ? error.meta : undefined;
        ocrSnapshot = buildOcrLogSnapshot({ ok: false, error: code, providerMeta });
        if (code === "ocr_not_configured") {
          emit("fail", code);
          return ResultData.fail(503, "OCR 服务未配置，请联系管理员");
        }
        if (code === "ocr_executable_missing") {
          emit("fail", code);
          return ResultData.fail(503, "OCR 服务未就绪，请联系管理员");
        }
        if (code === "ocr_init_failed" || code.startsWith("ocr_exit_")) {
          emit("fail", code);
          return ResultData.fail(503, "OCR 引擎启动失败，请确认已部署完整 RapidOCR-json 运行包");
        }
        if (code === "ocr_timeout") {
          emit("fail", code);
          return ResultData.fail(408, "OCR 识别超时，请稍后重试");
        }
        emit("fail", code);
        return ResultData.fail(500, "图片识别失败，请稍后重试");
      }

      if (!ocrResult.cells.length) {
        ocrSnapshot = buildOcrLogSnapshot({ ok: false, tooShort: true, error: "ocr_text_too_short" });
        emit("fail", "ocr_text_too_short");
        return ResultData.fail(400, "未识别到有效文字，请重新拍摄");
      }

      const alignStart = Date.now();
      const { pairs, orphans } = extractAlignedPairs(ocrResult.cells, ocrResult.layout);
      timing.align = Date.now() - alignStart;

      const rulesStart = Date.now();
      const rulesResult = lineItemsFromOcr(pairs, orphans);
      timing.rules = Date.now() - rulesStart;
      resultSnapshot = buildResultLogSnapshot(rulesResult);

      const skewResult = detectTableSkew(ocrResult.cells, ocrResult.layout);

      if (skewResult.skewed) {
        emit("fail", "table_skewed");
        return ResultData.fail(400, "表格倾斜，请重新拍摄");
      }

      const result: SalarySlipResultDto = {
        line_items: rulesResult.line_items,
        confidence: rulesResult.confidence
      };

      const user = await this.userRep.findOne({ where: { userId } });
      if (!user) {
        emit("fail", "user_not_found");
        return ResultData.fail(404, "用户不存在");
      }
      await this.userRep.update(
        { userId },
        {
          recognizeCount: (user.recognizeCount || 0) + 1
        }
      );
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
   * 新增或更新薪资历史；verify 按 period upsert（含软删复活），calc 新增快照
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
      specialDeductionMonthly: String(dto.specialDeductionMonthly ?? 0),
      personalIncomeTax: String(dto.personalIncomeTax ?? 0),
      yearEndTaxMode: dto.yearEndTaxMode ?? null,
      yearEndBonus: String(dto.yearEndBonus ?? 0),
      postTaxMonthly: String(dto.postTaxMonthly ?? 0)
    };

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

  /** 当前用户历史列表；keyword 模糊匹配 payPeriod / 税前月薪 */
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
