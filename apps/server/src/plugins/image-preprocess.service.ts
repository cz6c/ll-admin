import { Injectable, Logger } from "@nestjs/common";
// CommonJS 导出，与 ocr.service 中 rapidocrjson 一致，避免 default import 编译后不可用
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sharp = require("sharp");

export type OcrPreprocessMode = "auto" | "none" | "light" | "enhance";

export interface ImagePreprocessOptions {
  /** auto：宽表截图跳过；拍照图仅 EXIF 旋转；enhance 仅显式启用 */
  mode?: OcrPreprocessMode;
}

export interface ImagePreprocessMeta {
  inputWidth: number | null;
  inputHeight: number | null;
  outputBytes: number;
  applied: boolean;
  mode?: OcrPreprocessMode;
  skipReason?: string;
  error?: string;
}

/** 宽表截图特征：横向极宽、行高很矮（Excel/表格导出常见） */
function isWideTableScreenshot(width: number, height: number): boolean {
  if (width <= 0 || height <= 0) {
    return false;
  }
  return width / height >= 5 || (height <= 200 && width >= 800);
}

@Injectable()
export class ImagePreprocessService {
  private readonly logger = new Logger(ImagePreprocessService.name);

  async preprocessForOcr(input: Buffer, options?: ImagePreprocessOptions): Promise<{ buffer: Buffer; meta: ImagePreprocessMeta }> {
    const mode = options?.mode ?? "auto";

    try {
      const inputMeta = await sharp(input, { failOn: "none" }).metadata();
      const width = inputMeta.width ?? 0;
      const height = inputMeta.height ?? 0;
      const baseMeta: ImagePreprocessMeta = {
        inputWidth: width || null,
        inputHeight: height || null,
        outputBytes: input.length,
        applied: false,
        mode
      };

      if (mode === "none") {
        return { buffer: input, meta: { ...baseMeta, skipReason: "disabled" } };
      }

      if (mode === "auto" && isWideTableScreenshot(width, height)) {
        // 宽表截图保留原图：灰度/归一化/JPEG 会破坏列边界与彩色表头
        return { buffer: input, meta: { ...baseMeta, skipReason: "wide_table_screenshot" } };
      }

      if (mode === "light" || mode === "auto") {
        const orientation = inputMeta.orientation ?? 1;
        if (orientation === 1) {
          return { buffer: input, meta: { ...baseMeta, skipReason: "no_exif_rotation" } };
        }

        const buffer = await sharp(input, { failOn: "none" }).rotate().png().toBuffer();
        return {
          buffer,
          meta: {
            ...baseMeta,
            outputBytes: buffer.length,
            applied: true,
            skipReason: undefined
          }
        };
      }

      // enhance：仅用于显式要求的拍照场景，宽表业务勿用
      const buffer = await sharp(input, { failOn: "none" }).rotate().grayscale().normalize().sharpen({ sigma: 0.8 }).png().toBuffer();
      return {
        buffer,
        meta: {
          ...baseMeta,
          outputBytes: buffer.length,
          applied: true
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
}
