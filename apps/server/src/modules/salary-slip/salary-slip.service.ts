import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { DelFlagEnum } from "@/common/enum/dict";
import { UserEntity } from "@/modules/system/user/entities/user.entity";
import { ResultData } from "@/common/utils/result";
import { ImagePreprocessService } from "@/plugins/image-preprocess.service";
import { OcrService } from "@/plugins/ocr.service";
import { OcrProviderError } from "@/plugins/ocr/ocr-provider.interface";
import { detectTableSkew, extractAlignedPairs } from "@/plugins/utils/ocr-layout";
import { SalaryVerifyHistoryItemDto, UpsertSalaryVerifyHistoryDto } from "./dto/salary-verify-history.dto";
import { SalarySlipResultDto } from "./dto/salary-slip-result.dto";
import { SalaryVerifyHistoryEntity } from "./entities/salary-verify-history.entity";
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

/** 工资条识别：预处理 → OCR → 列对齐 → 规则直出 line_items */
@Injectable()
export class SalarySlipService {
  private readonly logger = new Logger(SalarySlipService.name);

  constructor(
    private readonly imagePreprocessService: ImagePreprocessService,
    private readonly ocrService: OcrService,
    @InjectRepository(UserEntity)
    private readonly userRep: Repository<UserEntity>,
    @InjectRepository(SalaryVerifyHistoryEntity)
    private readonly salaryVerifyHistoryRep: Repository<SalaryVerifyHistoryEntity>
  ) {}

  private toHistoryItemDto(row: SalaryVerifyHistoryEntity): SalaryVerifyHistoryItemDto {
    return {
      id: row.id,
      payPeriod: row.payPeriod,
      preTaxMonthly: Number(row.preTaxMonthly),
      ssPersonalAmount: Number(row.ssPersonalAmount),
      hfPersonalAmount: Number(row.hfPersonalAmount),
      specialDeductionMonthly: Number(row.specialDeductionMonthly),
      personalIncomeTax: Number(row.personalIncomeTax),
      postTaxMonthly: Number(row.postTaxMonthly),
      savedAt: Number(row.savedAt)
    };
  }

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

      emit("success");

      return ResultData.ok(result);
    } catch (error: unknown) {
      const code = error instanceof Error ? error.message : "unknown_error";
      emit("fail", code);
      return ResultData.fail(500, "识别失败，请稍后重试");
    }
  }

  async upsertHistory(userId: number, dto: UpsertSalaryVerifyHistoryDto) {
    if (!userId) {
      return ResultData.fail(400, "缺少用户信息");
    }
    const savedAt = dto.savedAt ?? Date.now();
    const payload: Partial<SalaryVerifyHistoryEntity> = {
      userId,
      payPeriod: dto.payPeriod,
      preTaxMonthly: String(dto.preTaxMonthly),
      ssPersonalAmount: String(dto.ssPersonalAmount ?? 0),
      hfPersonalAmount: String(dto.hfPersonalAmount ?? 0),
      specialDeductionMonthly: String(dto.specialDeductionMonthly ?? 0),
      personalIncomeTax: String(dto.personalIncomeTax),
      postTaxMonthly: String(dto.postTaxMonthly),
      savedAt: String(savedAt)
    };
    const existed = await this.salaryVerifyHistoryRep.findOne({
      where: {
        userId,
        payPeriod: dto.payPeriod,
        delFlag: DelFlagEnum.NORMAL
      }
    });
    if (existed) {
      const updatedEntity = this.salaryVerifyHistoryRep.create({ ...existed, ...payload });
      const updated = await this.salaryVerifyHistoryRep.save(updatedEntity);
      return ResultData.ok(this.toHistoryItemDto(updated));
    }
    const createdEntity = this.salaryVerifyHistoryRep.create(payload);
    const created = await this.salaryVerifyHistoryRep.save(createdEntity);
    return ResultData.ok(this.toHistoryItemDto(created));
  }

  async listHistory(userId: number, keyword?: string) {
    if (!userId) {
      return ResultData.fail(400, "缺少用户信息");
    }
    const queryBuilder = this.salaryVerifyHistoryRep.createQueryBuilder("history");
    queryBuilder.where("history.userId = :userId", { userId });
    queryBuilder.andWhere("history.delFlag = :delFlag", { delFlag: DelFlagEnum.NORMAL });
    const trimmedKeyword = String(keyword || "").trim();
    if (trimmedKeyword) {
      queryBuilder.andWhere("(history.payPeriod LIKE :keyword OR history.preTaxMonthly LIKE :keyword)", {
        keyword: `%${trimmedKeyword}%`
      });
    }
    queryBuilder.orderBy("history.payPeriod", "DESC").addOrderBy("history.savedAt", "DESC");
    const list = await queryBuilder.getMany();
    return ResultData.ok(list.map(item => this.toHistoryItemDto(item)));
  }

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
