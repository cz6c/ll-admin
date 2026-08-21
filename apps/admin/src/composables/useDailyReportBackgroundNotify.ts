/**
 * 工作日报后台提示（成功 / 告警 / 信息）
 * 职责：监听 Rust finished / run-error；按 CS 统一门控在 OS / message / 页内之间分流
 * 适用：App.vue CS 模式挂载
 */

import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  DAILY_REPORT_FINISHED_EVENT,
  DAILY_REPORT_RUN_ERROR_EVENT,
  type DailyReport,
  type DailyReportRunErrorPayload
} from "@/api/dailyReport";
import { runResultMessage } from "@/views/dailyReport/reportDisplay";
import { isTauri } from "@/utils/tauri";
import { deliverCsNotify, type CsNotifyKind, type CsNotifyPayload } from "@/utils/csSystemNotify";

const ATTENTION_PATH = "/daily-report/today";

function notifyFromReport(report: DailyReport): { payload: CsNotifyPayload; kind: CsNotifyKind } {
  const tip = runResultMessage(report);
  const kind: CsNotifyKind =
    tip.type === "success" ? "success" : tip.type === "error" ? "error" : "info";
  const title = report.status === "failed" ? "工作日报生成失败" : "今日工作日报已生成";
  return { payload: { title, body: tip.message }, kind };
}

function notifyFromRunError(payload: DailyReportRunErrorPayload): {
  payload: CsNotifyPayload;
  kind: CsNotifyKind;
} {
  return {
    kind: "error",
    payload: {
      title: "工作日报生成失败",
      body: `${payload.date}: ${payload.error}`
    }
  };
}

/**
 * 挂载工作日报全局提示：finished / run-error 事件
 */
export function useDailyReportBackgroundNotify() {
  const router = useRouter();
  let unlistenFinished: (() => void) | undefined;
  let unlistenRunError: (() => void) | undefined;
  let lastNotifyKey = "";

  async function deliver(payload: CsNotifyPayload, kind: CsNotifyKind, notifyKey: string) {
    if (lastNotifyKey === notifyKey) return;
    const focused = await getCurrentWindow().isFocused();
    const currentPath = router.currentRoute.value.path;
    await deliverCsNotify({ windowFocused: focused, currentPath, attentionPath: ATTENTION_PATH }, payload, kind);
    lastNotifyKey = notifyKey;
  }

  onMounted(async () => {
    if (!isTauri()) return;

    unlistenFinished = await listen<DailyReport>(DAILY_REPORT_FINISHED_EVENT, event => {
      const report = event.payload;
      if (!report) return;
      const { payload, kind } = notifyFromReport(report);
      void deliver(payload, kind, `${report.date}:finished:${report.finishedAt}:${report.status}`);
    });

    unlistenRunError = await listen<DailyReportRunErrorPayload>(DAILY_REPORT_RUN_ERROR_EVENT, event => {
      const detail = event.payload;
      if (!detail) return;
      const { payload, kind } = notifyFromRunError(detail);
      void deliver(payload, kind, `${detail.date}:run-error:${detail.error}`);
    });
  });

  onBeforeUnmount(() => {
    unlistenFinished?.();
    unlistenRunError?.();
  });
}
