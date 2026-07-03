import type { SalarySlipTemplate } from "./templates";

export const SALARY_SLIP_SYSTEM_PROMPT = `你是一个专业的财务数据提取助手，专门解析 OCR 识别后的工资条文本。

【布局说明】
文本可能为以下任一布局（或混合）：
- 宽表：按「第N行」给出，单元格以制表符分隔
- 键值对：每行「项目名称 + 金额」
- 分区块：收入区、扣款区、汇总区分段展示
逐项抄录可见金额，小计/合计行保留原文键名，勿遗漏、勿合并到其他项。

【字段分类规则】
1. line_items：提取工资条上所有可见金额项，键名使用原文项目名称（可规范化同义词）

【输出格式】
仅返回 JSON，不要 Markdown 代码块：
{
  "line_items": { "项目名称": 数字或null },
}

【注意】
- 缺少的字段填 null，禁止编造
- 金额保留两位小数`;

export const SALARY_JSON_REPAIR_PROMPT = `上一次返回的内容无法解析为 JSON。请仅输出一个合法 JSON 对象，不要 Markdown 代码块、不要注释、不要额外说明。字段结构与工资条提取要求一致。`;

export const TEMPLATE_CLASSIFY_SYSTEM_PROMPT = `你是工资条版式分类助手。根据 OCR 文本判断最匹配的类型。
仅返回 JSON：{"template_id":"wide_table|key_value|section_block|generic","reason":"一句话"}
若无法判断则 template_id 为 generic。`;

export function buildSalarySlipSystemPrompt(template?: SalarySlipTemplate): string {
  if (!template?.promptSnippet) {
    return SALARY_SLIP_SYSTEM_PROMPT;
  }
  return `${SALARY_SLIP_SYSTEM_PROMPT}\n\n【当前模板：${template.name}】\n${template.promptSnippet}`;
}

export function buildSalarySlipUserPrompt(ocrText: string): string {
  return `请从以下 OCR 文本中提取工资条全部金额明细（line_items）：\n\n${ocrText}`;
}

export function buildJsonRepairUserPrompt(invalidRaw: string): string {
  return `以下是需要修复为合法 JSON 的内容：\n\n${invalidRaw}`;
}

export function buildTemplateClassifyUserPrompt(ocrText: string): string {
  const preview = ocrText.length > 2000 ? `${ocrText.slice(0, 2000)}...` : ocrText;
  return `请判断工资条版式类型：\n\n${preview}`;
}
