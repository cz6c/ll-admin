<script setup lang="ts">
/**
 * Excel 导入模板上传
 * 职责：选择 xls/xlsx → 手动提交到 importUrl；可选下载模板
 * 适用：用户导入等弹窗内容区
 *
 * 为何不用 Upload action 自动上传：需要「选文件 → 点确定再提交」，
 * 故 beforeUpload 返回 false 拦截，再由确定按钮 fetch 上传。
 */
import { getToken } from "@/utils/auth";
import type { UploadFile, UploadProps } from "ant-design-vue";
import { dateUtil } from "@llcz/common";
import $file from "@/utils/file";
import $feedback from "@/utils/feedback";

defineOptions({
  name: "ImportTemp"
});

const props = defineProps({
  importUrl: { type: String, default: "" },
  importTempUrl: { type: String, default: "" },
  filePrefix: { type: String, default: "" }
});

const $emit = defineEmits(["success", "cancel"]);

const upload = reactive({
  isUploading: false,
  // 0/1：是否更新已存在数据（拼到 action query）
  updateSupport: 0,
  headers: { Authorization: "Bearer " + getToken()?.token }
});

const fileList = ref<UploadFile[]>([]);
const updateSupportChecked = computed({
  get: () => upload.updateSupport === 1,
  set: (v: boolean) => {
    upload.updateSupport = v ? 1 : 0;
  }
});

const urlCom = computed(() => import.meta.env.VITE_BASE_URL + props.importUrl + "?updateSupport=" + upload.updateSupport);

/** 下载模板操作 */
function importTemplate() {
  $file.download(props.importTempUrl, {}, `${props.filePrefix ?? ""}${dateUtil().format("YYYYMMDDHHmmss")}.xlsx`);
}

/** 仅选文件，不自动上传 */
const beforeUpload: UploadProps["beforeUpload"] = file => {
  fileList.value = [
    {
      uid: String(Date.now()),
      name: file.name,
      status: "done",
      originFileObj: file as any
    }
  ];
  return false;
};

/** 提交上传文件 */
async function submitFileForm() {
  const raw = fileList.value[0]?.originFileObj;
  if (!raw) {
    $feedback.message.warning("请先选择要导入的文件");
    return;
  }
  upload.isUploading = true;
  try {
    const formData = new FormData();
    formData.append("file", raw as File);
    const res = await fetch(urlCom.value, {
      method: "POST",
      headers: upload.headers,
      body: formData
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data as any)?.msg || "导入失败");
    fileList.value = [];
    $emit("success");
    console.log((data as any)?.msg);
  } catch (e: any) {
    $feedback.message.error(e?.message || "导入失败");
  } finally {
    upload.isUploading = false;
  }
}
</script>

<template>
  <div>
    <a-upload-dragger
      v-model:file-list="fileList"
      name="file"
      :max-count="1"
      accept=".xlsx, .xls"
      :disabled="upload.isUploading"
      :before-upload="beforeUpload"
      :show-upload-list="true"
    >
      <p class="ant-upload-drag-icon">
        <IconifyIcon class="upload-icon" icon="ant-design:cloud-upload-outlined" />
      </p>
      <p class="ant-upload-text">将文件拖到此处，或<span class="link">点击上传</span></p>
    </a-upload-dragger>
    <div class="tip text-center">
      <div class="tip-row">
        <a-checkbox v-model:checked="updateSupportChecked" />
        <span>是否更新已经存在的用户数据</span>
      </div>
      <span>仅允许导入xls、xlsx格式文件。</span>
      <a class="tpl-link" @click.prevent="importTemplate">下载模板</a>
    </div>
    <div class="flex items-center justify-center actions">
      <a-space>
        <a-button type="primary" :loading="upload.isUploading" @click="submitFileForm">确 定</a-button>
        <a-button @click="$emit('cancel')">取 消</a-button>
      </a-space>
    </div>
  </div>
</template>

<style scoped lang="scss">
.upload-icon {
  font-size: 40px;
  color: #999;
}
.link {
  color: var(--color-primary);
}
.tip {
  margin: 12px 0 16px;
  font-size: 12px;
  color: #666;
}
.tip-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-bottom: 4px;
}
.tpl-link {
  margin-left: 4px;
  font-size: 12px;
  color: var(--color-primary);
  cursor: pointer;
}
.actions {
  gap: 8px;
}
</style>
