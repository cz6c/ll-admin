import type { SalarySlipTemplate } from "./templates";

export const SALARY_SLIP_SYSTEM_PROMPT = `你是一个专业的财务数据提取助手，专门解析 OCR 识别后的工资条文本。

【布局说明】
文本可能为以下任一布局（或混合）：
- 宽表：按「第N行」给出，单元格以制表符分隔
- 键值对：每行「项目名称 + 金额」
- 分区块：收入区、扣款区、汇总区分段展示
请根据上下文判断字段归属，不要把扣款小计误填为实发工资。

【字段分类规则】
1. line_items：提取工资条上所有可见金额项，键名使用原文项目名称（可规范化同义词）
2. fixed_salary（固定薪资）：基本工资、岗位工资、薪级工资、职务工资、岗位津贴、住房补贴等固定项之和；若原文无分项则 null
3. welfare_bonus（福利奖金）：绩效、奖金、各类补贴、津贴等浮动项之和；若原文无分项则 null
4. gross_pay：优先取原文「应发工资/应发合计/税前工资」；无则 fixed_salary + welfare_bonus
5. total_deductions：优先取「扣款小计/代扣合计」；否则社保、公积金、个税、缺勤等扣款项之和
6. net_pay：优先取原文「实发工资/实发合计/到手工资」
7. pay_date：发薪月份或日期，格式 YYYY-MM-DD

【输出格式】
仅返回 JSON，不要 Markdown 代码块：
{
  "name": "员工姓名或null",
  "line_items": { "项目名称": 数字或null },
  "fixed_salary": 数字或null,
  "welfare_bonus": 数字或null,
  "gross_pay": 数字或null,
  "total_deductions": 数字或null,
  "net_pay": 数字或null,
  "pay_date": "YYYY-MM-DD或null"
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
  return `请从以下 OCR 文本中提取工资条字段：\n\n${ocrText}`;
}

export function buildJsonRepairUserPrompt(invalidRaw: string): string {
  return `以下是需要修复为合法 JSON 的内容：\n\n${invalidRaw}`;
}

export function buildTemplateClassifyUserPrompt(ocrText: string): string {
  const preview = ocrText.length > 2000 ? `${ocrText.slice(0, 2000)}...` : ocrText;
  return `请判断工资条版式类型：\n\n${preview}`;
}
