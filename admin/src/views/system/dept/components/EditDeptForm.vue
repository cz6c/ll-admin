<script setup lang="ts">
import { getDept, addDept, updateDept } from "@/api/system/dept";
import { useDict } from "@/hooks/useDict";
import { FormInstance, FormRules } from "element-plus";

defineOptions({
  name: "EditDeptForm"
});
const { proxy } = getCurrentInstance();

const props = defineProps({
  deptId: { type: Number },
  parentId: { type: Number },
  parentName: { type: String }
});
const $emit = defineEmits(["success", "cancel"]);

const { StatusEnum } = toRefs(useDict("StatusEnum"));

const deptRef = ref<FormInstance>(null);
const data = reactive({
  form: {
    deptId: undefined,
    parentId: undefined,
    deptName: "",
    orderNum: 0,
    leader: "",
    phone: "",
    email: "",
    status: "0",
    parentName: ""
  },
  rules: {
    parentId: [{ required: true, message: "上级部门不能为空", trigger: "blur" }],
    deptName: [{ required: true, message: "部门名称不能为空", trigger: "blur" }],
    orderNum: [{ required: true, message: "显示排序不能为空", trigger: "blur" }],
    leader: [{ required: true, message: "负责人不能为空", trigger: "blur" }],
    email: [
      {
        type: "email",
        message: "请输入正确的邮箱地址",
        trigger: ["blur", "change"]
      }
    ],
    phone: [
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
  if (props.deptId) {
    const { data } = await getDept(props.deptId);
    for (const key of Object.keys(form.value)) {
      form.value[key] = data[key];
    }
  } else {
    form.value.parentId = props.parentId;
    form.value.parentName = props.parentName;
  }
}

/** 提交按钮 */
function submitForm() {
  unref(deptRef).validate(async valid => {
    if (valid) {
      const flag = form.value.deptId != undefined;
      flag ? await updateDept(form.value) : await addDept(form.value);
      proxy.$message.success(flag ? "修改成功" : "新增成功");
      $emit("success");
      $emit("cancel");
    }
  });
}

getInfo();
</script>

<template>
  <div>
    <el-form ref="deptRef" :model="form" :rules="rules" label-width="80px">
      <el-row>
        <el-col :span="24">
          <el-form-item v-if="form.parentName" label="上级部门" prop="parentId">
            {{ form.parentName }}
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="部门名称" prop="deptName">
            <el-input v-model="form.deptName" placeholder="请输入部门名称" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="显示排序" prop="orderNum">
            <el-input-number v-model="form.orderNum" controls-position="right" :min="0" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="负责人" prop="leader">
            <el-input v-model="form.leader" placeholder="请输入负责人" maxlength="20" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="联系电话" prop="phone">
            <el-input v-model="form.phone" placeholder="请输入联系电话" maxlength="11" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="邮箱" prop="email">
            <el-input v-model="form.email" placeholder="请输入邮箱" maxlength="50" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="部门状态">
            <el-radio-group v-model="form.status">
              <el-radio v-for="dict in StatusEnum" :key="dict.value" :label="dict.label" :value="dict.value" />
            </el-radio-group>
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
