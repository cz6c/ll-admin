import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";
import { deriveNativeBaseUrl, extractOcrResultFromResponse, parseQwenOcrResult } from "./qwen-ocr.adapter";
import type { OcrProvider, OcrProviderRecognizeResult } from "./ocr-provider.interface";

const DEFAULT_MODEL = "qwen3.5-ocr";
const DEFAULT_TASK = "advanced_recognition";
const MIN_PIXELS = 32 * 32 * 3;
const MAX_PIXELS = 32 * 32 * 8192;
const RESPONSE_PREVIEW_MAX = 1200;

/** DashScope 原生 multimodal-generation + ocr_options */
@Injectable()
export class QwenOcrProvider implements OcrProvider {
  readonly name = "qwen" as const;
  private readonly logger = new Logger(QwenOcrProvider.name);

  constructor(
    private readonly config: ConfigService,
    private readonly httpService: HttpService
  ) {}

  async recognize(buffer: Buffer, mimeType = "image/jpeg"): Promise<OcrProviderRecognizeResult> {
    const apiKey = this.config.get<string>("ocr.qwen.apiKey") || this.config.get<string>("aliyun.apiKey");
    if (!apiKey) {
      throw new Error("ocr_not_configured");
    }

    const baseUrl = this.resolveNativeBaseUrl();
    const model = this.config.get<string>("ocr.qwen.model") || DEFAULT_MODEL;
    const task = this.config.get<string>("ocr.qwen.task") || DEFAULT_TASK;
    const enableRotate = this.config.get<boolean>("ocr.qwen.enableRotate") ?? true;
    const timeout =
      this.config.get<number>("ocr.qwen.timeout") ??
      this.config.get<number>("ocr.timeout") ??
      this.config.get<number>("aliyun.timeout") ??
      120000;
    const imageDataUrl = `data:${mimeType};base64,${buffer.toString("base64")}`;

    this.logger.log(JSON.stringify({ event: "qwen_ocr_start", task, baseUrl, model, timeoutMs: timeout }));

    const startedAt = Date.now();

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
      const ms = Date.now() - startedAt;
      const responsePreview = truncateJson(data);

      if (remoteCode) {
        this.logger.log(
          JSON.stringify({
            event: "qwen_ocr_attempt",
            ms,
            ok: false,
            cellCount: 0,
            failReason: `remote_code:${remoteCode}${remoteMessage ? `:${remoteMessage}` : ""}`,
            responsePreview
          })
        );
        throw new Error(`qwen_ocr_${remoteCode}`);
      }

      if (!cells.length) {
        this.logger.log(
          JSON.stringify({
            event: "qwen_ocr_attempt",
            ms,
            ok: false,
            cellCount: 0,
            failReason: "no_cells",
            responsePreview
          })
        );
        throw new Error("qwen_ocr_empty");
      }

      this.logger.log(JSON.stringify({ event: "qwen_ocr_attempt", ms, ok: true, cellCount: cells.length }));

      return { cells, raw: data };
    } catch (error: unknown) {
      const err = error as { code?: string; message?: string; response?: { data?: unknown } };
      if (err?.code === "ECONNABORTED" || String(err?.message).includes("timeout")) {
        const ms = Date.now() - startedAt;
        this.logger.log(
          JSON.stringify({ event: "qwen_ocr_attempt", ms, ok: false, cellCount: 0, failReason: "ocr_timeout", timeoutMs: timeout })
        );
        throw new Error("ocr_timeout");
      }
      if (error instanceof Error && (error.message.startsWith("qwen_ocr_") || error.message.startsWith("ocr_"))) {
        throw error;
      }

      const remoteData = err?.response?.data as { code?: string; message?: string } | undefined;
      if (remoteData?.code) {
        throw new Error(`qwen_ocr_${remoteData.code}`);
      }
      const remoteMsg = remoteData?.message;
      throw new Error(remoteMsg ? `qwen_ocr_error:${remoteMsg}` : "qwen_ocr_error");
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

    throw new Error("ocr_not_configured");
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
