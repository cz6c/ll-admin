<!--
  工作日报详情面板
  职责：元信息条 + AI 总结（若有）+ 扫描日志
  适用：今日页、历史页只读详情
-->
<script setup lang="ts">
import type { DailyReport } from "@/api/dailyReport";
import {
  formatReportTime,
  getScanLogText,
  hasIndependentAiSummary,
  REPORT_STATUS_LABEL,
  REPORT_STATUS_TAG,
  resolveSummarySource,
  SUMMARY_SOURCE_LABEL,
  SUMMARY_SOURCE_TAG
} from "./reportDisplay";

defineOptions({ name: "ReportDetailPanel" });

const props = defineProps<{
  report: DailyReport;
}>();

const summaryRef = ref<HTMLElement | null>(null);
const scanLogRef = ref<HTMLElement | null>(null);
const scanLogText = computed(() => getScanLogText(props.report));
const hasAiSummary = computed(() => hasIndependentAiSummary(props.report));
const statusType = computed(() => REPORT_STATUS_TAG[props.report.status] || "default");
const statusText = computed(() => REPORT_STATUS_LABEL[props.report.status] || props.report.status);
const summarySource = computed(() => resolveSummarySource(props.report));
const sourceType = computed(() => SUMMARY_SOURCE_TAG[summarySource.value]);
const sourceText = computed(() => SUMMARY_SOURCE_LABEL[summarySource.value]);

/** 供今日页生成后滚到总结区（有 AI 滚到总结，否则滚到扫描日志） */
function scrollToSummary(behavior: ScrollBehavior = "smooth") {
  const el = hasAiSummary.value ? summaryRef.value : scanLogRef.value;
  el?.scrollIntoView({ behavior, block: "start" });
}

defineExpose({ scrollToSummary });
</script>

<template>
  <div class="flex flex-col gap-16px">
    <div class="card-meta">
      <a-tag :color="statusType">{{ statusText }}</a-tag>
      <a-tag :color="sourceType">{{ sourceText }}</a-tag>
      <span class="text-[var(--color-text-secondary)]">提交 {{ report.rawCommits.length }}</span>
      <span v-if="report.modelName" class="text-[var(--color-text-tertiary)]">{{ report.modelName }}</span>
      <span class="text-[var(--color-text-tertiary)]">{{ formatReportTime(report.finishedAt) }}</span>
    </div>

    <section v-if="hasAiSummary" ref="summaryRef" class="card-section">
      <div class="mb-8px flex items-baseline gap-8px">
        <h3 class="m-0 text-16px font-600">AI 总结</h3>
      </div>
      <pre class="summary summary--primary">{{ report.summaryMarkdown }}</pre>
    </section>

    <section ref="scanLogRef" class="card-section">
      <div class="mb-8px flex items-baseline gap-8px">
        <h3 class="m-0 text-16px font-600">扫描日志</h3>
      </div>
      <pre class="summary">{{ scanLogText || "（无）" }}</pre>
    </section>
  </div>
</template>

<style scoped lang="scss">
.summary {
  margin: 0;
  padding: 12px 16px;
  white-space: pre-wrap;
  word-break: break-word;
  background: var(--fill-color);
  border-radius: 6px;
  font-family: inherit;
  line-height: 1.65;
  font-size: 14px;
  &--primary {
    background: var(--color-primary-bg);
    border: 1px solid color-mix(in srgb, var(--color-primary) 35%, white);
  }
}
</style>
