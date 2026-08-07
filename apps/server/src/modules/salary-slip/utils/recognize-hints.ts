/**
 * 识别结果整单级提示（倾斜 / 低置信度等）
 * 供 OCR/VLM 策略组装 SalarySlipResultDto.hints
 */

export interface RecognizeHint {
  code: string;
  message: string;
}

const HINT_TABLE_SKEWED: RecognizeHint = {
  code: "table_skewed",
  message: "检测到图片倾斜，已尝试校正，建议重新拍正后再识别以提高准确度"
};

const HINT_LOW_CONFIDENCE: RecognizeHint = {
  code: "low_confidence",
  message: "识别把握较低，请仔细核对各项金额后再保存"
};

/**
 * 按规则组装 hints；同 code 去重
 */
export function buildRecognizeHints(input: {
  skewed?: boolean;
  confidence?: "high" | "medium" | "low";
}): RecognizeHint[] {
  const hints: RecognizeHint[] = [];
  if (input.skewed) {
    hints.push(HINT_TABLE_SKEWED);
  }
  if (input.confidence === "low") {
    hints.push(HINT_LOW_CONFIDENCE);
  }
  return hints;
}

/** 倾斜时压低置信度上限：high → medium */
export function capConfidenceForSkew(
  confidence: "high" | "medium" | "low",
  skewed: boolean
): "high" | "medium" | "low" {
  if (!skewed) {
    return confidence;
  }
  if (confidence === "high") {
    return "medium";
  }
  return confidence;
}
