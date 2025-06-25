<script setup lang="ts">
import { addPost, getPost, updatePost } from "@/api/system/post";
import { useDict } from "@/hooks/useDict";
import { FormInstance, FormRules } from "element-plus";
import $feedback from "@/utils/feedback";

defineOptions({
  name: "EditPostForm"
});

const props = defineProps({
  postId: { type: Number }
});
const $emit = defineEmits(["success", "cancel"]);

const { StatusEnum } = toRefs(useDict("StatusEnum"));

const postRef = ref<FormInstance>(null);
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
  } as FormRules
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
function submitForm() {
  unref(postRef).validate(async valid => {
    if (valid) {
      const flag = form.value.postId != undefined;
      flag ? await updatePost(form.value) : await addPost(form.value);
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
    <el-form ref="postRef" :model="form" :rules="rules" label-width="80px">
      <el-form-item label="岗位名称" prop="postName">
        <el-input v-model="form.postName" placeholder="请输入岗位名称" />
      </el-form-item>
      <el-form-item label="岗位编码" prop="postCode">
        <el-input v-model="form.postCode" placeholder="请输入编码名称" />
      </el-form-item>
      <el-form-item label="岗位顺序" prop="postSort">
        <el-input-number v-model="form.postSort" controls-position="right" :min="0" />
      </el-form-item>
      <el-form-item label="岗位状态" prop="status">
        <el-radio-group v-model="form.status">
          <el-radio v-for="dict in StatusEnum" :key="dict.value" :label="dict.label" :value="dict.value" />
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
