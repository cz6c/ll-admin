/**
 * Qwen 多模态 VLM：兼容模式 chat/completions + 图片，结构化抽取工资条明细
 * 配置：aliyun.vlm.*，apiKey/baseUrl 可回退 aliyun.*
 */
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";
import {
  VlmProviderError,
  type VlmConfidence,
  type VlmLineItem,
  type VlmProvider,
  type VlmProviderExtractResult,
  type VlmProviderMeta
} from "./vlm-provider.interface";

const DEFAULT_MODEL = "qwen3-vl-plus";
const RESPONSE_PREVIEW_MAX = 1200;

const EXTRACT_SYSTEM_PROMPT = `你是工资条识别助手。根据图片提取薪资明细，只输出 JSON，不要 markdown。
规则：
1. 只提取「项目名-金额」行；金额保留两位小数字符串，空为 "-"
2. 个人社保/公积金合计优先，排除公司/单位/企业/基数/补贴行
3. confidence 为整单 high|medium|low
4. 单项 confidence 为 0~1；不确定时 warning 写中文提示
输出形状：
{"line_items":[{"key":"应发工资","value":"12000.00","confidence":0.9,"warning":""}],"confidence":"medium"}`;

interface ChatCompletionsResponse {
  choices?: Array<{
    message?: { content?: string | Array<{ type?: string; text?: string }> };
  }>;
  code?: string;
  message?: string;
}

@Injectable()
export class QwenVlmProvider implements VlmProvider {
  readonly name = "qwen" as const;

  constructor(
    private readonly config: ConfigService,
    private readonly httpService: HttpService
  ) {}

  /**
   * 上传工资条图，要求模型返回 line_items JSON
   */
  async extractSalarySlip(buffer: Buffer, mimeType = "image/jpeg"): Promise<VlmProviderExtractResult> {
    const apiKey = this.config.get<string>("aliyun.vlm.apiKey") || this.config.get<string>("aliyun.apiKey");
    if (!apiKey) {
      throw new VlmProviderError("vlm_not_configured");
    }

    const baseUrl = (this.config.get<string>("aliyun.vlm.baseUrl") || this.config.get<string>("aliyun.baseUrl") || "").replace(/\/$/, "");
    if (!baseUrl) {
      throw new VlmProviderError("vlm_not_configured");
    }

    const model = this.config.get<string>("aliyun.vlm.model") || DEFAULT_MODEL;
    const timeout = this.config.get<number>("aliyun.vlm.timeout") ?? this.config.get<number>("aliyun.timeout") ?? 120000;
    const imageDataUrl = `data:${mimeType};base64,${buffer.toString("base64")}`;
    const requestMeta: VlmProviderMeta = { model, baseUrl, timeoutMs: timeout };

    try {
      const data = await this.callChatCompletions({
        apiKey,
        baseUrl,
        model,
        timeout,
        imageDataUrl
      });

      const remoteCode = data.code;
      if (remoteCode) {
        throw new VlmProviderError(`vlm_remote_${remoteCode}`, {
          ...requestMeta,
          failReason: `remote_code:${remoteCode}${data.message ? `:${data.message}` : ""}`,
          responsePreview: truncateJson(data)
        });
      }

      const content = normalizeAssistantContent(data.choices?.[0]?.message?.content);
      if (!content) {
        throw new VlmProviderError("vlm_empty", {
          ...requestMeta,
          failReason: "empty_content",
          responsePreview: truncateJson(data)
        });
      }

      const parsed = parseVlmJson(content);
      if (!parsed.line_items.length) {
        throw new VlmProviderError("vlm_empty", {
          ...requestMeta,
          failReason: "no_line_items",
          responsePreview: truncateText(content)
        });
      }

      return {
        line_items: parsed.line_items,
        confidence: parsed.confidence,
        raw: data,
        meta: requestMeta
      };
    } catch (error: unknown) {
      if (error instanceof VlmProviderError) {
        throw error;
      }
      const err = error as { code?: string; message?: string; response?: { data?: unknown } };
      if (err?.code === "ECONNABORTED" || String(err?.message).includes("timeout")) {
        throw new VlmProviderError("vlm_timeout", {
          ...requestMeta,
          failReason: "vlm_timeout"
        });
      }
      const remoteData = err?.response?.data as { code?: string; message?: string } | undefined;
      throw new VlmProviderError(remoteData?.message ? `vlm_error:${remoteData.message}` : "vlm_error", {
        ...requestMeta,
        failReason: remoteData?.code ? `remote_code:${remoteData.code}` : "vlm_error",
        responsePreview: remoteData ? truncateJson(remoteData) : undefined
      });
    }
  }

