<script setup lang="ts">
/**
 * 多图上传
 * 职责：picture-card 列表上传，同步 fileList；成功后触发 ant FormItem onFieldChange
 * 适用：表单多图字段
 */
import { uploadImg } from "@/api/public";
import { useInjectFormItemContext } from "ant-design-vue/es/form/FormItemContext";
import type { UploadFile, UploadProps } from "ant-design-vue";
import type { UploadRequestOption } from "ant-design-vue/es/vc-upload/interface";
import { ImageMimeType } from "./index.d";
import $feedback from "@/utils/feedback";

defineOptions({
  name: "UploadImgs"
});

interface UploadFileProps {
  drag?: boolean; // 是否支持拖拽上传 ==> 非必传（默认为 true）
  disabled?: boolean; // 是否禁用上传组件 ==> 非必传（默认为 false）
  limit?: number; // 最大图片上传数 ==> 非必传（默认为 5张）
  fileSize?: number; // 图片大小限制 ==> 非必传（默认为 5M）
  fileType?: ImageMimeType[]; // 图片类型限制 ==> 非必传（默认为 ["image/jpeg", "image/png", "image/gif"]）
  height?: string; // 组件高度 ==> 非必传（默认为 150px）
  width?: string; // 组件宽度 ==> 非必传（默认为 150px）
  borderRadius?: string; // 组件边框圆角 ==> 非必传（默认为 8px）
}

const props = withDefaults(defineProps<UploadFileProps>(), {
  drag: true,
  disabled: false,
  limit: 5,
  fileSize: 5,
  fileType: () => ["image/jpeg", "image/png", "image/gif"],
  height: "150px",
  width: "150px",
  borderRadius: "8px"
});

const modelValue = defineModel<UploadFile[]>({ required: true }); //  图片列表 ==> 必传

const formItemContext = useInjectFormItemContext();
const self_disabled = computed(() => props.disabled);

/**
 * @description 文件上传之前判断
 */
const beforeUpload: UploadProps["beforeUpload"] = file => {
  if ((modelValue.value?.length ?? 0) >= props.limit) {
    $feedback.message.warning(`当前最多只能上传 ${props.limit} 张图片，请移除后上传！`);
    return false;
  }
  const imgSize = file.size / 1024 / 1024 < props.fileSize;
  const imgType = props.fileType.includes(file.type as ImageMimeType);
  if (!imgType) $feedback.message.warning("上传图片不符合所需的格式！");
  if (!imgSize) $feedback.message.warning(`上传图片大小不能超过 ${props.fileSize}M！`);
  return imgType && imgSize;
};

/**
 * @description 图片上传
 */
const handleHttpUpload = async (options: UploadRequestOption) => {
  const formData = new FormData();
  formData.append("file", options.file as File);
  try {
    const { data } = await uploadImg(formData);
    options.onSuccess?.(data as any);
  } catch (error) {
    options.onError?.(error as any);
    $feedback.message.error("图片上传失败，请您重新上传！");
  }
};

/**
 * @description 列表变更：成功项补 url 并触发校验
 */
const handleChange: UploadProps["onChange"] = ({ file, fileList }) => {
  if (file.status === "done") {
    const res = file.response as { url?: string } | undefined;
    if (res?.url) file.url = res.url;
    formItemContext?.onFieldChange?.();
    $feedback.message.success("图片上传成功！");
  }
  modelValue.value = fileList;
};

/**
 * @description 删除图片
 */
const handleRemove = (file: UploadFile) => {
  modelValue.value = modelValue.value.filter(item => item.url !== file.url || item.name !== file.name);
  formItemContext?.onFieldChange?.();
};

/**
 * @description 图片预览
 */
const viewImageUrl = ref("");
const imgViewVisible = ref(false);
const handlePictureCardPreview = (file: UploadFile) => {
  viewImageUrl.value = file.url!;
  imgViewVisible.value = true;
};
</script>

<template>
  <div class="upload-box">
    <a-upload
      v-model:file-list="modelValue"
      action="#"
      list-type="picture-card"
      :class="['upload', self_disabled ? 'disabled' : '', drag ? 'no-border' : '']"
      :multiple="true"
      :disabled="self_disabled"
      :max-count="limit"
      :custom-request="handleHttpUpload"
      :before-upload="beforeUpload"
      :accept="fileType.join(',')"
      @change="handleChange"
    >
      <div v-if="modelValue.length < limit" class="upload-empty">
        <slot name="empty">
          <IconifyIcon icon="ant-design:plus-outlined" class="upload-plus" />
        </slot>
      </div>
      <template #itemRender="{ file }">
        <div class="upload-list-item">
          <img :src="file.url" class="upload-image" />
          <div class="upload-handle" @click.stop>
            <div class="handle-icon" @click="handlePictureCardPreview(file)">
              <IconifyIcon icon="ant-design:zoom-in-outlined" class="action-icon" />
            </div>
            <div v-if="!self_disabled" class="handle-icon" @click="handleRemove(file)">
              <IconifyIcon icon="ant-design:delete-outlined" class="action-icon" />
            </div>
          </div>
        </div>
      </template>
    </a-upload>
    <div class="upload-tip">
      <slot name="tip" />
    </div>
    <a-image
      :style="{ display: 'none' }"
      :src="viewImageUrl"
      :preview="{
        visible: imgViewVisible,
        onVisibleChange: (vis: boolean) => (imgViewVisible = vis)
      }"
    />
  </div>
</template>

<style scoped lang="scss">
.is-error {
  .upload {
    :deep(.ant-upload-select-picture-card) {
      border-color: #ff4d4f !important;

      &:hover {
        border-color: var(--color-primary) !important;
      }
    }
  }
}

:deep(.disabled) {
  .ant-upload-select-picture-card {
    border-color: #d9d9d9;
    background: #f5f5f5 !important;
    cursor: not-allowed;

    &:hover {
      border-color: #d9d9d9 !important;
    }
  }
}

.upload-box {
  :deep(.upload) {
    .ant-upload-select-picture-card,
    .ant-upload-list-item-container {
      border-radius: v-bind(borderRadius);
      width: v-bind(width);
      height: v-bind(height);
    }

    .ant-upload-select-picture-card {
      background-color: transparent;
    }
  }

  .upload-list-item {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    border-radius: v-bind(borderRadius);

    &:hover .upload-handle {
      opacity: 1;
    }
  }

  .upload-image {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .upload-handle {
    position: absolute;
    inset: 0;
    display: flex;
    justify-content: center;
    align-items: center;
    background: rgb(0 0 0 / 60%);
    opacity: 0;
    transition: opacity 0.2s;
    cursor: pointer;

    .handle-icon {
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 0 6%;
      color: aliceblue;
      flex-direction: column;

      .action-icon {
        font-size: 20px;
      }
    }
  }

  .upload-empty {
    display: flex;
    justify-content: center;
    align-items: center;
  }

  .upload-plus {
    font-size: 24px;
    color: #999;
  }

  .upload-tip {
    line-height: 15px;
    text-align: center;
  }
}
</style>
