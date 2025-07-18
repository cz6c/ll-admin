<script setup lang="ts">
import { updateUser, addUser, getUser } from "@/api/system/user";
import { listRole } from "@/api/system/role";
import { listPost } from "@/api/system/post";
import { useDict } from "@/hooks/useDict";
import { FormInstance, FormRules } from "element-plus";
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

const userRef = ref<FormInstance>(null);
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
  } as FormRules
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
function submitForm() {
  unref(userRef).validate(async valid => {
    if (valid) {
      const flag = form.value.userId != undefined;
      flag ? await updateUser(form.value) : await addUser(form.value);
      $feedback.message.success(flag ? "修改成功" : "新增成功");
      $emit("success");
      $emit("cancel");
    }
  });
}

getInfo();
</script>

<template>
  <div>
    <el-form ref="userRef" :model="form" :rules="rules" label-width="100px">
      <el-row>
        <el-col :span="12">
          <el-form-item label="用户账号" prop="userName">
            <el-input v-model="form.userName" placeholder="请输入用户账号" maxlength="30" :disabled="form.userId" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="用户密码" prop="password">
            <el-input
              v-model="form.password"
              placeholder="请输入用户密码"
              type="password"
              maxlength="20"
              :show-password="!form.userId"
              :disabled="form.userId"
            />
          </el-form-item>
        </el-col>
      </el-row>
      <el-row>
        <el-col :span="12">
          <el-form-item label="用户昵称" prop="nickName">
            <el-input v-model="form.nickName" placeholder="请输入用户昵称" maxlength="30" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="用户性别">
            <el-select v-model="form.sex" placeholder="请选择">
              <el-option v-for="dict in UserSexEnum" :key="dict.value" :label="dict.label" :value="dict.value" />
            </el-select>
          </el-form-item>
        </el-col>
      </el-row>
      <el-row>
        <el-col :span="12">
          <el-form-item label="手机号码" prop="phonenumber">
            <el-input v-model="form.phonenumber" placeholder="请输入手机号码" maxlength="11" :disabled="form.userId" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="邮箱" prop="email">
            <el-input v-model="form.email" placeholder="请输入邮箱" maxlength="50" />
          </el-form-item>
        </el-col>
      </el-row>
      <el-row>
        <el-col :span="12">
          <el-form-item label="归属部门" prop="deptId">
            <el-tree-select
              v-model="form.deptId"
              :data="props.deptOptions"
              :props="{ label: 'deptName', children: 'children' }"
              value-key="deptId"
              placeholder="请选择归属部门"
              check-strictly
            />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="岗位">
            <el-select v-model="form.postIds" multiple placeholder="请选择">
              <el-option v-for="item in postOptions" :key="item.postId" :label="item.postName" :value="item.postId" :disabled="item.status == 1" />
            </el-select>
          </el-form-item>
        </el-col>
      </el-row>
      <el-row>
        <el-col :span="24">
          <el-form-item label="角色">
            <el-select v-model="form.roleIds" multiple placeholder="请选择">
              <el-option v-for="item in roleOptions" :key="item.roleId" :label="item.roleName" :value="item.roleId" :disabled="item.status == 1" />
            </el-select>
          </el-form-item>
        </el-col>
      </el-row>
      <el-row>
        <el-col :span="12">
          <el-form-item label="状态">
            <el-radio-group v-model="form.status">
              <el-radio v-for="dict in StatusEnum" :key="dict.value" :label="dict.label" :value="dict.value" />
            </el-radio-group>
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="用户类型">
            <el-radio-group v-model="form.userType">
              <el-radio v-for="dict in UserTypeEnum" :key="dict.value" :label="dict.label" :value="dict.value" />
            </el-radio-group>
          </el-form-item>
        </el-col>
      </el-row>
      <el-row>
        <el-col :span="24">
          <el-form-item label="备注">
            <el-input v-model="form.remark" type="textarea" placeholder="请输入内容" />
          </el-form-item>
        </el-col>
      </el-row>
    </el-form>
    <div class="flex items-center justify-center">
      <el-button type="primary" @click="submitForm">确 定</el-button>
      <el-button @click="$emit('cancel')">取 消</el-button>
    </div>
  </div>
</template>

<style scoped lang="scss"></style>
