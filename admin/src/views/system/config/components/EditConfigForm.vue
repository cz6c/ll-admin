<script setup lang="ts">
import { addConfig, getConfig, updateConfig } from "@/api/system/config";
import { useDict } from "@/hooks/useDict";
import { FormInstance, FormRules } from "element-plus";
defineOptions({
  name: "EditConfigForm"
});
const { proxy } = getCurrentInstance();

const props = defineProps({
  configId: { type: Number }
});
const $emit = defineEmits(["success", "cancel"]);

const { YesNoEnum } = toRefs(useDict("YesNoEnum"));

const configRef = ref<FormInstance>(null);
const data = reactive({
  form: {
    configId: undefined,
    configName: undefined,
    configKey: undefined,
    configValue: undefined,
    configType: "0",
    remark: undefined
  },
  rules: {
    configName: [{ required: true, message: "参数名称不能为空", trigger: "blur" }],
    configKey: [{ required: true, message: "参数键名不能为空", trigger: "blur" }],
    configValue: [{ required: true, message: "参数键值不能为空", trigger: "blur" }]
  } as FormRules
});

const { form, rules } = toRefs(data);

async function getInfo() {
  if (props.configId) {
    const { data } = await getConfig(props.configId);
    for (const key of Object.keys(form.value)) {
      form.value[key] = data[key];
    }
  }
}

/** 提交按钮 */
function submitForm() {
  unref(configRef).validate(async valid => {
    if (valid) {
      const flag = form.value.configId != undefined;
      flag ? await updateConfig(form.value) : await addConfig(form.value);
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
    <el-form ref="configRef" :model="form" :rules="rules" label-width="80px">
      <el-form-item label="参数名称" prop="configName">
        <el-input v-model="form.configName" placeholder="请输入参数名称" />
      </el-form-item>
      <el-form-item label="参数键名" prop="configKey">
        <el-input v-model="form.configKey" placeholder="请输入参数键名" />
      </el-form-item>
      <el-form-item label="参数键值" prop="configValue">
        <el-input v-model="form.configValue" placeholder="请输入参数键值" />
      </el-form-item>
      <el-form-item label="系统内置" prop="configType">
        <el-radio-group v-model="form.configType">
          <el-radio v-for="dict in YesNoEnum" :key="dict.value" :label="dict.label" :value="dict.value" />
        </el-radio-group>
      </el-form-item>
      <el-form-item label="备注" prop="remark">
        <el-input v-model="form.remark" type="textarea" placeholder="请输入内容" />
      </el-form-item>
    </el-form>
    <div class="flex items-center justify-center">
      <el-button type="primary" @click="submitForm">确 定</el-button>
      <el-button @click="$emit('cancel')">取 消</el-button>
    </div>
  </div>
</template>

<style scoped lang="scss"></style>
