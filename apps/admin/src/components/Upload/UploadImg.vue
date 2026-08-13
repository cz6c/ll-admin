<script setup lang="ts">
/**
 * 单图上传
 * 职责：自定义请求上传图片，回写 url；成功后触发 ant FormItem onFieldChange
 * 适用：表单头像 / 封面等单图字段
 */
import { generateUUID } from "@llcz/common";
import { uploadImg } from "@/api/public";
import { useInjectFormItemContext } from "ant-design-vue/es/form/FormItemContext";
import type { UploadProps } from "ant-design-vue";
import type { UploadRequestOption } from "ant-design-vue/es/vc-upload/interface";
import { ImageMimeType } from "./index.d";
import $feedback from "@/utils/feedback";

defineOptions({
  name: "UploadImg"
});

interface UploadFileProps {
  drag?: boolean; // 是否支持拖拽上传 ==> 非必传（默认为 true）
  disabled?: boolean; // 是否禁用上传组件 ==> 非必传（默认为 false）
  fileSize?: number; // 图片大小限制 ==> 非必传（默认为 5M）
  fileType?: ImageMimeType[]; // 图片类型限制 ==> 非必传（默认为 ["image/jpeg", "image/png", "image/gif"]）
  height?: string; // 组件高度 ==> 非必传（默认为 150px）
  width?: string; // 组件宽度 ==> 非必传（默认为 150px）
  borderRadius?: string; // 组件边框圆角 ==> 非必传（默认为 8px）
}

// 接受父组件参数
const props = withDefaults(defineProps<UploadFileProps>(), {
  drag: true,
  disabled: false,
  fileSize: 5,
  fileType: () => ["image/jpeg", "image/png", "image/gif"],
  height: "150px",
  width: "150px",
  borderRadius: "8px"
});

const modelValue = defineModel<string>({ required: true }); //  图片地址 ==> 必传

// 生成组件唯一id
const uuid = ref("id-" + generateUUID());

// 查看图片
const imgViewVisible = ref(false);
// ant FormItem 上下文：上传成功后触发字段校验
const formItemContext = useInjectFormItemContext();
// 判断是否禁用上传和删除
const self_disabled = computed(() => props.disabled);

/**
 * @description 图片上传
 * @param options upload 自定义请求参数
 */
const handleHttpUpload = async (options: UploadRequestOption) => {
  const formData = new FormData();
  formData.append("file", options.file as File);
  try {
    const { data } = await uploadImg(formData);
    modelValue.value = data.url;
    formItemContext?.onFieldChange?.();
    options.onSuccess?.(data as any);
    $feedback.message.success("图片上传成功！");
  } catch (error) {
    options.onError?.(error as any);
    $feedback.message.error("图片上传失败，请您重新上传！");
  }
};

/**
 * @description 删除图片
 */
const deleteImg = () => {
  modelValue.value = "";
  formItemContext?.onFieldChange?.();
};

/**
 * @description 编辑图片：触发隐藏 file input
 */
const editImg = () => {
  const dom = document.querySelector(`#${uuid.value} input[type=file]`) as HTMLInputElement | null;
  dom?.dispatchEvent(new MouseEvent("click"));
};

/**
 * @description 文件上传之前判断
 */
const beforeUpload: UploadProps["beforeUpload"] = file => {
  const imgSize = file.size / 1024 / 1024 < props.fileSize;
  const imgType = props.fileType.includes(file.type as ImageMimeType);
  if (!imgType) $feedback.message.warning("上传图片不符合所需的格式！");
  if (!imgSize) $feedback.message.warning(`上传图片大小不能超过 ${props.fileSize}M！`);
  return imgType && imgSize;
};
</script>

<template>
  <div class="upload-box">
    <a-upload
      :id="uuid"
      name="file"
      action="#"
      :class="['upload', self_disabled ? 'disabled' : '', drag ? 'no-border' : '']"
      list-type="picture-card"
      :multiple="false"
      :disabled="self_disabled"
      :show-upload-list="false"
      :custom-request="handleHttpUpload"
      :before-upload="beforeUpload"
      :accept="fileType.join(',')"
    >
      <template v-if="modelValue">
        <div class="upload-card-inner">
          <img :src="modelValue" class="upload-image" />
          <div class="upload-handle" @click.stop>
            <div v-if="!self_disabled" class="handle-icon" @click="editImg">
              <IconifyIcon icon="ant-design:edit-outlined" class="action-icon" />
            </div>
            <div class="handle-icon" @click="imgViewVisible = true">
              <IconifyIcon icon="ant-design:zoom-in-outlined" class="action-icon" />
            </div>
            <div v-if="!self_disabled" class="handle-icon" @click="deleteImg">
              <IconifyIcon icon="ant-design:delete-outlined" class="action-icon" />
            </div>
          </div>
        </div>
      </template>
      <template v-else>
        <div class="upload-empty">
          <slot name="empty">
            <IconifyIcon icon="ant-design:plus-outlined" class="upload-plus" />
          </slot>
        </div>
      </template>
    </a-upload>
    <div class="upload-tip">
      <slot name="tip" />
    </div>
    <a-image
      :style="{ display: 'none' }"
      :src="modelValue"
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
    :deep(.ant-upload),
    :deep(.ant-upload-select) {
      border-color: #ff4d4f !important;

      &:hover {
        border-color: var(--color-primary) !important;
      }
    }
  }
}

:deep(.disabled) {
  .ant-upload,
  .ant-upload-select {
    border-color: #d9d9d9 !important;
    background: #f5f5f5;
    cursor: not-allowed !important;

    &:hover {
      border-color: #d9d9d9 !important;
    }
  }
}

.upload-box {
  .no-border {
    :deep(.ant-upload) {
      border-style: dashed;
    }
  }

  :deep(.upload) {
    .ant-upload.ant-upload-select {
      position: relative;
      display: flex;
      justify-content: center;
      align-items: center;
      overflow: hidden;
      border: 1px dashed #d9d9d9;
      border-radius: v-bind(borderRadius);
      width: v-bind(width);
      height: v-bind(height);
      margin: 0;
      transition: border-color 0.2s;

      &:hover {
        border-color: var(--color-primary);

        .upload-handle {
          opacity: 1;
        }
      }
    }
  }

  .upload-card-inner {
    position: relative;
    width: 100%;
    height: 100%;
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
    width: 100%;
    height: 100%;
  }

  .upload-plus {
    font-size: 24px;
    color: #999;
  }

  .upload-tip {
    line-height: 18px;
    text-align: center;
  }
}
</style>
