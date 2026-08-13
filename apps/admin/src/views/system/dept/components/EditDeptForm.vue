<script setup lang="ts">
import { getDept, addDept, updateDept } from "@/api/system/dept";
import { useDict } from "@/hooks/useDict";
import type { FormInstance, Rule } from "ant-design-vue/es/form";
import $feedback from "@/utils/feedback";

defineOptions({
  name: "EditDeptForm"
});

const props = defineProps({
  deptId: { type: Number },
  parentId: { type: Number },
  parentName: { type: String }
});
const $emit = defineEmits(["success", "cancel"]);

const { StatusEnum } = toRefs(useDict("StatusEnum"));

const deptRef = ref<FormInstance>();
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
  } as Record<string, Rule[]>
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
async function submitForm() {
  try {
    await unref(deptRef)?.validate();
  } catch {
    return;
  }
  const flag = form.value.deptId != undefined;
  flag ? await updateDept(form.value) : await addDept(form.value);
  $feedback.message.success(flag ? "修改成功" : "新增成功");
  $emit("success");
  $emit("cancel");
}

getInfo();
</script>

<template>
  <div>
    <a-form ref="deptRef" :model="form" :rules="rules" :label-col="{ style: { width: '80px' } }">
      <a-row>
        <a-col :span="24">
          <a-form-item v-if="form.parentName" label="上级部门" name="parentId">
            {{ form.parentName }}
          </a-form-item>
        </a-col>
        <a-col :span="12">
          <a-form-item label="部门名称" name="deptName">
            <a-input v-model:value="form.deptName" placeholder="请输入部门名称" />
          </a-form-item>
        </a-col>
        <a-col :span="12">
          <a-form-item label="显示排序" name="orderNum">
            <a-input-number v-model:value="form.orderNum" :min="0" />
          </a-form-item>
        </a-col>
        <a-col :span="12">
          <a-form-item label="负责人" name="leader">
            <a-input v-model:value="form.leader" placeholder="请输入负责人" :maxlength="20" />
          </a-form-item>
        </a-col>
        <a-col :span="12">
          <a-form-item label="联系电话" name="phone">
            <a-input v-model:value="form.phone" placeholder="请输入联系电话" :maxlength="11" />
          </a-form-item>
        </a-col>
        <a-col :span="12">
          <a-form-item label="邮箱" name="email">
            <a-input v-model:value="form.email" placeholder="请输入邮箱" :maxlength="50" />
          </a-form-item>
        </a-col>
        <a-col :span="12">
          <a-form-item label="部门状态">
            <a-radio-group v-model:value="form.status">
              <a-radio v-for="dict in StatusEnum" :key="dict.value" :value="dict.value">{{ dict.label }}</a-radio>
            </a-radio-group>
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
