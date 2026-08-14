<!--
  工作日报 · 历史
  职责：按日期浏览已生成日报只读详情
  主流程：列出日期 → 点选加载；空态引导去今日生成
-->
<script setup lang="ts">
import { getDailyReport, listDailyReports, type DailyReport } from "@/api/dailyReport";
import { isTauri } from "@/utils/tauri";
import $feedback from "@/utils/feedback";
import ReportDetailPanel from "./ReportDetailPanel.vue";

defineOptions({ name: "DailyReportHistory" });

const router = useRouter();
const listLoading = ref(false);
const detailLoading = ref(false);
const dates = ref<string[]>([]);
const activeDate = ref("");
const report = ref<DailyReport | null>(null);

async function loadDates() {
  if (!isTauri()) return;
  listLoading.value = true;
  try {
    dates.value = await listDailyReports();
    if (dates.value.length && !activeDate.value) {
      await selectDate(dates.value[0]);
    } else if (!dates.value.length) {
      activeDate.value = "";
      report.value = null;
    }
  } catch (e: any) {
    $feedback.message.error(e?.message || String(e));
  } finally {
    listLoading.value = false;
  }
}

async function selectDate(date: string) {
  if (!date) return;
  activeDate.value = date;
  detailLoading.value = true;
  try {
    report.value = await getDailyReport(date);
  } catch (e: any) {
    $feedback.message.error(e?.message || String(e));
  } finally {
    detailLoading.value = false;
  }
}

function goToday() {
  router.push("/daily-report/today");
}

onMounted(loadDates);
</script>

<template>
  <div class="app-page flex h-full min-h-0 flex-col gap-16px">
    <div class="flex items-center justify-between gap-16px">
      <div class="flex items-baseline gap-8px">
        <h2 class="m-0 text-18px font-600 text-[var(--color-text)]">历史日报</h2>
        <span class="text-12px text-[var(--color-text-tertiary)]">共 {{ dates.length }} 天</span>
      </div>
      <a-button :loading="listLoading" @click="loadDates">刷新</a-button>
    </div>

    <div v-if="!listLoading && !dates.length" class="flex-1">
      <a-card class="card-rounded" :bordered="true">
        <a-empty description="还没有历史日报">
          <template #description>
            <p class="m-0 text-12px text-[var(--color-text-tertiary)]">生成过的日报会按日期出现在这里。</p>
          </template>
          <a-button type="primary" @click="goToday">去今日生成</a-button>
        </a-empty>
      </a-card>
    </div>

    <div v-else class="history-layout min-h-0 flex-1 gap-16px">
      <a-spin :spinning="listLoading" class="history-aside-spin">
        <aside class="card-panel flex min-h-0 flex-col">
          <div class="border-b border-[var(--border-color)] px-16px py-12px text-14px font-600 text-[var(--color-text-secondary)]">日期</div>
          <ul class="m-0 flex-1 list-none overflow-auto p-8px">
            <li
              v-for="d in dates"
              :key="d"
              class="radius-inner cursor-pointer px-8px py-8px text-14px text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--fill-color)]"
              :class="{
                'bg-[var(--color-primary-bg)] font-600 text-[var(--color-primary)]': d === activeDate
              }"
              @click="selectDate(d)"
            >
              {{ d }}
            </li>
          </ul>
        </aside>
      </a-spin>

      <a-spin :spinning="detailLoading" class="history-detail-spin min-h-0 min-w-0">
        <section class="flex min-h-0 min-w-0 flex-col gap-16px overflow-auto">
          <a-empty v-if="!report && !detailLoading" key="empty" description="请选择左侧日期" />
          <ReportDetailPanel v-else-if="report" :key="activeDate" :report="report" />
        </section>
      </a-spin>
    </div>
  </div>
</template>

<style scoped lang="scss">
.history-layout {
  display: grid;
  grid-template-columns: 200px minmax(0, 1fr);
}

.history-aside-spin,
.history-detail-spin {
  min-height: 0;
  height: 100%;
}

@media (max-width: 800px) {
  .history-layout {
    grid-template-columns: 1fr;

    :deep(aside) {
      max-height: 200px;
    }
  }
}
</style>
