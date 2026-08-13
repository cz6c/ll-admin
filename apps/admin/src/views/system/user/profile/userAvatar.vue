<template>
  <!--
    个人头像裁剪上传
    主流程：点头像开 Modal → 选图本地预览裁剪 → 提交 uploadImg + uploadAvatar
  -->
  <div class="user-info-head" @click="editCropper()">
    <img v-if="options.img" :src="options.img" title="点击上传头像" class="img-circle img-lg" />
    <span v-else>点击上传头像</span>
    <a-modal v-model:open="open" :title="title" width="800px" :footer="null" destroy-on-close @cancel="closeDialog">
      <a-row>
        <a-col :xs="24" :md="12" :style="{ height: '350px' }">
          <!--
            antdv Modal 无 EP dialog 的 @opened / React 的 afterOpenChange；
            须等 open 后 nextTick 再挂载 cropper，否则容器宽高为 0 裁剪区空白。
          -->
          <vue-cropper
            v-if="visible"
            ref="cropperRef"
            :img="options.img"
            :info="true"
            :autoCrop="options.autoCrop"
            :autoCropWidth="options.autoCropWidth"
            :autoCropHeight="options.autoCropHeight"
            :fixedBox="options.fixedBox"
            :outputType="options.outputType"
            @realTime="realTime"
          />
        </a-col>
        <a-col :xs="24" :md="12" :style="{ height: '350px' }">
          <div class="avatar-upload-preview">
            <img :src="options.previews.url" :style="options.previews.img" />
          </div>
        </a-col>
      </a-row>
      <br />
      <a-row>
        <a-col :lg="2" :md="2">
          <!-- 仅本地选图进裁剪，不走 Upload 自动上传；与 ImportTemp 同模式 -->
          <a-upload accept="image/*" :show-upload-list="false" :before-upload="beforeUpload">
            <a-button>
              选择
              <IconifyIcon icon="ant-design:upload-outlined" />
            </a-button>
          </a-upload>
        </a-col>
        <a-col :lg="{ span: 1, offset: 2 }" :md="2">
          <a-button @click="changeScale(1)">
            <template #icon><component :is="useRenderIcon('ant-design:plus-outlined')" /></template>
          </a-button>
        </a-col>
        <a-col :lg="{ span: 1, offset: 1 }" :md="2">
          <a-button @click="changeScale(-1)">
            <template #icon><component :is="useRenderIcon('ant-design:minus-outlined')" /></template>
          </a-button>
        </a-col>
        <a-col :lg="{ span: 1, offset: 1 }" :md="2">
          <a-button @click="rotateLeft()">
            <template #icon><component :is="useRenderIcon('ant-design:undo-outlined')" /></template>
          </a-button>
        </a-col>
        <a-col :lg="{ span: 1, offset: 1 }" :md="2">
          <a-button @click="rotateRight()">
            <template #icon><component :is="useRenderIcon('ant-design:redo-outlined')" /></template>
          </a-button>
        </a-col>
        <a-col :lg="{ span: 2, offset: 6 }" :md="2">
          <a-button type="primary" @click="sumbit()">提 交</a-button>
        </a-col>
      </a-row>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
/**
 * 个人中心头像裁剪上传
 * 职责：Modal 内 vue-cropper 选图裁剪，提交后回写 authStore.avatar
 * 适用：用户资料页头像入口
 */
import type { UploadProps } from "ant-design-vue";
import { uploadAvatar } from "@/api/system/user";
import { uploadImg } from "@/api/public";
import { useAuthStore } from "@/store/modules/auth";
import $feedback from "@/utils/feedback";
import { useRenderIcon } from "@/hooks/useRenderIcon";

defineOptions({
  name: "UserAvatar"
});

const authStore = useAuthStore();
const cropperRef = ref<{
  rotateLeft: () => void;
  rotateRight: () => void;
  changeScale: (num: number) => void;
  getCropBlob: (cb: (blob: Blob) => void) => void;
} | null>(null);

