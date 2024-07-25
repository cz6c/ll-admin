<script lang="ts" setup name="CategoryFormDrawer">
import { CategoryItem } from "@/api/product/category/index.d";
import { getCategoryInfoApi, createCategoryApi, updateCategoryApi } from "@/api/product/category";
import { useCategory } from "../useCategory";
import { FormItem, FormViewInstance } from "@/components/FormView/index.d";
import { $message } from "@/utils/message";

const { options, getCategoryTrees } = useCategory();

const formData = reactive({
  name: "",
  parentIds: []
});
const columns = reactive<FormItem[]>([
  {
    prop: "name",
    label: "分类名称",
    required: true,
    type: "input",
    span: 24
  },
  {
    prop: "parentIds",
    label: "上级分类",
    type: "cascader",
    props: {
      options,
      props: { value: "id", label: "name", checkStrictly: true }
    },
    span: 24
  }
]);
const formView = ref<FormViewInstance>();

const loading = ref(false);
const sumbit = () => {
  formView.value!.submitForm(async () => {
    if (loading.value) return;
    loading.value = true;
    const json: Partial<CategoryItem> = {
      ...formData,
      parentId: formData.parentIds[formData.parentIds.length - 1] || 0
    };
    let api = createCategoryApi;
    if (props.id) {
      json.id = props.id;
      api = updateCategoryApi;
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
  formView.value!.initData();
}

const props = defineProps<{
  id: string;
}>();
const emit = defineEmits<{
  updateList: [];
}>();
const modelValue = defineModel<boolean>();

/**
 * @description: 打开
 */
async function handleOpen() {
  initData();
  getCategoryTrees();
  props.id && getInfo(props.id);
}
/**
 * @description: 获取详情
 */
async function getInfo(id: string) {
  const { data } = await getCategoryInfoApi({ id });
  for (const key in formData) {
    (formData as { [key: string]: any })[key] = (data as { [key: string]: any })[key];
  }
}
</script>

<template>
  <el-drawer
    v-model="modelValue"
    :title="`${props.id ? '编辑' : '新增'}分类`"
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
../useCategory
