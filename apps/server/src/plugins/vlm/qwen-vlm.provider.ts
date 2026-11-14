/**
 * 多模态 VLM：OpenAI 兼容 chat/completions + 图片，结构化抽取工资条明细
 * 配置：aliyun.vlm.*（百炼优先）+ zhipu.vlm.*（免费视觉兜底）
 * 模型链：额度用尽/过期/不可用时切下一档并粘性跳过；解析失败与超时不切
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

/** 未配 aliyun.vlm.models/model 时的默认百炼链（先烧短效） */
const DEFAULT_ALIYUN_MODELS = [
  "deepseek-v4.1-flash",
  "qwen3.8-omni-flash",
  "deepseek-v4.1-flash-1017",
  "kimi-k3.1-pro"
];
const DEFAULT_ZHIPU_MODEL = "glm-4.6v-flash";
const DEFAULT_ZHIPU_BASE_URL = "https://open.bigmodel.cn/api/paas/v4";
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
  code?: string | number;
  message?: string;
  error?: { code?: string | number; message?: string };
}

/** 单档调用端点（同协议、不同厂商 Key/Base） */
interface VlmEndpoint {
  vendor: "aliyun" | "zhipu";
  model: string;
  apiKey: string;
  baseUrl: string;
  timeoutMs: number;
  /** 智谱默认关 thinking，避免推理噪音污染 JSON */
  disableThinking?: boolean;
}

@Injectable()
export class QwenVlmProvider implements VlmProvider {
  readonly name = "qwen" as const;

  /**
   * 进程内粘性游标：额度/过期类失败后从下一档起跳，避免每请求反复撞已失效模型
   * 解析失败/超时等不推进，仍固定打当前档
   */
  private modelCursor = 0;

  constructor(
    private readonly config: ConfigService,
    private readonly httpService: HttpService
  ) {}

  /**
   * 上传工资条图，要求模型返回 line_items JSON
   * @note 仅额度用尽、试用过期、模型无权限/不存在时切下一档；空结果与解析错误不切换
   */
  async extractSalarySlip(buffer: Buffer, mimeType = "image/jpeg"): Promise<VlmProviderExtractResult> {
    const endpoints = this.resolveEndpoints();
    if (!endpoints.length) {
      throw new VlmProviderError("vlm_not_configured");
    }

    const imageDataUrl = `data:${mimeType};base64,${buffer.toString("base64")}`;

    if (this.modelCursor >= endpoints.length) {
      this.modelCursor = 0;
    }

    const triedModels: string[] = [];
    let lastError: VlmProviderError | undefined;

    for (let index = this.modelCursor; index < endpoints.length; index++) {
      const endpoint = endpoints[index];
      const label = `${endpoint.vendor}:${endpoint.model}`;
      triedModels.push(label);

      try {
        const extracted = await this.extractWithModel({
          ...endpoint,
          imageDataUrl
        });
        this.modelCursor = index;
        return {
          ...extracted,
          meta: {
            ...extracted.meta,
            triedModels: [...triedModels]
          }
        };
      } catch (error: unknown) {
        const wrapped = this.toVlmProviderError(error, {
          vendor: endpoint.vendor,
          model: endpoint.model,
          baseUrl: endpoint.baseUrl,
          timeoutMs: endpoint.timeoutMs
        });
        lastError = wrapped;

        const canFallback = isQuotaOrModelUnavailable(wrapped) && index < endpoints.length - 1;
        if (canFallback) {
          this.modelCursor = index + 1;
          continue;
        }

        throw new VlmProviderError(wrapped.message, {
          ...wrapped.meta,
          triedModels: [...triedModels]
        });
      }
    }

    throw new VlmProviderError(lastError?.message ?? "vlm_error", {
      ...lastError?.meta,
      triedModels
    });
  }

  /**
   * 组装调用链：百炼 models → 智谱 glm-4.6v-flash（配了 apiKey 才追加）
   */
  private resolveEndpoints(): VlmEndpoint[] {
    const endpoints: VlmEndpoint[] = [];
    const aliyunTimeout =
      this.config.get<number>("aliyun.vlm.timeout") ?? this.config.get<number>("aliyun.timeout") ?? 120000;

    const aliyunApiKey = this.config.get<string>("aliyun.vlm.apiKey") || this.config.get<string>("aliyun.apiKey");
    const aliyunBaseUrl = (
      this.config.get<string>("aliyun.vlm.baseUrl") ||
      this.config.get<string>("aliyun.baseUrl") ||
      ""
    ).replace(/\/$/, "");

    if (aliyunApiKey && aliyunBaseUrl) {
      for (const model of this.resolveAliyunModels()) {
        endpoints.push({
          vendor: "aliyun",
          model,
          apiKey: aliyunApiKey,
          baseUrl: aliyunBaseUrl,
          timeoutMs: aliyunTimeout
        });
      }
    }

    const zhipuApiKey = this.config.get<string>("zhipu.vlm.apiKey") || this.config.get<string>("zhipu.apiKey");
    if (zhipuApiKey) {
      const zhipuBaseUrl = (
        this.config.get<string>("zhipu.vlm.baseUrl") ||
        this.config.get<string>("zhipu.baseUrl") ||
        DEFAULT_ZHIPU_BASE_URL
      ).replace(/\/$/, "");
      const zhipuModel = this.config.get<string>("zhipu.vlm.model")?.trim() || DEFAULT_ZHIPU_MODEL;
      const zhipuTimeout =
        this.config.get<number>("zhipu.vlm.timeout") ??
        this.config.get<number>("zhipu.timeout") ??
        aliyunTimeout;

      endpoints.push({
        vendor: "zhipu",
        model: zhipuModel,
        apiKey: zhipuApiKey,
        baseUrl: zhipuBaseUrl,
        timeoutMs: zhipuTimeout,
        disableThinking: true
      });
    }

    return endpoints;
  }

