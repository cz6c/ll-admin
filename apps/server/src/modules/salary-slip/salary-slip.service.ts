import { Injectable, Logger } from "@nestjs/common";
import { ResultData } from "@/common/utils/result";
import { ImagePreprocessService } from "@/plugins/image-preprocess.service";
import { OcrService } from "@/plugins/ocr.service";
import { OcrProviderError } from "@/plugins/ocr/ocr-provider.interface";
import { detectTableSkew, extractAlignedPairs } from "@/plugins/utils/ocr-layout";
import { SalarySlipResultDto } from "./dto/salary-slip-result.dto";
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
    private readonly ocrService: OcrService
  ) {}

  async recognize(file: Express.Multer.File) {
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

      emit("success");

      return ResultData.ok(result);
    } catch (error: unknown) {
      const code = error instanceof Error ? error.message : "unknown_error";
      emit("fail", code);
      return ResultData.fail(500, "识别失败，请稍后重试");
    }
  }
}
