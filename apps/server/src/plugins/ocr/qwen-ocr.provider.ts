import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";
import { deriveNativeBaseUrl, extractOcrResultFromResponse, parseQwenOcrResult } from "./qwen-ocr.adapter";
import type { OcrProvider, OcrProviderMeta, OcrProviderRecognizeResult } from "./ocr-provider.interface";
import { OcrProviderError } from "./ocr-provider.interface";

const DEFAULT_MODEL = "qwen3.5-ocr";
const DEFAULT_TASK = "advanced_recognition";
const MIN_PIXELS = 32 * 32 * 3;
const MAX_PIXELS = 32 * 32 * 8192;
const RESPONSE_PREVIEW_MAX = 1200;

/** DashScope 原生 multimodal-generation + ocr_options */
@Injectable()
export class QwenOcrProvider implements OcrProvider {
  readonly name = "qwen" as const;

  constructor(
    private readonly config: ConfigService,
    private readonly httpService: HttpService
  ) {}

  async recognize(buffer: Buffer, mimeType = "image/jpeg"): Promise<OcrProviderRecognizeResult> {
    const apiKey = this.config.get<string>("ocr.qwen.apiKey") || this.config.get<string>("aliyun.apiKey");
    if (!apiKey) {
      throw new OcrProviderError("ocr_not_configured");
    }

    const baseUrl = this.resolveNativeBaseUrl();
    const model = this.config.get<string>("ocr.qwen.model") || DEFAULT_MODEL;
    const task = this.config.get<string>("ocr.qwen.task") || DEFAULT_TASK;
    const enableRotate = this.config.get<boolean>("ocr.qwen.enableRotate") ?? true;
    const timeout =
      this.config.get<number>("ocr.qwen.timeout") ?? this.config.get<number>("ocr.timeout") ?? this.config.get<number>("aliyun.timeout") ?? 120000;
    const imageDataUrl = `data:${mimeType};base64,${buffer.toString("base64")}`;

    const requestMeta: OcrProviderMeta = { model, task, baseUrl, timeoutMs: timeout, enableRotate };

    try {
      const data = await this.callNativeOcr({
        apiKey,
        baseUrl,
        model,
        task,
        enableRotate,
        timeout,
        imageDataUrl
      });

      const remoteCode = (data as { code?: string; message?: string })?.code;
      const remoteMessage = (data as { message?: string })?.message;
      const cells = parseQwenOcrResult(extractOcrResultFromResponse(data));
      const responsePreview = truncateJson(data);

      if (remoteCode) {
        throw new OcrProviderError(`qwen_ocr_${remoteCode}`, {
          ...requestMeta,
          remoteCode,
          remoteMessage,
          failReason: `remote_code:${remoteCode}${remoteMessage ? `:${remoteMessage}` : ""}`,
          responsePreview
        });
      }

      if (!cells.length) {
        throw new OcrProviderError("qwen_ocr_empty", {
          ...requestMeta,
          failReason: "no_cells",
          responsePreview
        });
      }

      return { cells, raw: data, meta: requestMeta };
    } catch (error: unknown) {
      const err = error as { code?: string; message?: string; response?: { data?: unknown } };
      if (err?.code === "ECONNABORTED" || String(err?.message).includes("timeout")) {
        throw new OcrProviderError("ocr_timeout", {
          ...requestMeta,
          failReason: "ocr_timeout"
        });
      }
      if (error instanceof OcrProviderError) {
        throw error;
      }

      const remoteData = err?.response?.data as { code?: string; message?: string } | undefined;
      if (remoteData?.code) {
        throw new OcrProviderError(`qwen_ocr_${remoteData.code}`, {
          ...requestMeta,
          remoteCode: remoteData.code,
          remoteMessage: remoteData.message,
          failReason: `remote_code:${remoteData.code}${remoteData.message ? `:${remoteData.message}` : ""}`,
          responsePreview: truncateJson(remoteData)
        });
      }
      const remoteMsg = remoteData?.message;
      throw new OcrProviderError(remoteMsg ? `qwen_ocr_error:${remoteMsg}` : "qwen_ocr_error", {
        ...requestMeta,
        failReason: remoteMsg ?? "qwen_ocr_error",
        responsePreview: remoteData ? truncateJson(remoteData) : undefined
      });
    }
  }

  private async callNativeOcr(params: {
    apiKey: string;
    baseUrl: string;
    model: string;
    task: string;
    enableRotate: boolean;
    timeout: number;
    imageDataUrl: string;
  }): Promise<unknown> {
    const response = await firstValueFrom(
      this.httpService.post<unknown>(
        `${params.baseUrl}/services/aigc/multimodal-generation/generation`,
        {
          model: params.model,
          input: {
            messages: [
              {
                role: "user",
                content: [
                  {
                    image: params.imageDataUrl,
                    min_pixels: MIN_PIXELS,
                    max_pixels: MAX_PIXELS,
                    enable_rotate: params.enableRotate
                  }
                ]
              }
            ]
          },
          parameters: {
            ocr_options: { task: params.task }
          }
        },
        {
          headers: {
            Authorization: `Bearer ${params.apiKey}`,
            "Content-Type": "application/json"
          },
          timeout: params.timeout
        }
      )
    );
    return response.data;
  }

  /** 优先 ocr.qwen.baseUrl，否则从 aliyun.baseUrl 推导 workspace api/v1 */
  private resolveNativeBaseUrl(): string {
    const explicit = this.config.get<string>("ocr.qwen.baseUrl");
    if (explicit) {
      return explicit.replace(/\/$/, "");
    }

    const aliyunBaseUrl = this.config.get<string>("aliyun.baseUrl");
    const derived = aliyunBaseUrl ? deriveNativeBaseUrl(aliyunBaseUrl) : null;
    if (derived) {
      return derived;
    }

    throw new OcrProviderError("ocr_not_configured");
  }
}

function truncateJson(data: unknown, maxLen = RESPONSE_PREVIEW_MAX): string {
  try {
    const normalized = JSON.stringify(data).replace(/\s+/g, " ").trim();
    return normalized.length <= maxLen ? normalized : `${normalized.slice(0, maxLen)}…`;
  } catch {
    return "[unserializable response]";
  }
}
