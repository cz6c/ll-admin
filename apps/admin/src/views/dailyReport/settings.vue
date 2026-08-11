<!--
  工作日报 · 设置
  职责：工作区、计划时间（星期胶囊 + 大小周）、Prompt 模板
  主流程：拉取 → 编辑 → 保存；分区布局 + 底栏保存
-->
<script setup lang="ts">
import { open } from "@tauri-apps/plugin-dialog";
import {
  getDailyReportSettings,
  getDefaultDailyReportPrompt,
  saveDailyReportSettings,
  type BiweeklyAnchorKind,
  type DailyReportSettings
} from "@/api/dailyReport";
import CsSaveBar from "@/components/CsSaveBar/index.vue";
import { isTauri } from "@/utils/tauri";

defineOptions({ name: "DailyReportSettings" });

const WEEKDAY_OPTIONS = [
  { value: 1, label: "周一" },
  { value: 2, label: "周二" },
  { value: 3, label: "周三" },
  { value: 4, label: "周四" },
  { value: 5, label: "周五" },
  { value: 6, label: "周六" },
  { value: 7, label: "周日" }
] as const;

/** 大小周对应默认触发日：大周一～六，小周一～五 */
const BIWEEKLY_WORKDAYS: Record<BiweeklyAnchorKind, number[]> = {
  big: [1, 2, 3, 4, 5, 6],
  small: [1, 2, 3, 4, 5]
};

const loading = ref(false);
const saving = ref(false);
const excludeText = ref("");
const skipBiweeklyDaySync = ref(true);

const form = reactive<DailyReportSettings>({
  workspaceRoot: "",
  authorEmail: "",
  authorName: "",
  scanDepth: 0,
  excludeDirNames: [],
  scheduleEnabled: false,
  scheduleTime: "19:00",
  scheduleDays: [1, 2, 3, 4, 5],
  scheduleBiweeklyEnabled: false,
  scheduleBiweeklyAnchorMonday: "",
  scheduleBiweeklyAnchorKind: "big",
  modelBaseUrl: "https://api.openai.com/v1",
  modelName: "gpt-4o-mini",
  promptTemplate: "",
  callAiWhenEmpty: false,
  minimizeToTrayOnClose: true,
  autostart: false
});

const workspaceMissing = computed(() => !form.workspaceRoot?.trim());

function applyBiweeklyScheduleDays(kind: BiweeklyAnchorKind) {
  form.scheduleDays = [...BIWEEKLY_WORKDAYS[kind]];
}

watch(
  () => form.scheduleBiweeklyAnchorKind,
  kind => {
    if (skipBiweeklyDaySync.value || !form.scheduleBiweeklyEnabled) return;
    applyBiweeklyScheduleDays(kind);
  }
);

watch(
  () => form.scheduleBiweeklyEnabled,
  enabled => {
    if (skipBiweeklyDaySync.value || !enabled) return;
    applyBiweeklyScheduleDays(form.scheduleBiweeklyAnchorKind);
  }
);

function toggleScheduleDay(day: number) {
  if (form.scheduleBiweeklyEnabled) return;
  const idx = form.scheduleDays.indexOf(day);
  if (idx >= 0) {
    form.scheduleDays.splice(idx, 1);
  } else {
    form.scheduleDays.push(day);
    form.scheduleDays.sort((a, b) => a - b);
  }
}

function isDaySelected(day: number) {
  return form.scheduleDays.includes(day);
}

async function load() {
  if (!isTauri()) return;
  loading.value = true;
  skipBiweeklyDaySync.value = true;
  try {
    const s = await getDailyReportSettings();
    Object.assign(form, s);
    form.authorEmail = "";
    form.authorName = "";
    form.scanDepth = 0;
    if (!form.scheduleDays?.length) {
      form.scheduleDays = [1, 2, 3, 4, 5];
    }
    excludeText.value = (s.excludeDirNames || []).join("\n");
  } catch (e: any) {
    ElMessage.error(e?.message || String(e));
  } finally {
    loading.value = false;
    skipBiweeklyDaySync.value = false;
  }
}

async function pickWorkspace() {
  const selected = await open({
    directory: true,
    multiple: false,
    title: "选择工作区根目录"
  });
  if (typeof selected === "string" && selected) {
    form.workspaceRoot = selected;
  }
}

async function onSave() {
  if (form.scheduleEnabled && !form.scheduleBiweeklyEnabled && form.scheduleDays.length === 0) {
    ElMessage.warning("请至少选择一天作为计划触发日");
    return;
  }
  if (form.scheduleBiweeklyEnabled) {
    applyBiweeklyScheduleDays(form.scheduleBiweeklyAnchorKind);
  }
  saving.value = true;
  try {
    form.excludeDirNames = excludeText.value
      .split(/\r?\n/)
      .map(s => s.trim())
      .filter(Boolean);
    form.authorEmail = "";
    form.authorName = "";
    form.scanDepth = 0;
    await saveDailyReportSettings({ ...form });
    await load();
    ElMessage.success("已保存");
  } catch (e: any) {
    ElMessage.error(e?.message || String(e));
  } finally {
    saving.value = false;
  }
}

/** 用内置默认模板覆盖当前编辑区（需再点保存才落盘） */
async function restoreDefaultPrompt() {
  if (!isTauri()) return;
  try {
    form.promptTemplate = await getDefaultDailyReportPrompt();
    ElMessage.success("已填入默认 Prompt，请保存生效");
  } catch (e: any) {
    ElMessage.error(e?.message || String(e));
  }
}

