export interface SalarySlipTemplate {
  id: string;
  name: string;
  matchKeywords: string[];
  /** 追加到 system prompt 的模板专属说明 */
  promptSnippet: string;
}

export const SALARY_SLIP_TEMPLATES: SalarySlipTemplate[] = [
  {
    id: "wide_table",
    name: "横向宽表",
    matchKeywords: ["应发工资", "实发工资", "基本工资", "岗位工资"],
    promptSnippet: "本工资条为横向宽表：表头与数据可能分列对齐，按列对齐抄录，勿漏列、勿把表头当金额。"
  },
  {
    id: "key_value",
    name: "纵向键值对",
    matchKeywords: ["固定工资", "浮动工资", "代扣代缴"],
    promptSnippet: "本工资条为纵向键值对：每行通常为「项目名称 + 金额」，请逐行提取。"
  },
  {
    id: "section_block",
    name: "分区块",
    matchKeywords: ["收入合计", "扣款合计", "应发项", "扣款项"],
    promptSnippet: "本工资条按收入区/扣款区分块展示，按区块逐行抄录 line_items。"
  }
];

export const DEFAULT_TEMPLATE_ID = "generic";

/** 关键词匹配模板，返回得分最高者；无匹配返回 null */
export function matchTemplateByKeywords(ocrText: string, templates: SalarySlipTemplate[] = SALARY_SLIP_TEMPLATES): SalarySlipTemplate | null {
  const normalized = ocrText.replace(/\s+/g, "");
  let best: { template: SalarySlipTemplate; score: number } | null = null;

  for (const template of templates) {
    const score = template.matchKeywords.filter(kw => normalized.includes(kw.replace(/\s+/g, ""))).length;
    if (score > 0 && (!best || score > best.score)) {
      best = { template, score };
    }
  }

  return best?.template ?? null;
}

export function getTemplateById(id: string): SalarySlipTemplate | undefined {
  if (id === DEFAULT_TEMPLATE_ID) {
    return undefined;
  }
  return SALARY_SLIP_TEMPLATES.find(t => t.id === id);
}
