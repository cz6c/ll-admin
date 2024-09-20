<script setup lang="ts" name="ImportTemp">
import { getToken } from "@/utils/auth";
const { proxy } = getCurrentInstance();

const props = defineProps({
  importUrl: { type: String, default: "" },
  importTempUrl: { type: String, default: "" },
  filePrefix: { type: String, default: "" }
});

const $emit = defineEmits(["success", "cancel"]);

const urlCom = computed(
  () => import.meta.env.VITE_BASE_URL + props.importUrl + "?updateSupport=" + upload.updateSupport
);

const upload = reactive({
  // 是否禁用上传
  isUploading: false,
  // 是否更新已经存在的用户数据
  updateSupport: 0,
  // 设置上传的请求头部
  headers: { Authorization: "Bearer " + getToken() }
});
const uploadRef = ref(null);

/** 下载模板操作 */
function importTemplate() {
  proxy.$file.download(props.importTempUrl, {}, `${props.filePrefix ?? ""}${new Date().getTime()}.xlsx`);
}
/**文件上传中处理 */
const handleFileUploadProgress = () => {
  upload.isUploading = true;
};
/** 文件上传成功处理 */
const handleFileSuccess = (response: any, file: File) => {
  upload.isUploading = false;
  unref(uploadRef).handleRemove(file);
  $emit("success");
  console.log(response.msg);
};
/** 提交上传文件 */
function submitFileForm() {
  unref(uploadRef).submit();
}
</script>

<template>
  <div>
    <el-upload
      ref="uploadRef"
      :limit="1"
      accept=".xlsx, .xls"
      :headers="upload.headers"
      :action="urlCom"
      :disabled="upload.isUploading"
      :on-progress="handleFileUploadProgress"
      :on-success="handleFileSuccess"
      :auto-upload="false"
      drag
    >
      <el-icon class="el-icon--upload"><upload-filled /></el-icon>
      <div class="el-upload__text">将文件拖到此处，或<em>点击上传</em></div>
      <template #tip>
        <div class="el-upload__tip text-center">
          <div class="el-upload__tip"><el-checkbox v-model="upload.updateSupport" />是否更新已经存在的用户数据</div>
          <span>仅允许导入xls、xlsx格式文件。</span>
          <el-link
            type="primary"
            :underline="false"
            style="font-size: 12px; vertical-align: baseline"
            @click="importTemplate"
          >
            下载模板
          </el-link>
        </div>
      </template>
    </el-upload>
    <div class="flex items-center justify-center">
      <el-button type="primary" @click="submitFileForm">确 定</el-button>
      <el-button @click="$emit('cancel')">取 消</el-button>
    </div>
  </div>
</template>

<style scoped lang="scss"></style>
