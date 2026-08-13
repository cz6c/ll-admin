<script setup lang="ts">
import { getNotice, addNotice, updateNotice } from "@/api/system/notice";
import { useDict } from "@/hooks/useDict";
import type { FormInstance, Rule } from "ant-design-vue/es/form";
import $feedback from "@/utils/feedback";

defineOptions({
  name: "EditNoticeForm"
});

const props = defineProps({
  noticeId: { type: Number }
});
const $emit = defineEmits(["success", "cancel"]);

const { StatusEnum, NoticeTypeEnum } = toRefs(useDict("StatusEnum", "NoticeTypeEnum"));

const noticeRef = ref<FormInstance>();
const data = reactive({
  form: {
    noticeId: undefined,
    noticeTitle: undefined,
    noticeType: undefined,
    noticeContent: undefined,
    status: "0"
  },
  rules: {
    noticeTitle: [{ required: true, message: "公告标题不能为空", trigger: "blur" }],
    noticeType: [{ required: true, message: "公告类型不能为空", trigger: "change" }]
  } as Record<string, Rule[]>
});

const { form, rules } = toRefs(data);

async function getInfo() {
  if (props.noticeId) {
    const { data } = await getNotice(props.noticeId);
    for (const key of Object.keys(form.value)) {
      form.value[key] = data[key];
    }
  }
}

/** 提交按钮 */
async function submitForm() {
  try {
    await unref(noticeRef)?.validate();
  } catch {
    return;
  }
  const flag = form.value.noticeId != undefined;
  flag ? await updateNotice(form.value) : await addNotice(form.value);
  $feedback.message.success(flag ? "修改成功" : "新增成功");
  $emit("success");
  $emit("cancel");
}

getInfo();
</script>

<template>
  <div>
    <a-form ref="noticeRef" :model="form" :rules="rules" :label-col="{ style: { width: '80px' } }">
      <a-row>
        <a-col :span="12">
          <a-form-item label="公告标题" name="noticeTitle">
            <a-input v-model:value="form.noticeTitle" placeholder="请输入公告标题" />
          </a-form-item>
        </a-col>
        <a-col :span="12">
          <a-form-item label="公告类型" name="noticeType">
            <a-select v-model:value="form.noticeType" placeholder="请选择" :options="NoticeTypeEnum" allow-clear style="width: 100%" />
          </a-form-item>
        </a-col>
        <a-col :span="24">
          <a-form-item label="状态">
            <a-radio-group v-model:value="form.status">
              <a-radio v-for="dict in StatusEnum" :key="dict.value" :value="dict.value">{{ dict.label }}</a-radio>
            </a-radio-group>
          </a-form-item>
        </a-col>
        <a-col :span="24">
          <a-form-item label="内容">
            <WangEditor v-model="form.noticeContent" height="400px" />
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
