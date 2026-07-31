/**
 * 工资条识别编排：预处理 + 按配置选择 VLM/OCR 主备路径
 * 主备只在此决定；能力模块不互调
 */
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ImagePreprocessService } from "@/plugins/image-preprocess.service";
import { SalarySlipResultDto } from "../dto/salary-slip-result.dto";
import {
  buildResultLogSnapshot,
  OcrLogSnapshot,
  RecognizeTiming,
  ResultLogSnapshot
} from "../utils/recognize-logger";
import { OcrRecognizeStrategy } from "./ocr-recognize.strategy";
import type { RecognizeEngine, RecognizeStrategyOutcome, SalarySlipRecognizeStrategy } from "./recognize.types";
import { VlmRecognizeStrategy } from "./vlm-recognize.strategy";

const MIME_BY_FORMAT: Record<string, string> = {
  png: "image/png",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  webp: "image/webp"
};

/** 编排成功 */
export interface OrchestratorSuccess {
  ok: true;
  result: SalarySlipResultDto;
  timing: RecognizeTiming;
  ocr?: OcrLogSnapshot;
  resultSnapshot: ResultLogSnapshot;
  engine: RecognizeEngine;
  fallbackFrom?: RecognizeEngine;
  fallbackReason?: string;
}

/** 编排失败（已映射业务文案） */
export interface OrchestratorFailure {
  ok: false;
  errorCode: string;
  httpStatus: number;
  message: string;
  timing: RecognizeTiming;
  ocr?: OcrLogSnapshot;
  resultSnapshot?: ResultLogSnapshot;
  engine?: RecognizeEngine;
  fallbackFrom?: RecognizeEngine;
  fallbackReason?: string;
}

export type OrchestratorOutcome = OrchestratorSuccess | OrchestratorFailure;

@Injectable()
export class SalarySlipRecognizeOrchestrator {
  private readonly logger = new Logger(SalarySlipRecognizeOrchestrator.name);

  constructor(
    private readonly config: ConfigService,
    private readonly imagePreprocessService: ImagePreprocessService,
    private readonly ocrStrategy: OcrRecognizeStrategy,
    private readonly vlmStrategy: VlmRecognizeStrategy
  ) {}

  /**
   * 执行识别：预处理后按 salarySlip.recognize.primary / fallback 跑策略链
   */
  async recognize(fileBuffer: Buffer): Promise<OrchestratorOutcome> {
    const timing: RecognizeTiming = { preprocess: 0, ocr: 0, align: 0, rules: 0, vlm: 0 };

    const preprocessStart = Date.now();
    let buffer: Buffer;
    let mimeType: string;
    try {
      const { buffer: ocrBuffer, meta: preprocessMeta } = await this.imagePreprocessService.preprocessForOcr(fileBuffer, {
        mode: "auto"
      });
      buffer = ocrBuffer;
      mimeType = MIME_BY_FORMAT[preprocessMeta.outputFormat || ""] || "image/jpeg";
      timing.preprocess = Date.now() - preprocessStart;
    } catch (error: unknown) {
      timing.preprocess = Date.now() - preprocessStart;
      const code = error instanceof Error ? error.message : "preprocess_error";
      return {
        ok: false,
        errorCode: code,
        httpStatus: 500,
        message: "识别失败，请稍后重试",
        timing
      };
    }

    const { primary, fallback } = this.resolveChain();
    const primaryOutcome = await this.runStrategy(primary, buffer, mimeType);
    this.mergeTiming(timing, primaryOutcome.timing);

    if (primaryOutcome.ok === true) {
      return {
        ok: true,
        result: primaryOutcome.result,
        timing,
        ocr: primaryOutcome.ocr,
        resultSnapshot: primaryOutcome.resultSnapshot,
        engine: primaryOutcome.engine
      };
    }

    const primaryFailure = primaryOutcome;
    if (!fallback || fallback === primary || !this.shouldFallback(primaryFailure)) {
      return this.toFailure(primaryFailure, timing);
    }

    this.logger.warn(`recognize primary=${primary} failed (${primaryFailure.errorCode}), fallback=${fallback}`);
    const fallbackOutcome = await this.runStrategy(fallback, buffer, mimeType);
    this.mergeTiming(timing, fallbackOutcome.timing);

    if (fallbackOutcome.ok === true) {
      return {
        ok: true,
        result: fallbackOutcome.result,
        timing,
        ocr: {
          ...fallbackOutcome.ocr,
          fallbackFrom: primary,
          fallbackReason: primaryFailure.errorCode
        },
        resultSnapshot: fallbackOutcome.resultSnapshot,
        engine: fallbackOutcome.engine,
        fallbackFrom: primary,
        fallbackReason: primaryFailure.errorCode
      };
    }

    // 备路径也失败：返回备路径错误，并标记曾尝试主路径
    return {
      ...this.toFailure(fallbackOutcome, timing),
      fallbackFrom: primary,
      fallbackReason: primaryFailure.errorCode
    };
  }

