<script setup lang="ts">
import { getNotice, addNotice, updateNotice } from "@/api/system/notice";
import { useDict } from "@/hooks/useDict";
import { FormInstance, FormRules } from "element-plus";
defineOptions({
  name: "EditNoticeForm"
});
const { proxy } = getCurrentInstance();

const props = defineProps({
  noticeId: { type: Number }
});
const $emit = defineEmits(["success", "cancel"]);

const { StatusEnum, NoticeTypeEnum } = toRefs(useDict("StatusEnum", "NoticeTypeEnum"));

const noticeRef = ref<FormInstance>(null);
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
  } as FormRules
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
function submitForm() {
  unref(noticeRef).validate(async valid => {
    if (valid) {
      const flag = form.value.noticeId != undefined;
      flag ? await updateNotice(form.value) : await addNotice(form.value);
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
    <el-form ref="noticeRef" :model="form" :rules="rules" label-width="80px">
      <el-row>
        <el-col :span="12">
          <el-form-item label="公告标题" prop="noticeTitle">
            <el-input v-model="form.noticeTitle" placeholder="请输入公告标题" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="公告类型" prop="noticeType">
            <el-select v-model="form.noticeType" placeholder="请选择">
              <el-option v-for="dict in NoticeTypeEnum" :key="dict.value" :label="dict.label" :value="dict.value" />
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :span="24">
          <el-form-item label="状态">
            <el-radio-group v-model="form.status">
              <el-radio v-for="dict in StatusEnum" :key="dict.value" :label="dict.label" :value="dict.value" />
            </el-radio-group>
          </el-form-item>
        </el-col>
        <el-col :span="24">
          <el-form-item label="内容">
            <WangEditor v-model="form.noticeContent" height="400px" />
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
