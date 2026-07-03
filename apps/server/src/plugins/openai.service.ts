import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom } from "rxjs";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
  cache_control?: { type: string };
}

interface OpenAIChatResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

type LlmProvider = "aliyun" | "zhipu";

/** OpenAI 兼容接口通用封装，业务 prompt 由调用方传入 */
@Injectable()
export class OpenAIService {
  constructor(
    private readonly config: ConfigService,
    private readonly httpService: HttpService
  ) {}

  /**
   * 调用 chat/completions，返回 assistant 文本内容。
   * 配置键：{provider}.apiKey / baseUrl / model / timeout
   */
  async chatCompletions(messages: ChatMessage[], provider: LlmProvider = "aliyun"): Promise<string> {
    const apiKey = this.config.get<string>(`${provider}.apiKey`);
    if (!apiKey) {
      throw new Error("openai_not_configured");
    }

    const baseUrl = this.config.get<string>(`${provider}.baseUrl`);
    const model = this.config.get<string>(`${provider}.model`);
    const timeout = this.config.get<number>(`${provider}.timeout`);

    try {
      const response = await firstValueFrom(
        this.httpService.post<OpenAIChatResponse>(
          `${baseUrl}/chat/completions`,
          { model, messages },
          {
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json"
            },
            timeout
          }
        )
      );

      const content = response.data?.choices?.[0]?.message?.content;
      if (!content?.trim()) {
        throw new Error("openai_empty_response");
      }

      return content.trim();
    } catch (error: unknown) {
      const err = error as { code?: string; message?: string };
      if (err?.code === "ECONNABORTED" || String(err?.message).includes("timeout")) {
        throw new Error("ai_timeout");
      }
      throw error;
    }
  }
}
