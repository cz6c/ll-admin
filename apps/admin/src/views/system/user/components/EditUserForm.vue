<script setup lang="ts">
import { updateUser, addUser, getUser } from "@/api/system/user";
import { listRole } from "@/api/system/role";
import { listPost } from "@/api/system/post";
import { useDict } from "@/hooks/useDict";
import type { FormInstance, Rule } from "ant-design-vue/es/form";
import $feedback from "@/utils/feedback";

defineOptions({
  name: "EditUserForm"
});

const props = defineProps({
  deptOptions: { type: Array, default: () => [] },
  userId: { type: Number }
});
const $emit = defineEmits(["success", "cancel"]);

const { UserSexEnum, StatusEnum, UserTypeEnum } = toRefs(useDict("UserSexEnum", "StatusEnum", "UserTypeEnum"));

const initPassword = ref(undefined);

const userRef = ref<FormInstance>();
const postOptions = ref([]);
const roleOptions = ref([]);
const data = reactive({
  form: {
    userId: undefined,
    deptId: undefined,
    userName: "",
    nickName: "",
    password: "",
    phonenumber: "",
    email: "",
    sex: "",
    status: "0",
    userType: "00",
    remark: "",
    postIds: [],
    roleIds: []
  },
  rules: {
    userName: [
      { required: true, message: "用户账号不能为空", trigger: "blur" },
      {
        min: 2,
        max: 20,
        message: "用户账号长度必须介于 2 和 20 之间",
        trigger: "blur"
      }
    ],
    nickName: [{ required: true, message: "用户昵称不能为空", trigger: "blur" }],
    password: [
      { required: true, message: "用户密码不能为空", trigger: "blur" },
      {
        min: 5,
        max: 20,
        message: "用户密码长度必须介于 5 和 20 之间",
        trigger: "blur"
      }
    ],
    email: [
      {
        type: "email",
        message: "请输入正确的邮箱地址",
        trigger: ["blur", "change"]
      }
    ],
    phonenumber: [
      { required: true, message: "手机号码不能为空", trigger: "blur" },
      {
        pattern: /^1[3|4|5|6|7|8|9][0-9]\d{8}$/,
        message: "请输入正确的手机号码",
        trigger: "blur"
      }
    ]
  } as Record<string, Rule[]>
});

const { form, rules } = toRefs(data);

async function getInfo() {
  getPostAndRoleAllFn();
  if (props.userId) {
    const { data } = await getUser(props.userId);
    for (const key of Object.keys(form.value)) {
      form.value[key] = data[key];
    }
    form.value.password = "******";
  } else {
    form.value.password = initPassword.value;
  }
}

async function getPostAndRoleAllFn() {
  const resList = await Promise.all([listRole({}), listPost({})]);
  roleOptions.value = resList[0].data.list;
  postOptions.value = resList[1].data.list;
}

/** 提交按钮 */
async function submitForm() {
  try {
    await unref(userRef)?.validate();
  } catch {
    return;
  }
  const flag = form.value.userId != undefined;
  flag ? await updateUser(form.value) : await addUser(form.value);
  $feedback.message.success(flag ? "修改成功" : "新增成功");
  $emit("success");
  $emit("cancel");
}

getInfo();
</script>

<template>
  <div>
    <a-form ref="userRef" :model="form" :rules="rules" :label-col="{ style: { width: '100px' } }">
      <a-row>
        <a-col :span="12">
          <a-form-item label="用户账号" name="userName">
            <a-input v-model:value="form.userName" placeholder="请输入用户账号" :maxlength="30" :disabled="!!form.userId" />
          </a-form-item>
        </a-col>
        <a-col :span="12">
          <a-form-item label="用户密码" name="password">
            <a-input-password
              v-model:value="form.password"
              placeholder="请输入用户密码"
              :maxlength="20"
              :visibility-toggle="!form.userId"
              :disabled="!!form.userId"
            />
          </a-form-item>
        </a-col>
      </a-row>
      <a-row>
        <a-col :span="12">
          <a-form-item label="用户昵称" name="nickName">
            <a-input v-model:value="form.nickName" placeholder="请输入用户昵称" :maxlength="30" />
          </a-form-item>
        </a-col>
        <a-col :span="12">
          <a-form-item label="用户性别">
            <a-select v-model:value="form.sex" placeholder="请选择" :options="UserSexEnum" allow-clear style="width: 100%" />
          </a-form-item>
        </a-col>
      </a-row>
      <a-row>
        <a-col :span="12">
          <a-form-item label="手机号码" name="phonenumber">
            <a-input v-model:value="form.phonenumber" placeholder="请输入手机号码" :maxlength="11" :disabled="!!form.userId" />
          </a-form-item>
        </a-col>
        <a-col :span="12">
          <a-form-item label="邮箱" name="email">
            <a-input v-model:value="form.email" placeholder="请输入邮箱" :maxlength="50" />
          </a-form-item>
        </a-col>
      </a-row>
      <a-row>
        <a-col :span="12">
          <a-form-item label="归属部门" name="deptId">
            <a-tree-select
              v-model:value="form.deptId"
              :tree-data="props.deptOptions"
              :field-names="{ label: 'deptName', value: 'deptId', children: 'children' }"
              placeholder="请选择归属部门"
              tree-default-expand-all
              allow-clear
              style="width: 100%"
            />
          </a-form-item>
        </a-col>
        <a-col :span="12">
          <a-form-item label="岗位">
            <a-select v-model:value="form.postIds" mode="multiple" placeholder="请选择" allow-clear style="width: 100%">
              <a-select-option v-for="item in postOptions" :key="item.postId" :value="item.postId" :disabled="item.status == 1">
                {{ item.postName }}
              </a-select-option>
            </a-select>
          </a-form-item>
        </a-col>
      </a-row>
      <a-row>
        <a-col :span="24">
          <a-form-item label="角色">
            <a-select v-model:value="form.roleIds" mode="multiple" placeholder="请选择" allow-clear style="width: 100%">
              <a-select-option v-for="item in roleOptions" :key="item.roleId" :value="item.roleId" :disabled="item.status == 1">
                {{ item.roleName }}
              </a-select-option>
            </a-select>
          </a-form-item>
        </a-col>
      </a-row>
      <a-row>
        <a-col :span="12">
          <a-form-item label="状态">
            <a-radio-group v-model:value="form.status">
              <a-radio v-for="dict in StatusEnum" :key="dict.value" :value="dict.value">{{ dict.label }}</a-radio>
            </a-radio-group>
          </a-form-item>
        </a-col>
        <a-col :span="12">
          <a-form-item label="用户类型">
            <a-radio-group v-model:value="form.userType">
              <a-radio v-for="dict in UserTypeEnum" :key="dict.value" :value="dict.value">{{ dict.label }}</a-radio>
            </a-radio-group>
          </a-form-item>
        </a-col>
      </a-row>
      <a-row>
        <a-col :span="24">
          <a-form-item label="备注">
            <a-textarea v-model:value="form.remark" placeholder="请输入内容" />
          </a-form-item>
        </a-col>
      </a-row>
    </a-form>
    <div class="flex items-center justify-center">
      <a-space>
        <a-button type="primary" @click="submitForm">确 定</a-button>
        <a-button @click="$emit('cancel')">取 消</a-button>
      </a-space>
    </div>
  </div>
</template>

<style scoped lang="scss"></style>
