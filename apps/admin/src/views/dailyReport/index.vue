<!--
  工作日报 · 今日
  职责：展示当日总结与扫描日志；手动生成
  主流程：进入拉取 → 监听 finished → 操作按钮；AI 总结优先展示
-->
<script setup lang="ts">
import { listen } from "@tauri-apps/api/event";
import { formatToDate } from "@llcz/common";
import { getDailyReport, runDailyReport, type DailyReport } from "@/api/dailyReport";
import { isTauri } from "@/utils/tauri";
import { runResultMessage } from "./reportDisplay";
import ReportDetailPanel from "./ReportDetailPanel.vue";

defineOptions({ name: "DailyReportToday" });

const router = useRouter();

const loading = ref(false);
const running = ref(false);
const report = ref<DailyReport | null>(null);
/** 本地日历日，与 Rust chrono Local 对齐 */
const today = formatToDate();
const panelRef = ref<InstanceType<typeof ReportDetailPanel> | null>(null);

async function loadToday() {
  if (!isTauri()) return;
  loading.value = true;
  try {
    report.value = await getDailyReport(today);
  } catch (e: any) {
    ElMessage.error(e?.message || String(e));
  } finally {
    loading.value = false;
  }
}

/** 完整流水线 */
async function onRun() {
  running.value = true;
  try {
    report.value = await runDailyReport();
    const tip = runResultMessage(report.value);
    if (tip.type === "success") ElMessage.success(tip.message);
    else if (tip.type === "warning") ElMessage.warning(tip.message);
    else if (tip.type === "error") ElMessage.error(tip.message);
    else ElMessage.info(tip.message);
    await nextTick();
    panelRef.value?.scrollToSummary();
  } catch (e: any) {
    ElMessage.error(e?.message || String(e));
  } finally {
    running.value = false;
  }
}

function goSettings() {
  router.push("/daily-report/settings");
}

let unlistenFinished: (() => void) | undefined;

onMounted(async () => {
  await loadToday();
  if (!isTauri()) return;
  unlistenFinished = await listen<DailyReport>("daily-report:finished", event => {
    if (event.payload?.date === today) {
      report.value = event.payload;
    }
  });
});

onUnmounted(() => {
  unlistenFinished?.();
});
</script>

<template>
  <div v-loading="loading || running" class="app-page flex flex-col gap-12px" :element-loading-text="running ? '正在扫描并调用 AI…' : ''">
    <div class="flex flex-wrap items-center justify-between gap-12px">
      <div class="flex items-baseline gap-10px">
        <h2 class="m-0 text-18px font-600 text-[var(--el-text-color-primary)]">今日日报</h2>
        <span class="text-13px text-[var(--el-text-color-secondary)]">{{ today }}</span>
      </div>
      <div class="flex flex-wrap">
        <el-button type="primary" :loading="running" @click="onRun">立刻生成</el-button>
        <el-button :disabled="running" @click="loadToday">刷新</el-button>
      </div>
    </div>

    <el-card v-if="!report" shadow="never" class="empty-card card-rounded">
      <el-empty description="今日尚未生成日报">
        <template #description>
          <p class="m-0 mb-4px text-13px text-[var(--el-text-color-regular)]">点击「立刻生成」，或在计划时间到点后自动跑。</p>
          <p class="m-0 text-13px text-[var(--el-text-color-secondary)]">未配置工作区时请先到日报设置。</p>
        </template>
        <div class="mt-8px flex justify-center">
          <el-button type="primary" :loading="running" @click="onRun">立刻生成</el-button>
          <el-button @click="goSettings">去设置</el-button>
        </div>
      </el-empty>
    </el-card>

    <ReportDetailPanel v-else ref="panelRef" :report="report" />
  </div>
</template>

<style scoped lang="scss">
.empty-card {
  :deep(.el-empty) {
    padding: 48px 16px;
  }
}
</style>
