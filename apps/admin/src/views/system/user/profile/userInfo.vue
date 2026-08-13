<template>
  <a-form ref="userRef" :model="user" :rules="rules" :label-col="{ style: { width: '80px' } }">
    <a-form-item label="用户昵称" name="nickName">
      <a-input v-model:value="user.nickName" :maxlength="30" />
    </a-form-item>
    <a-form-item label="邮箱" name="email">
      <a-input v-model:value="user.email" :maxlength="50" />
    </a-form-item>
    <a-form-item label="性别">
      <a-radio-group v-model:value="user.sex">
        <a-radio v-for="dict in UserSexEnum" :key="dict.value" :value="dict.value">{{ dict.label }}</a-radio>
      </a-radio-group>
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
import { UpdateProfileDto } from "#/api/system/user";
import { updateUserProfile } from "@/api/system/user";
import { useDict } from "@/hooks/useDict";
import { useAuthStore } from "@/store/modules/auth";
import type { FormInstance, Rule } from "ant-design-vue/es/form";
import $feedback from "@/utils/feedback";
import { useTagsViewStore } from "@/store/modules/tagsView";

defineOptions({
  name: "UserInfo"
});
const { UserSexEnum } = toRefs(useDict("UserSexEnum"));

const user = defineModel<UpdateProfileDto>("user");

const authStore = useAuthStore();
const userRef = ref<FormInstance>();

const rules = ref<Record<string, Rule[]>>({
  nickName: [{ required: true, message: "用户昵称不能为空", trigger: "blur" }],
  email: [
    { required: true, message: "邮箱地址不能为空", trigger: "blur" },
    {
      type: "email",
      message: "请输入正确的邮箱地址",
      trigger: ["blur", "change"]
    }
  ]
});

/** 提交按钮 */
async function submit() {
  try {
    await unref(userRef)?.validate();
  } catch {
    return;
  }
  await updateUserProfile(unref(user));
  $feedback.message.success("修改成功");
  authStore.getLoginUserInfo();
}
/** 关闭按钮 */
function close() {
  useTagsViewStore().closePage(undefined);
}
</script>
