<script lang="ts" setup name="MemberFormDrawer">
import { MemberItem } from "@/api/member/user/index.d";
import { getMemberInfoApi, createMemberApi, updateMemberApi } from "@/api/member/user";
import { FormItem, FormViewInstance } from "@/components/FormView/index.d";
import { $message } from "@/utils/message";
import { Gender } from "@/api/system/user/index.d";
import { enumToOpts } from "@/utils";

const props = defineProps<{
  id: string;
}>();
const emit = defineEmits<{
  updateList: [];
}>();
const modelValue = defineModel<boolean>();

const formData = reactive({
  username: "",
  password: "",
  nickname: "",
  avatar: "",
  birthday: undefined,
  gender: 1,
  profession: "",
});
const columns = reactive<FormItem[]>([
  {
    prop: "username",
    label: "会员账户",
    required: true,
    type: "input",
    span: 24,
  },
  {
    prop: "password",
    label: "密码",
    required: true,
    type: "input",
    props: {
      type: "password",
    },
    span: 24,
  },
  {
    prop: "nickname",
    label: "会员昵称",
    type: "input",
    span: 24,
  },
  {
    prop: "avatar",
    label: "会员头像",
    type: "upload",
    span: 24,
    props: {
      width: "80px",
      height: "80px",
    },
  },
  {
    prop: "birthday",
    label: "会员生日",
    type: "date-picker",
    span: 24,
  },
  {
    prop: "gender",
    label: "会员性别",
    type: "select",
    span: 24,
    props: {
      options: enumToOpts(Gender),
    },
  },
  {
    prop: "profession",
    label: "会员职位",
    type: "input",
    span: 24,
  },
]);
const formView = ref<FormViewInstance>();

const loading = ref(false);
const sumbit = () => {
  formView.value!.submitForm(async () => {
    if (loading.value) return;
    loading.value = true;
    const json: Partial<MemberItem> = {
      ...formData,
    };
    let api = createMemberApi;
    if (props.id) {
      json.id = props.id;
      api = updateMemberApi;
    }
    try {
      await api(json);
      loading.value = false;
      $message.success("提交成功");
      emit("updateList");
      modelValue.value = false;
    } catch (error) {
      loading.value = false;
    }
  });
};

function initData() {
  formView.value?.initData();
}

/**
 * @description: 打开
 */
async function handleOpen() {
  initData();
  props.id && getInfo(props.id);
  columns[0].hidden = !!props.id;
  columns[1].hidden = !!props.id;
}
/**
 * @description: 获取详情
 */
async function getInfo(id: string) {
  const { data } = await getMemberInfoApi({ id });
  for (const key in formData) {
    (formData as { [key: string]: any })[key] = (data as { [key: string]: any })[key];
  }
}
</script>

<template>
  <el-drawer
    v-model="modelValue"
    :title="`${props.id ? '编辑' : '新增'}会员`"
    class="cz-drawer"
    size="50%"
    @open="handleOpen"
  >
    <div class="drawer__content">
      <FormView ref="formView" v-model="formData" :columns="columns" />
      <div class="drawer__footer flex flex-justify-end mt-20">
        <el-button @click="modelValue = false">取消</el-button>
        <el-button type="primary" :loading="loading" @click="sumbit">提交</el-button>
      </div>
    </div>
  </el-drawer>
</template>

<style scoped lang="scss"></style>
