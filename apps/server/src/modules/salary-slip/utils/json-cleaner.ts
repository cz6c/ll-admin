/**
 * 清洗大模型返回的 JSON 字符串，去除 Markdown 包裹与注释。
 */
export function cleanJsonString(raw: string): string {
  let text = raw.trim();

  // 去除 ```json ... ``` 或 ``` ... ``` 包裹
  const fenceMatch = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenceMatch) {
    text = fenceMatch[1].trim();
  }

  // 去除单行注释 //
  text = text.replace(/\/\/.*$/gm, "");

  // 去除块注释 /* */
  text = text.replace(/\/\*[\s\S]*?\*\//g, "");

  return text.trim();
}

export function parseAiJson<T extends Record<string, unknown>>(raw: string): T {
  const cleaned = cleanJsonString(raw);
  return JSON.parse(cleaned) as T;
}
