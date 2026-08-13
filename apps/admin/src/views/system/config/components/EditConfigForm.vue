<script setup lang="ts">
import { addConfig, getConfig, updateConfig } from "@/api/system/config";
import { useDict } from "@/hooks/useDict";
import type { FormInstance, Rule } from "ant-design-vue/es/form";
import $feedback from "@/utils/feedback";

defineOptions({
  name: "EditConfigForm"
});

const props = defineProps({
  configId: { type: Number }
});
const $emit = defineEmits(["success", "cancel"]);

const { YesNoEnum } = toRefs(useDict("YesNoEnum"));

const configRef = ref<FormInstance>();
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
  } as Record<string, Rule[]>
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
async function submitForm() {
  try {
    await unref(configRef)?.validate();
  } catch {
    return;
  }
  const flag = form.value.configId != undefined;
  flag ? await updateConfig(form.value) : await addConfig(form.value);
  $feedback.message.success(flag ? "修改成功" : "新增成功");
  $emit("success");
  $emit("cancel");
}

getInfo();
</script>

<template>
  <div>
    <a-form ref="configRef" :model="form" :rules="rules" :label-col="{ style: { width: '80px' } }">
      <a-form-item label="参数名称" name="configName">
        <a-input v-model:value="form.configName" placeholder="请输入参数名称" />
      </a-form-item>
      <a-form-item label="参数键名" name="configKey">
        <a-input v-model:value="form.configKey" placeholder="请输入参数键名" />
      </a-form-item>
      <a-form-item label="参数键值" name="configValue">
        <a-input v-model:value="form.configValue" placeholder="请输入参数键值" />
      </a-form-item>
      <a-form-item label="系统内置" name="configType">
        <a-radio-group v-model:value="form.configType">
          <a-radio v-for="dict in YesNoEnum" :key="dict.value" :value="dict.value">{{ dict.label }}</a-radio>
        </a-radio-group>
      </a-form-item>
      <a-form-item label="备注" name="remark">
        <a-textarea v-model:value="form.remark" placeholder="请输入内容" />
      </a-form-item>
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
