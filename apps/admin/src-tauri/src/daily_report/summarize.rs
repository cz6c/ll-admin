//! 模型总结调用
//! 职责：将扫描日志发给 OpenAI 兼容 Chat Completions，生成工作日报
//! 适用：已配置 API Key 且扫描日志中有提交时

use serde::Deserialize;
use serde_json::json;

use super::types::DailyReportSettings;
use crate::app_settings::AppSettings;

#[derive(Debug, Deserialize)]
struct ChatResponse {
  choices: Option<Vec<ChatChoice>>,
  error: Option<ChatErrorBody>,
}

#[derive(Debug, Deserialize)]
struct ChatChoice {
  message: Option<ChatMessage>,
}

#[derive(Debug, Deserialize)]
struct ChatMessage {
  content: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ChatErrorBody {
  message: Option<String>,
}

/// 总结所需配置：应用级模型接入 + 日报 Prompt 模板
struct SummarizeInput<'a> {
  model_base_url: &'a str,
  model_name: &'a str,
  prompt_template: &'a str,
}

impl<'a> SummarizeInput<'a> {
  fn from_parts(app: &'a AppSettings, daily: &'a DailyReportSettings) -> Self {
    Self {
      model_base_url: &app.model_base_url,
      model_name: &app.model_name,
      prompt_template: &daily.prompt_template,
    }
  }
}

/// 用扫描日志调模型总结
pub async fn summarize_scan_log(
  app_ai: &AppSettings,
  daily: &DailyReportSettings,
  api_key: &str,
  scan_log: &str,
) -> Result<String, String> {
  let cfg = SummarizeInput::from_parts(app_ai, daily);
  let user_content = cfg.prompt_template.replace("{{commits}}", scan_log);

  let url = chat_completions_url(cfg.model_base_url)?;
  let body = json!({
    "model": cfg.model_name,
    "messages": [
      {
        "role": "system",
        "content": "你是写个人工作日报的助手。严格按用户给出的格式与约束输出纯文本日报；只依据扫描日志中的提交，不编造会议、工时或未出现的事项。"
      },
      {
        "role": "user",
        "content": user_content
      }
    ],
    "temperature": 0.3
  });

  let client = reqwest::Client::builder()
    .timeout(std::time::Duration::from_secs(90))
    .build()
    .map_err(|e| format!("创建 HTTP 客户端失败: {e}"))?;

  let resp = client
    .post(&url)
    .bearer_auth(api_key)
    .header("Content-Type", "application/json")
    .json(&body)
    .send()
    .await
    .map_err(|e| format!("请求模型失败: {e}"))?;

  let status = resp.status();
  let text = resp
    .text()
    .await
    .map_err(|e| format!("读取模型响应失败: {e}"))?;

  let parsed: ChatResponse =
    serde_json::from_str(&text).map_err(|e| format!("解析模型响应失败: {e}; body={text}"))?;

  if let Some(err) = parsed.error {
    return Err(err.message.unwrap_or_else(|| format!("模型错误 HTTP {status}")));
  }
  if !status.is_success() {
    return Err(format!("模型 HTTP {status}: {text}"));
  }

  parsed
    .choices
    .and_then(|mut c| c.pop())
    .and_then(|c| c.message)
    .and_then(|m| m.content)
    .filter(|s| !s.trim().is_empty())
    .ok_or_else(|| "模型未返回有效内容".into())
}

fn chat_completions_url(base: &str) -> Result<String, String> {
  let base = base.trim().trim_end_matches('/');
  if base.is_empty() {
    return Err("模型 baseURL 为空".into());
  }
  if base.ends_with("/chat/completions") {
    Ok(base.to_string())
  } else {
    Ok(format!("{base}/chat/completions"))
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn url_appends_chat_completions() {
    assert_eq!(
      chat_completions_url("https://api.openai.com/v1").unwrap(),
      "https://api.openai.com/v1/chat/completions"
    );
  }
}
