<template>
  <el-form ref="userRef" :model="user" :rules="rules" label-width="80px">
    <el-form-item label="用户昵称" prop="nickName">
      <el-input v-model="user.nickName" maxlength="30" />
    </el-form-item>
    <el-form-item label="邮箱" prop="email">
      <el-input v-model="user.email" maxlength="50" />
    </el-form-item>
    <el-form-item label="性别">
      <el-radio-group v-model="user.sex">
        <el-radio v-for="dict in UserSexEnum" :key="dict.value" :label="dict.label" :value="dict.value" />
      </el-radio-group>
    </el-form-item>
    <el-form-item>
      <el-button type="primary" @click="submit">保存</el-button>
      <el-button type="danger" @click="close">关闭</el-button>
    </el-form-item>
  </el-form>
</template>

<script setup lang="ts">
import { UpdateProfileDto } from "#/api/system/user";
import { updateUserProfile } from "@/api/system/user";
import { useDict } from "@/hooks/useDict";
import { useAuthStore } from "@/store/modules/auth";
import { FormInstance, FormRules } from "element-plus";
import $feedback from "@/utils/feedback";
import { useTagsViewStore } from "@/store/modules/tagsView";

defineOptions({
  name: "UserInfo"
});
const { UserSexEnum } = toRefs(useDict("UserSexEnum"));

const user = defineModel<UpdateProfileDto>("user");

const authStore = useAuthStore();
const userRef = ref<FormInstance>(null);

const rules = ref<FormRules>({
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
function submit() {
  unref(userRef).validate(valid => {
    if (valid) {
      updateUserProfile(unref(user)).then(response => {
        $feedback.message.success("修改成功");
        authStore.getLoginUserInfo();
      });
    }
  });
}
/** 关闭按钮 */
function close() {
  useTagsViewStore().closePage(undefined);
}
</script>
