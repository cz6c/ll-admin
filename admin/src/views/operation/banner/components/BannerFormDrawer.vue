<script lang="ts" setup name="BannerFormDrawer">
import { BannerItem } from "@/api/operation/banner/index.d";
import { getBannerInfoApi, createBannerApi, updateBannerApi } from "@/api/operation/banner";
import { FormItem, FormViewInstance } from "@/components/FormView/index.d";
import { $message } from "@/utils/message";

const props = defineProps<{
  id: string;
}>();
const emit = defineEmits<{
  updateList: [];
}>();
const modelValue = defineModel<boolean>();

const formData = reactive({
  hrefUrl: "",
  imgUrl: "",
  sortNum: undefined,
  status: true,
  remark: "",
});
const columns = reactive<FormItem[]>([
  {
    prop: "imgUrl",
    label: "轮播图片",
    required: true,
    type: "upload",
    span: 24,
    props: {
      width: "80px",
      height: "80px",
    },
  },
  {
    prop: "hrefUrl",
    label: "跳转地址",
    type: "input",
    span: 24,
  },
  {
    prop: "sortNum",
    label: "排序",
    type: "input-number",
    span: 24,
  },
  {
    prop: "status",
    label: "状态",
    type: "switch",
    span: 24,
    props: {
      activeText: "启用",
      inactiveText: "禁用",
    },
  },
  {
    prop: "remark",
    label: "备注",
    type: "input",
    props: {
      type: "textarea",
    },
    span: 24,
  },
]);
const formView = ref<FormViewInstance>();

const loading = ref(false);
const sumbit = () => {
  formView.value!.submitForm(async () => {
    if (loading.value) return;
    loading.value = true;
    const json: Partial<BannerItem> = {
      ...formData,
    };
    let api = createBannerApi;
    if (props.id) {
      json.id = props.id;
      api = updateBannerApi;
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
}
/**
 * @description: 获取详情
 */
async function getInfo(id: string) {
  const { data } = await getBannerInfoApi({ id });
  for (const key in formData) {
    (formData as { [key: string]: any })[key] = (data as { [key: string]: any })[key];
  }
}
</script>

<template>
  <el-drawer
    v-model="modelValue"
    :title="`${props.id ? '编辑' : '新增'}轮播图`"
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