  /** 百炼模型列表：优先 models；否则单 model；再否则默认长效链 */
  private resolveAliyunModels(): string[] {
    const configured = this.config.get<unknown>("aliyun.vlm.models");
    if (Array.isArray(configured)) {
      const list = configured.map(item => String(item ?? "").trim()).filter(Boolean);
      if (list.length) {
        return dedupeModels(list);
      }
    }

    const single = this.config.get<string>("aliyun.vlm.model")?.trim();
    if (single) {
      return [single];
    }

    return [...DEFAULT_ALIYUN_MODELS];
  }

  /** 单档一次 chat/completions 抽取 */
  private async extractWithModel(params: VlmEndpoint & { imageDataUrl: string }): Promise<VlmProviderExtractResult> {
    const requestMeta: VlmProviderMeta = {
      vendor: params.vendor,
      model: params.model,
      baseUrl: params.baseUrl,
      timeoutMs: params.timeoutMs
    };

    const data = await this.callChatCompletions(params);

    const remoteCode = data.code ?? data.error?.code;
    const remoteMessage = data.message || data.error?.message;
    if (remoteCode != null && remoteCode !== 0 && String(remoteCode) !== "200") {
      throw new VlmProviderError(`vlm_remote_${remoteCode}`, {
        ...requestMeta,
        failReason: `remote_code:${remoteCode}${remoteMessage ? `:${remoteMessage}` : ""}`,
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
  }

  private toVlmProviderError(
    error: unknown,
    requestMeta: Pick<VlmProviderMeta, "vendor" | "model" | "baseUrl" | "timeoutMs">
  ): VlmProviderError {
    if (error instanceof VlmProviderError) {
      return error;
    }
    const err = error as { code?: string; message?: string; response?: { data?: unknown; status?: number } };
    if (err?.code === "ECONNABORTED" || String(err?.message).includes("timeout")) {
      return new VlmProviderError("vlm_timeout", {
        ...requestMeta,
        failReason: "vlm_timeout"
      });
    }
    const remoteData = err?.response?.data as
      | { code?: string | number; message?: string; error?: { code?: string | number; message?: string } }
      | undefined;
    const remoteCode = remoteData?.code ?? remoteData?.error?.code;
    const remoteMessage = remoteData?.message || remoteData?.error?.message;
    const statusHint = err?.response?.status ? `http_${err.response.status}` : undefined;
    return new VlmProviderError(remoteMessage ? `vlm_error:${remoteMessage}` : "vlm_error", {
      ...requestMeta,
      failReason: remoteCode != null ? `remote_code:${remoteCode}` : statusHint ? statusHint : "vlm_error",
      responsePreview: remoteData ? truncateJson(remoteData) : undefined
    });
  }

  private async callChatCompletions(params: VlmEndpoint & { imageDataUrl: string }): Promise<ChatCompletionsResponse> {
    const body: Record<string, unknown> = {
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
    };
    // 智谱默认常开思考；抽结构化 JSON 时关掉，降低延迟与杂质
    if (params.disableThinking) {
      body.thinking = { type: "disabled" };
    }

    const response = await firstValueFrom(
      this.httpService.post<ChatCompletionsResponse>(`${params.baseUrl}/chat/completions`, body, {
        headers: {
          Authorization: `Bearer ${params.apiKey}`,
          "Content-Type": "application/json"
        },
        timeout: params.timeoutMs
      })
    );
    return response.data;
  }
}

/**
 * 仅额度/试用过期/模型无权限或不存在时允许切链
 * 空明细、解析失败、超时不匹配，避免同图连打多档浪费额度
 */
function isQuotaOrModelUnavailable(error: VlmProviderError): boolean {
  if (error.message === "vlm_empty" || error.message === "vlm_parse_error" || error.message === "vlm_timeout") {
    return false;
  }

  const haystack = [error.message, error.meta?.failReason, error.meta?.responsePreview]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return [
    /quota/,
    /free.?tier/,
    /allocationquota/,
    /insufficient/,
    /arrearage/,
    /balance/,
    /exhausted/,
    /overdue/,
    /access.?denied/,
    /permissiondenied/,
    /model.?not.?found/,
    /model.?not.?exist/,
    /invalid.?model/,
    /unavailable/,
    /does.?not.?exist/,
    /not.?authorized/,
    /http_403/,
    /http_401/,
    /http_429/,
    /rate.?limit/,
    /1302/,
    /1113/,
    /额度/,
    /已过期/,
    /欠费/,
    /没有权限/,
    /无权限/,
    /不存在/,
    /已下架/,
    /试用/
  ].some(pattern => pattern.test(haystack));
}

function dedupeModels(models: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const model of models) {
    if (seen.has(model)) {
      continue;
    }
    seen.add(model);
    result.push(model);
  }
  return result;
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
