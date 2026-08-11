<!--
  工作日报 · 历史
  职责：按日期浏览已生成日报只读详情
  主流程：列出日期 → 点选加载；空态引导去今日生成
-->
<script setup lang="ts">
import { getDailyReport, listDailyReports, type DailyReport } from "@/api/dailyReport";
import { isTauri } from "@/utils/tauri";
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
    ElMessage.error(e?.message || String(e));
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
    ElMessage.error(e?.message || String(e));
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
  <div class="app-page flex h-full min-h-0 flex-col gap-12px">
    <div class="flex items-center justify-between gap-12px">
      <div class="flex items-baseline gap-10px">
        <h2 class="m-0 text-18px font-600">历史日报</h2>
        <span class="text-13px text-[var(--el-text-color-secondary)]">共 {{ dates.length }} 天</span>
      </div>
      <el-button :loading="listLoading" @click="loadDates">刷新</el-button>
    </div>

    <div v-if="!listLoading && !dates.length" class="flex-1">
      <el-card shadow="never" class="card-rounded">
        <el-empty description="还没有历史日报">
          <template #description>
            <p class="m-0 text-13px text-[var(--el-text-color-secondary)]">生成过的日报会按日期出现在这里。</p>
          </template>
          <el-button type="primary" @click="goToday">去今日生成</el-button>
        </el-empty>
      </el-card>
    </div>

    <div v-else class="history-layout min-h-0 flex-1 gap-12px">
      <aside v-loading="listLoading" class="card-panel flex min-h-0 flex-col">
        <div class="border-b border-[var(--el-border-color-lighter)] px-14px py-12px text-13px font-600 text-[var(--el-text-color-regular)]">日期</div>
        <ul class="m-0 flex-1 list-none overflow-auto p-6px">
          <li
            v-for="d in dates"
            :key="d"
            class="radius-inner cursor-pointer px-12px py-8px text-13px text-[var(--el-text-color-regular)] transition-colors hover:bg-[var(--el-fill-color-light)]"
            :class="{
              'bg-[var(--el-color-primary-light-9)] font-600 text-[var(--el-color-primary)]': d === activeDate
            }"
            @click="selectDate(d)"
          >
            {{ d }}
          </li>
        </ul>
      </aside>

      <section v-loading="detailLoading" class="flex min-h-0 min-w-0 flex-col gap-12px overflow-auto">
        <el-empty v-if="!report && !detailLoading" description="请选择左侧日期" />
        <ReportDetailPanel v-else-if="report" :report="report" />
      </section>
    </div>
  </div>
</template>

<style scoped lang="scss">
.history-layout {
  display: grid;
  grid-template-columns: 200px minmax(0, 1fr);
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