const open = ref(false);
const visible = ref(false);
const title = ref("修改头像");

/** 图片裁剪与预览状态 */
const options = reactive({
  img: authStore.avatar,
  autoCrop: true,
  autoCropWidth: 200,
  autoCropHeight: 200,
  fixedBox: true,
  outputType: "png",
  previews: {
    url: "",
    img: "" as string | Record<string, string>
  }
});

/** Modal 打开后再挂载 cropper，保证容器已有尺寸 */
watch(open, async isOpen => {
  if (isOpen) {
    await nextTick();
    visible.value = true;
  } else {
    visible.value = false;
  }
});

/** 打开头像裁剪弹窗 */
function editCropper() {
  open.value = true;
}

/** 向左旋转 */
function rotateLeft() {
  cropperRef.value?.rotateLeft();
}
/** 向右旋转 */
function rotateRight() {
  cropperRef.value?.rotateRight();
}
/** 图片缩放 */
function changeScale(num?: number) {
  cropperRef.value?.changeScale(num || 1);
}

const nowFile = ref<File | null>(null);

/**
 * 选文件后本地读成 dataURL 喂给 cropper；返回 false 阻止 antd 自动上传
 */
const beforeUpload: UploadProps["beforeUpload"] = file => {
  if (file.type.indexOf("image/") === -1) {
    $feedback.message.error("文件格式错误，请上传图片类型,如：JPG，PNG后缀的文件。");
    return false;
  }
  nowFile.value = file as File;
  const reader = new FileReader();
  reader.readAsDataURL(file as File);
  reader.onload = () => {
    options.img = reader.result as string;
  };
  return false;
};

/**
 * 裁剪后上传头像并回写登录用户信息
 * @note 必须先 await uploadAvatar（写库+刷新 Redis 会话），再 getLoginUserInfo；
 *       并行调用会读到旧会话 avatar 为空并覆盖本地刚赋的值
 */
async function sumbit() {
  if (!nowFile.value) {
    $feedback.message.warning("请先选择图片");
    return;
  }
  const cropper = cropperRef.value;
  if (!cropper) return;

  const blob = await new Promise<Blob>(resolve => {
    cropper.getCropBlob(resolve);
  });
  const source = nowFile.value;
  const newFile = new File([blob], source.name, { type: source.type });
  const formData = new FormData();
  formData.append("fileType", "avatar");
  formData.append("file", newFile);

  try {
    const { data } = await uploadImg(formData);
    const url = data.url;
    await uploadAvatar({ avatar: url });
    options.img = url;
    authStore.avatar = url;
    await authStore.getLoginUserInfo();
    open.value = false;
    visible.value = false;
    nowFile.value = null;
    $feedback.message.success("修改成功");
  } catch {
    // 错误提示由 http 拦截器统一处理
  }
}

/** 裁剪框实时预览 */
function realTime(data: { url: string; img: string | Record<string, string> }) {
  options.previews = data;
}

/** 关闭时还原为当前已保存头像 */
function closeDialog() {
  options.img = authStore.avatar;
  visible.value = false;
  nowFile.value = null;
}
</script>

<style lang="scss" scoped>
.user-info-head {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 120px;
  width: 120px;
  border-radius: 50%;
  background-color: var(--fill-color);
  cursor: pointer;
  overflow: hidden;

  .img-circle {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 50%;
  }

  &:hover::after {
    content: "+";
    position: absolute;
    inset: 0;
    color: #eee;
    background: rgba(0, 0, 0, 0.5);
    font-size: 24px;
    line-height: 120px;
    text-align: center;
    border-radius: 50%;
  }
}

.avatar-upload-preview {
  position: relative;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 200px;
  height: 200px;
  border-radius: 50%;
  box-shadow: 0 0 4px #ccc;
  overflow: hidden;
}
</style>
