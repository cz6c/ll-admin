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
import $feedback from "@/utils/feedback";

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

/** 计划时刻选项：00:00～23:45，步长 15 分钟 */
const scheduleTimeOptions = Array.from({ length: 24 * 4 }, (_, i) => {
  const h = String(Math.floor(i / 4)).padStart(2, "0");
  const m = String((i % 4) * 15).padStart(2, "0");
  const v = `${h}:${m}`;
  return { label: v, value: v };
});

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
    $feedback.message.error(e?.message || String(e));
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
    $feedback.message.warning("请至少选择一天作为计划触发日");
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
    $feedback.message.success("已保存");
  } catch (e: any) {
    $feedback.message.error(e?.message || String(e));
  } finally {
    saving.value = false;
  }
}

/** 用内置默认模板覆盖当前编辑区（需再点保存才落盘） */
async function restoreDefaultPrompt() {
  if (!isTauri()) return;
  try {
    form.promptTemplate = await getDefaultDailyReportPrompt();
    $feedback.message.success("已填入默认 Prompt，请保存生效");
  } catch (e: any) {
    $feedback.message.error(e?.message || String(e));
  }
}

/** 展示用占位符文案（避免模板里写双花括号触发编译器） */
const commitsPlaceholder = "{{commits}}";

onMounted(load);
</script>

<template>
  <a-spin :spinning="loading">
    <div class="app-page flex flex-col gap-16px pb-48px">
    <a-alert v-if="workspaceMissing" type="warning" show-icon :closable="false" class="mb-0" message="尚未选择工作区根目录，生成日报前请先配置。" />

    <div class="flex flex-col gap-16px">
      <a-card class="section-card card-rounded" :bordered="true">
        <template #title>
          <div class="flex items-center justify-between gap-16px text-14px font-600">
            <span>工作区</span>
            <span class="text-12px font-400 text-[var(--color-text-tertiary)]"> 作者取本机 git config；全量扫描并尊重排除目录 </span>
          </div>
        </template>
        <a-form :label-col="{ style: { width: '120px' } }" label-align="right">
          <a-form-item label="根目录" required>
            <div class="flex w-full gap-8px">
              <a-input v-model:value="form.workspaceRoot" placeholder="扫描其下 git 仓库" />
              <a-button @click="pickWorkspace">选择…</a-button>
            </div>
          </a-form-item>
          <a-form-item label="排除目录">
            <a-textarea v-model:value="excludeText" :rows="3" placeholder="每行一个，如 node_modules" />
          </a-form-item>
        </a-form>
      </a-card>

      <a-card class="section-card card-rounded" :bordered="true">
        <template #title>
          <div class="flex items-center justify-between gap-16px text-14px font-600">
            <span>计划时间</span>
            <a-switch v-model:checked="form.scheduleEnabled" checked-children="开" un-checked-children="关" />
          </div>
        </template>
        <div v-if="!form.scheduleEnabled" class="text-14px text-[var(--color-text-tertiary)]">定时已关闭，到点不会自动生成。</div>
        <div v-else class="flex flex-col gap-16px">
          <div class="flex items-center gap-8px">
            <span class="w-40px text-14px text-[var(--color-text-secondary)]">每天</span>
            <a-select v-model:value="form.scheduleTime" style="width: 120px" :options="scheduleTimeOptions" placeholder="HH:mm" />
            <span class="text-12px text-[var(--color-text-tertiary)]">到点即跑（应用需在运行或托盘常驻）</span>
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
          <div class="flex flex-wrap items-center gap-16px">
            <span class="text-14px text-[var(--color-text-secondary)]">大小周</span>
            <a-switch v-model:checked="form.scheduleBiweeklyEnabled" />
            <a-radio-group v-if="form.scheduleBiweeklyEnabled" v-model:value="form.scheduleBiweeklyAnchorKind">
              <a-radio value="big">本周是大周</a-radio>
              <a-radio value="small">本周是小周</a-radio>
            </a-radio-group>
          </div>
          <p v-if="form.scheduleBiweeklyEnabled" class="m-0 text-12px leading-normal text-[var(--color-text-tertiary)]">
            大周（单休）周一至六；小周（双休）周一至五。开启后星期由规则决定；保存时以本周为锚点隔周轮换。
          </p>
        </div>
      </a-card>

      <a-card class="section-card card-rounded" :bordered="true">
        <template #title>
          <div class="flex items-center justify-between gap-16px text-14px font-600">
            <span>Prompt 模板</span>
            <div class="flex items-center gap-8px">
              <a-button type="link" @click="restoreDefaultPrompt">恢复默认</a-button>
            </div>
          </div>
        </template>
        <a-textarea v-model:value="form.promptTemplate" :rows="8" />
        <p class="mt-8px mb-0 text-12px leading-normal text-[var(--color-text-tertiary)]">
          使用占位符 <code>{{ commitsPlaceholder }}</code> 插入扫描日志；未配 Key 或无提交时直接展示日志。
        </p>
      </a-card>
    </div>

    <CsSaveBar :saving="saving" @reload="load" @save="onSave" />
    </div>
  </a-spin>
</template>

<style scoped lang="scss">
.section-card {
  :deep(.ant-card-head) {
    padding: 12px 16px;
    min-height: auto;
  }
  :deep(.ant-card-body) {
    padding: 16px;
  }
}
.weekday-pill {
  min-width: 48px;
  height: 32px;
  padding: 0 16px;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  background: var(--bg-color);
  color: var(--color-text);
  font-size: 14px;
  cursor: pointer;
  transition:
    background var(--dur-press) var(--ease-out),
    border-color var(--dur-press) var(--ease-out),
    color var(--dur-press) var(--ease-out);
  &:hover:not(:disabled) {
    border-color: var(--color-text-tertiary);
  }
  &.active {
    border-color: var(--color-primary);
    background: var(--color-primary);
    color: #fff;
  }
  &:disabled {
    opacity: 0.85;
    cursor: not-allowed;
  }
}

@media (prefers-reduced-motion: reduce) {
  .weekday-pill {
    transition: none;
  }
}
</style>
