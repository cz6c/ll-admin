<script setup lang="ts">
import { addPost, getPost, updatePost } from "@/api/system/post";
import { useDict } from "@/hooks/useDict";
import type { FormInstance, Rule } from "ant-design-vue/es/form";
import $feedback from "@/utils/feedback";

defineOptions({
  name: "EditPostForm"
});

const props = defineProps({
  postId: { type: Number }
});
const $emit = defineEmits(["success", "cancel"]);

const { StatusEnum } = toRefs(useDict("StatusEnum"));

const postRef = ref<FormInstance>();
const data = reactive({
  form: {
    postId: undefined,
    postCode: undefined,
    postName: undefined,
    postSort: 0,
    status: "0",
    remark: undefined
  },
  rules: {
    postName: [{ required: true, message: "岗位名称不能为空", trigger: "blur" }],
    postCode: [{ required: true, message: "岗位编码不能为空", trigger: "blur" }],
    postSort: [{ required: true, message: "岗位顺序不能为空", trigger: "blur" }]
  } as Record<string, Rule[]>
});

const { form, rules } = toRefs(data);

async function getInfo() {
  if (props.postId) {
    const { data } = await getPost(props.postId);
    for (const key of Object.keys(form.value)) {
      form.value[key] = data[key];
    }
  }
}

/** 提交按钮 */
async function submitForm() {
  try {
    await unref(postRef)?.validate();
  } catch {
    return;
  }
  const flag = form.value.postId != undefined;
  flag ? await updatePost(form.value) : await addPost(form.value);
  $feedback.message.success(flag ? "修改成功" : "新增成功");
  $emit("success");
  $emit("cancel");
}

getInfo();
</script>

<template>
  <div>
    <a-form ref="postRef" :model="form" :rules="rules" :label-col="{ style: { width: '80px' } }">
      <a-form-item label="岗位名称" name="postName">
        <a-input v-model:value="form.postName" placeholder="请输入岗位名称" />
      </a-form-item>
      <a-form-item label="岗位编码" name="postCode">
        <a-input v-model:value="form.postCode" placeholder="请输入编码名称" />
      </a-form-item>
      <a-form-item label="岗位顺序" name="postSort">
        <a-input-number v-model:value="form.postSort" :min="0" />
      </a-form-item>
      <a-form-item label="岗位状态" name="status">
        <a-radio-group v-model:value="form.status">
          <a-radio v-for="dict in StatusEnum" :key="dict.value" :value="dict.value">{{ dict.label }}</a-radio>
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
