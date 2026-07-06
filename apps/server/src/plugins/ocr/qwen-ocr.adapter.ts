import type { OcrCell } from "../utils/ocr-layout";

interface QwenWordsInfo {
  text?: string;
  rotate_rect?: number[];
  location?: number[];
}

interface QwenOcrResult {
  words_info?: QwenWordsInfo[];
}

interface QwenMessageContentItem {
  ocr_result?: unknown;
  text?: string;
}

interface QwenChoice {
  message?: {
    content?: string | QwenMessageContentItem[];
  };
}

/** 从 compatible-mode baseUrl 推导 DashScope 原生 api/v1 baseUrl */
export function deriveNativeBaseUrl(baseUrl: string): string | null {
  const trimmed = baseUrl.replace(/\/$/, "");
  if (trimmed.endsWith("/compatible-mode/v1")) {
    return trimmed.replace(/\/compatible-mode\/v1$/, "/api/v1");
  }
  if (trimmed.endsWith("/api/v1")) {
    return trimmed;
  }
  return null;
}

/** 从 DashScope 原生响应中提取 ocr_result */
export function extractOcrResultFromResponse(data: unknown): unknown {
  if (!data || typeof data !== "object") {
    return undefined;
  }

  const record = data as {
    output?: { choices?: QwenChoice[] };
    code?: string;
  };

  if (record.code) {
    return undefined;
  }

  const content = record.output?.choices?.[0]?.message?.content;
  if (typeof content === "string" || !Array.isArray(content)) {
    return undefined;
  }

  return content.find(item => item?.ocr_result)?.ocr_result ?? content[0]?.ocr_result;
}

/** 从 Qwen advanced_recognition 的 ocr_result 解析为 OcrCell[] */
export function parseQwenOcrResult(ocrResult: unknown): OcrCell[] {
  if (!ocrResult || typeof ocrResult !== "object") {
    return [];
  }

  const wordsInfo = (ocrResult as QwenOcrResult).words_info;
  if (!Array.isArray(wordsInfo)) {
    return [];
  }

  return wordsInfo
    .map(word => {
      const text = word.text?.trim();
      if (!text) {
        return null;
      }

      const center = resolveCenter(word);
      if (!center) {
        return null;
      }

      return { text, cx: center.cx, cy: center.cy };
    })
    .filter((item): item is OcrCell => Boolean(item));
}

function resolveCenter(word: QwenWordsInfo): { cx: number; cy: number } | null {
  const rect = word.rotate_rect;
  if (Array.isArray(rect) && rect.length >= 2 && Number.isFinite(rect[0]) && Number.isFinite(rect[1])) {
    return { cx: rect[0], cy: rect[1] };
  }

  const location = word.location;
  if (Array.isArray(location) && location.length >= 8) {
    const xs = [location[0], location[2], location[4], location[6]];
    const ys = [location[1], location[3], location[5], location[7]];
    if (xs.every(Number.isFinite) && ys.every(Number.isFinite)) {
      return {
        cx: (Math.min(...xs) + Math.max(...xs)) / 2,
        cy: (Math.min(...ys) + Math.max(...ys)) / 2
      };
    }
  }

  return null;
}