  private async callChatCompletions(params: {
    apiKey: string;
    baseUrl: string;
    model: string;
    timeout: number;
    imageDataUrl: string;
  }): Promise<ChatCompletionsResponse> {
    const response = await firstValueFrom(
      this.httpService.post<ChatCompletionsResponse>(
        `${params.baseUrl}/chat/completions`,
        {
          model: params.model,
          messages: [
            { role: "system", content: EXTRACT_SYSTEM_PROMPT },
            {
              role: "user",
              content: [
                { type: "image_url", image_url: { url: params.imageDataUrl } },
                { type: "text", text: "请识别这张工资条并按约定输出 JSON。" }
              ]
            }
          ]
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
}

function normalizeAssistantContent(content: string | Array<{ type?: string; text?: string }> | undefined): string {
  if (!content) {
    return "";
  }
  if (typeof content === "string") {
    return content.trim();
  }
  return content
    .map(part => (part.type === "text" || !part.type ? part.text || "" : ""))
    .join("")
    .trim();
}

function parseVlmJson(content: string): { line_items: VlmLineItem[]; confidence: VlmConfidence } {
  const jsonText = extractJsonObject(content);
  let data: unknown;
  try {
    data = JSON.parse(jsonText);
  } catch {
    throw new VlmProviderError("vlm_parse_error", { failReason: "invalid_json", responsePreview: truncateText(content) });
  }

  const record = data as { line_items?: unknown; confidence?: unknown };
  if (!Array.isArray(record.line_items)) {
    throw new VlmProviderError("vlm_parse_error", { failReason: "missing_line_items", responsePreview: truncateText(content) });
  }

  const line_items: VlmLineItem[] = record.line_items.map(item => normalizeLineItem(item));
  const confidence = normalizeConfidence(record.confidence);
  return { line_items, confidence };
}

function normalizeLineItem(item: unknown): VlmLineItem {
  const row = (item || {}) as { key?: unknown; value?: unknown; confidence?: unknown; warning?: unknown };
  const confidenceRaw = Number(row.confidence);
  return {
    key: String(row.key ?? "").trim(),
    value: formatAmountValue(String(row.value ?? "").trim()),
    confidence: Number.isFinite(confidenceRaw) ? Math.max(0, Math.min(1, confidenceRaw)) : 0.5,
    warning: String(row.warning ?? "").trim()
  };
}

function formatAmountValue(value: string): string {
  if (!value || value === "-") {
    return "-";
  }
  const normalized = value.replace(/,/g, "").replace(/元/g, "").trim();
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) {
    return value;
  }
  const num = Number(normalized);
  if (!Number.isFinite(num)) {
    return value;
  }
  return (Math.round(num * 100) / 100).toFixed(2);
}

function normalizeConfidence(value: unknown): VlmConfidence {
  if (value === "high" || value === "medium" || value === "low") {
    return value;
  }
  return "medium";
}

function extractJsonObject(content: string): string {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return content.slice(start, end + 1);
  }
  return content.trim();
}

function truncateJson(data: unknown, maxLen = RESPONSE_PREVIEW_MAX): string {
  try {
    const normalized = JSON.stringify(data).replace(/\s+/g, " ").trim();
    return normalized.length <= maxLen ? normalized : `${normalized.slice(0, maxLen)}…`;
  } catch {
    return "[unserializable response]";
  }
}

function truncateText(text: string, maxLen = RESPONSE_PREVIEW_MAX): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length <= maxLen ? normalized : `${normalized.slice(0, maxLen)}…`;
}
