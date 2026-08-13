<template>
  <a-form ref="pwdRef" :model="user" :rules="rules" :label-col="{ style: { width: '80px' } }">
    <a-form-item label="旧密码" name="oldPassword">
      <a-input-password v-model:value="user.oldPassword" placeholder="请输入旧密码" />
    </a-form-item>
    <a-form-item label="新密码" name="newPassword">
      <a-input-password v-model:value="user.newPassword" placeholder="请输入新密码" />
    </a-form-item>
    <a-form-item label="确认密码" name="confirmPassword">
      <a-input-password v-model:value="user.confirmPassword" placeholder="请确认新密码" />
    </a-form-item>
    <a-form-item>
      <a-space>
        <a-button type="primary" @click="submit">保存</a-button>
        <a-button danger @click="close">关闭</a-button>
      </a-space>
    </a-form-item>
  </a-form>
</template>

<script setup lang="ts">
import { updateUserPwd } from "@/api/system/user";
import { useAuthStore } from "@/store/modules/auth";
import type { FormInstance, Rule } from "ant-design-vue/es/form";
import $feedback from "@/utils/feedback";
import { useTagsViewStore } from "@/store/modules/tagsView";

defineOptions({
  name: "ResetPwd"
});

const userStore = useAuthStore();
const pwdRef = ref<FormInstance>();

const user = reactive({
  oldPassword: undefined,
  newPassword: undefined,
  confirmPassword: undefined
});

const equalToPassword = async (_rule, value) => {
  if (user.newPassword !== value) {
    return Promise.reject("两次输入的密码不一致");
  }
};
const rules = ref<Record<string, Rule[]>>({
  oldPassword: [{ required: true, message: "旧密码不能为空", trigger: "blur" }],
  newPassword: [
    { required: true, message: "新密码不能为空", trigger: "blur" },
    { min: 6, max: 20, message: "长度在 6 到 20 个字符", trigger: "blur" }
  ],
  confirmPassword: [
    { required: true, message: "确认密码不能为空", trigger: "blur" },
    { validator: equalToPassword, trigger: "blur" }
  ]
});

/** 提交按钮 */
async function submit() {
  try {
    await unref(pwdRef)?.validate();
  } catch {
    return;
  }
  await updateUserPwd(user);
  $feedback.message.success("修改成功，请使用新密码重新登录");
  userStore.webLogout();
}
/** 关闭按钮 */
function close() {
  useTagsViewStore().closePage(undefined);
}
</script>
