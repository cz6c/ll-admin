<!--
  批量改拍摄时间确认弹窗
  职责：将勾选文件设为同一日期；只写 media.db（source=user）
  适用：相册列表模式勾选后调用
-->
<script setup lang="ts">
import { dateUtil } from "@llcz/common";
import type { Dayjs } from "dayjs";
import type { MediaFile } from "../types";

defineOptions({ name: "CaptureAtRewriteModal" });

const open = defineModel<boolean>("open", { default: false });

const props = defineProps<{
  files: MediaFile[];
}>();

const emit = defineEmits<{
  confirm: [payload: { captureAt: string }];
}>();

const targetDay = ref<Dayjs | null>(null);
const submitting = ref(false);

const count = computed(() => props.files.length);
const withCapture = computed(() => props.files.filter(f => !!f.captureAt?.trim()).length);
const withoutCapture = computed(() => count.value - withCapture.value);

const canSubmit = computed(
  () => count.value > 0 && !submitting.value && !!targetDay.value?.isValid()
);

watch(open, v => {
  if (!v) return;
  targetDay.value = dateUtil().startOf("day");
  submitting.value = false;
});

function onCancel() {
  open.value = false;
}

function onOk() {
  if (!canSubmit.value || !targetDay.value) return;
  emit("confirm", {
    captureAt: targetDay.value.format("YYYY-MM-DD") + "T00:00:00"
  });
}

defineExpose({
  setSubmitting(v: boolean) {
    submitting.value = v;
  }
});
</script>

<template>
  <a-modal
    v-model:open="open"
    title="改拍摄时间"
    :confirm-loading="submitting"
    destroy-on-close
    @cancel="onCancel"
  >
    <p class="hint">
      将对已选 <strong>{{ count }}</strong> 项设为同一拍摄日期（不改原文件 EXIF）。已有拍摄时间
      {{ withCapture }}，无拍摄时间 {{ withoutCapture }}。
    </p>

    <div class="field">
      <div class="label">目标日期（时间 00:00:00）</div>
      <a-date-picker v-model:value="targetDay" class="w-full" allow-clear />
    </div>

    <template #footer>
      <a-button @click="onCancel">取消</a-button>
      <a-button type="primary" :disabled="!canSubmit" :loading="submitting" @click="onOk">写入</a-button>
    </template>
  </a-modal>
</template>

<style scoped lang="scss">
.hint {
  margin: 0 0 12px;
  color: var(--color-text-secondary);
  line-height: 1.5;
}
.field {
  margin-top: 8px;
}
.label {
  margin-bottom: 8px;
  font-size: 13px;
}
.w-full {
  width: 100%;
}
</style>
