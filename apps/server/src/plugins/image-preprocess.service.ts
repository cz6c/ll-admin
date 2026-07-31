/**
 * 识别前图片预处理
 * 职责：统一格式、按需 EXIF 旋转；宽表截图尽量原样保留
 * 适用：salary-slip OCR/VLM 共用；失败时回退原图，不阻断识别
 *
 * auto 决策顺序：
 * 1. none → 原样
 * 2. 非 jpeg/png/bmp → 转 PNG（含 EXIF 旋转）
 * 3. 宽表截图 → 原样（避免破坏列边界）
 * 4. light/auto → 仅 EXIF 需旋转时转正
 * 5. enhance → 灰度+归一化+锐化（须显式开启）
 */
import { Injectable, Logger } from "@nestjs/common";
// CommonJS 导出：sharp 无稳定 ESM default，require 避免编译后不可用
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sharp = require("sharp");

export type OcrPreprocessMode = "auto" | "none" | "light" | "enhance";

export interface ImagePreprocessOptions {
  /** 默认 auto；enhance 仅显式启用 */
  mode?: OcrPreprocessMode;
}

export interface ImagePreprocessMeta {
  inputWidth: number | null;
  inputHeight: number | null;
  outputBytes: number;
  applied: boolean;
  mode?: OcrPreprocessMode;
  /** 跳过原因，或已处理时的动作说明（如 format_convert_webp） */
  skipReason?: string;
  error?: string;
  inputFormat?: string;
  outputFormat?: string;
}

/** 决策结果：passthrough 不改 buffer，其余由 pipeline 产出 */
type PreprocessPlan =
  | { action: "passthrough"; reason: string }
  | { action: "safe_png"; reason: string }
  | { action: "enhance_png"; reason: string };

/** 云端友好位图；其余先转 PNG */
const NATIVE_FORMATS = new Set(["jpeg", "jpg", "png", "bmp"]);

@Injectable()
export class ImagePreprocessService {
  private readonly logger = new Logger(ImagePreprocessService.name);

  async preprocessForOcr(
    input: Buffer,
    options?: ImagePreprocessOptions
  ): Promise<{ buffer: Buffer; meta: ImagePreprocessMeta }> {
    const mode = options?.mode ?? "auto";

    try {
      const inputMeta = await sharp(input, { failOn: "none" }).metadata();
      const width = inputMeta.width ?? 0;
      const height = inputMeta.height ?? 0;
      const inputFormat = inputMeta.format;
      const baseMeta = this.buildBaseMeta(input, mode, width, height, inputFormat);

      const plan = this.plan(mode, inputFormat, width, height, inputMeta.orientation ?? 1);
      if (plan.action === "passthrough") {
        return { buffer: input, meta: { ...baseMeta, skipReason: plan.reason } };
      }

      const buffer =
        plan.action === "enhance_png" ? await this.toEnhancedPng(input) : await this.toSafePng(input);

      return {
        buffer,
        meta: {
          ...baseMeta,
          outputBytes: buffer.length,
          applied: true,
          outputFormat: "png",
          skipReason: plan.reason
        }
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`image_preprocess_fallback: ${message}`);
      return {
        buffer: input,
        meta: {
          inputWidth: null,
          inputHeight: null,
          outputBytes: input.length,
          applied: false,
          mode,
          error: message
        }
      };
    }
  }

  private buildBaseMeta(
    input: Buffer,
    mode: OcrPreprocessMode,
    width: number,
    height: number,
    inputFormat: string | undefined
  ): ImagePreprocessMeta {
    return {
      inputWidth: width || null,
      inputHeight: height || null,
      outputBytes: input.length,
      applied: false,
      mode,
      inputFormat,
      outputFormat: inputFormat
    };
  }

  /** 只决定做什么，不碰 buffer */
  private plan(
    mode: OcrPreprocessMode,
    inputFormat: string | undefined,
    width: number,
    height: number,
    orientation: number
  ): PreprocessPlan {
    if (mode === "none") {
      return { action: "passthrough", reason: "disabled" };
    }

    if (inputFormat && !NATIVE_FORMATS.has(inputFormat.toLowerCase())) {
      return { action: "safe_png", reason: `format_convert_${inputFormat}` };
    }

    if (mode === "auto" && isWideTableScreenshot(width, height)) {
      return { action: "passthrough", reason: "wide_table_screenshot" };
    }

    if (mode === "enhance") {
      return { action: "enhance_png", reason: "enhance" };
    }

    // light / auto：仅 EXIF 非 1 时转正
    if (orientation === 1) {
      return { action: "passthrough", reason: "no_exif_rotation" };
    }
    return { action: "safe_png", reason: "exif_rotate" };
  }

  /** 解码 + EXIF 旋转 + PNG，不做增强 */
  private toSafePng(input: Buffer): Promise<Buffer> {
    return sharp(input, { failOn: "none" }).rotate().png().toBuffer();
  }

  /** 拍照增强：仅 enhance 模式 */
  private toEnhancedPng(input: Buffer): Promise<Buffer> {
    return sharp(input, { failOn: "none" }).rotate().grayscale().normalize().sharpen({ sigma: 0.8 }).png().toBuffer();
  }
}

/** 宽表截图：极宽或矮宽表（Excel/表格导出常见） */
function isWideTableScreenshot(width: number, height: number): boolean {
  if (width <= 0 || height <= 0) {
    return false;
  }
  return width / height >= 5 || (height <= 200 && width >= 800);
}