/** 展示用占位符文案（避免模板里写双花括号触发编译器） */
const commitsPlaceholder = "{{commits}}";

onMounted(load);
</script>

<template>
  <div v-loading="loading" class="app-page flex flex-col gap-12px pb-50px">
    <el-alert v-if="workspaceMissing" type="warning" show-icon :closable="false" class="mb-12px" title="尚未选择工作区根目录，生成日报前请先配置。" />

    <div class="flex flex-col gap-12px">
      <el-card shadow="never" class="section-card card-rounded">
        <template #header>
          <div class="flex items-center justify-between gap-12px text-14px font-600">
            <span>工作区</span>
            <span class="text-12px font-400 text-[var(--el-text-color-secondary)]"> 作者取本机 git config；全量扫描并尊重排除目录 </span>
          </div>
        </template>
        <el-form label-width="120px" label-position="right">
          <el-form-item label="根目录" required>
            <div class="flex w-full gap-8px">
              <el-input v-model="form.workspaceRoot" placeholder="扫描其下 git 仓库" />
              <el-button @click="pickWorkspace">选择…</el-button>
            </div>
          </el-form-item>
          <el-form-item label="排除目录">
            <el-input v-model="excludeText" type="textarea" :rows="3" placeholder="每行一个，如 node_modules" />
          </el-form-item>
        </el-form>
      </el-card>

      <el-card shadow="never" class="section-card card-rounded">
        <template #header>
          <div class="flex items-center justify-between gap-12px text-14px font-600">
            <span>计划时间</span>
            <el-switch v-model="form.scheduleEnabled" inline-prompt active-text="开" inactive-text="关" />
          </div>
        </template>
        <div v-if="!form.scheduleEnabled" class="text-13px text-[var(--el-text-color-secondary)]">定时已关闭，到点不会自动生成。</div>
        <div v-else class="flex flex-col gap-14px">
          <div class="flex items-center gap-10px">
            <span class="w-40px text-13px text-[var(--el-text-color-regular)]">每天</span>
            <el-time-select v-model="form.scheduleTime" style="width: 120px" start="00:00" step="00:15" end="23:45" placeholder="HH:mm" />
            <span class="text-12px text-[var(--el-text-color-secondary)]">到点即跑（应用需在运行或托盘常驻）</span>
          </div>
          <div class="flex flex-wrap gap-8px">
            <button
              v-for="item in WEEKDAY_OPTIONS"
              :key="item.value"
              type="button"
              class="weekday-pill"
              :disabled="form.scheduleBiweeklyEnabled"
              :class="{ active: isDaySelected(item.value) }"
              @click="toggleScheduleDay(item.value)"
            >
              {{ item.label }}
            </button>
          </div>
          <div class="flex flex-wrap items-center gap-12px">
            <span class="text-13px text-[var(--el-text-color-regular)]">大小周</span>
            <el-switch v-model="form.scheduleBiweeklyEnabled" />
            <el-radio-group v-if="form.scheduleBiweeklyEnabled" v-model="form.scheduleBiweeklyAnchorKind">
              <el-radio value="big">本周是大周</el-radio>
              <el-radio value="small">本周是小周</el-radio>
            </el-radio-group>
          </div>
          <p v-if="form.scheduleBiweeklyEnabled" class="m-0 text-12px leading-normal text-[var(--el-text-color-secondary)]">
            大周（单休）周一至六；小周（双休）周一至五。开启后星期由规则决定；保存时以本周为锚点隔周轮换。
          </p>
        </div>
      </el-card>

      <el-card shadow="never" class="section-card card-rounded">
        <template #header>
          <div class="flex items-center justify-between gap-12px text-14px font-600">
            <span>Prompt 模板</span>
            <div class="flex items-center gap-10px">
              <el-button link type="primary" @click="restoreDefaultPrompt">恢复默认</el-button>
            </div>
          </div>
        </template>
        <el-input v-model="form.promptTemplate" type="textarea" :rows="8" />
        <p class="mt-8px mb-0 text-12px leading-normal text-[var(--el-text-color-secondary)]">
          使用占位符 <code>{{ commitsPlaceholder }}</code> 插入扫描日志；未配 Key 或无提交时直接展示日志。
        </p>
      </el-card>
    </div>

    <CsSaveBar :saving="saving" @reload="load" @save="onSave" />
  </div>
</template>

<style scoped lang="scss">
.section-card {
  :deep(.el-card__header) {
    padding: 12px 16px;
  }
  :deep(.el-card__body) {
    padding: 16px;
  }
}
.weekday-pill {
  min-width: 52px;
  height: 32px;
  padding: 0 14px;
  border: 1px solid var(--el-border-color);
  border-radius: 999px;
  background: var(--el-bg-color);
  color: var(--el-text-color-primary);
  font-size: 13px;
  cursor: pointer;
  transition:
    background 0.12s ease,
    border-color 0.12s ease,
    color 0.12s ease;
  &:hover:not(:disabled) {
    border-color: var(--el-text-color-secondary);
  }
  &.active {
    border-color: #1f2329;
    background: #1f2329;
    color: #fff;
  }
  &:disabled {
    opacity: 0.85;
    cursor: not-allowed;
  }
}
</style>