  private resolveChain(): { primary: RecognizeEngine; fallback: RecognizeEngine | null } {
    const primaryRaw = (this.config.get<string>("salarySlip.recognize.primary") || "ocr").toLowerCase();
    const fallbackRaw = (this.config.get<string>("salarySlip.recognize.fallback") || "none").toLowerCase();
    const primary: RecognizeEngine = primaryRaw === "vlm" ? "vlm" : "ocr";
    if (fallbackRaw === "none" || fallbackRaw === "" || fallbackRaw === primaryRaw) {
      return { primary, fallback: null };
    }
    const fallback: RecognizeEngine = fallbackRaw === "vlm" ? "vlm" : "ocr";
    return { primary, fallback };
  }

  private strategyOf(engine: RecognizeEngine): SalarySlipRecognizeStrategy {
    return engine === "vlm" ? this.vlmStrategy : this.ocrStrategy;
  }

  private runStrategy(engine: RecognizeEngine, buffer: Buffer, mimeType: string): Promise<RecognizeStrategyOutcome> {
    return this.strategyOf(engine).recognize({ buffer, mimeType });
  }

  /**
   * 硬失败才跨模态降级；业务拒识（倾斜/空图）不浪费备路径
   * 可通过 salarySlip.recognize.fallbackOn 覆盖默认错误码列表
   */
  private shouldFallback(failure: Extract<RecognizeStrategyOutcome, { ok: false }>): boolean {
    const configured = this.config.get<string[]>("salarySlip.recognize.fallbackOn");
    const codes =
      Array.isArray(configured) && configured.length
        ? configured
        : [
            "ocr_not_configured",
            "ocr_timeout",
            "ocr_error",
            "vlm_not_configured",
            "vlm_timeout",
            "vlm_empty",
            "vlm_parse_error",
            "vlm_error"
          ];

    const code = failure.errorCode;
    if (codes.includes(code)) {
      return true;
    }
    // 引擎动态错误码：qwen_ocr_xxx、vlm_remote_xxx、vlm_error:msg
    if (code.startsWith("qwen_ocr_") || code.startsWith("vlm_remote_") || code.startsWith("vlm_error")) {
      return true;
    }
    return false;
  }

  private mergeTiming(target: RecognizeTiming, partial?: Partial<RecognizeTiming>): void {
    if (!partial) {
      return;
    }
    if (typeof partial.preprocess === "number") target.preprocess += partial.preprocess;
    if (typeof partial.ocr === "number") target.ocr += partial.ocr;
    if (typeof partial.align === "number") target.align += partial.align;
    if (typeof partial.rules === "number") target.rules += partial.rules;
    if (typeof partial.vlm === "number") target.vlm += partial.vlm;
  }

  private toFailure(outcome: Extract<RecognizeStrategyOutcome, { ok: false }>, timing: RecognizeTiming): OrchestratorFailure {
    return {
      ok: false,
      errorCode: outcome.errorCode,
      httpStatus: outcome.httpStatus,
      message: outcome.message,
      timing,
      ocr: outcome.ocr,
      resultSnapshot: outcome.resultSnapshot ?? (outcome.result ? buildResultLogSnapshot({
        line_items: (outcome.result.line_items || []).map(item => ({
          key: item.key,
          value: item.value,
          confidence: item.confidence,
          warning: item.warning
        })),
        confidence: outcome.result.confidence || "low"
      }) : undefined),
      engine: outcome.engine
    };
  }
}
