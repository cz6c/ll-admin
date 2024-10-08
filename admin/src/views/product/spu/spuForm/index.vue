<script setup lang="ts">
import { createProductApi, updateProductApi, getProductInfoApi } from "@/api/product/spu";
import { ProductItem } from "@/api/product/spu/index.d";
import GenerateSku from "./components/GenerateSku.vue";
import { useCategory } from "@/views/product/category/useCategory";
import { FormItem, FormViewInstance } from "@/components/FormView/index.d";

defineOptions({
  name: "SpuForm"
});
const { proxy } = getCurrentInstance();

const { options, getCategoryTrees } = useCategory();
getCategoryTrees();

const formData = reactive({
  name: "",
  spuCode: "",
  categoryIds: [],
  desc: "",
  price: undefined,
  mainPictures: [],
  pictures: [],
  status: false,
  specs: [],
  skus: []
});
const columns = reactive<FormItem[]>([
  {
    prop: "name",
    label: "商品名称",
    required: true,
    type: "input"
  },
  {
    prop: "spuCode",
    label: "商品编码",
    required: true,
    type: "input"
  },
  {
    prop: "categoryIds",
    label: "商品分类",
    required: true,
    type: "cascader",
    props: {
      options,
      props: { value: "id", label: "name", checkStrictly: true }
    }
  },
  {
    prop: "price",
    label: "商品价格",
    required: true,
    type: "input-number",
    props: {
      min: 0.01,
      precision: 2
    }
  },
  {
    prop: "status",
    label: "商品状态",
    required: true,
    type: "switch",
    props: {
      // activeValue: 1,
      // inactiveValue: 0,
      activeText: "已上架",
      inactiveText: "已下架"
    }
  },
  {
    prop: "desc",
    label: "商品描述",
    required: true,
    type: "input",
    props: {
      type: "textarea"
    },
    span: 16
  },
  {
    prop: "mainPictures",
    label: "商品主图",
    required: true,
    type: "uploads",
    props: {
      width: "100px",
      height: "100px"
    },
    span: 24
  },
  {
    prop: "pictures",
    label: "商品详情图",
    required: true,
    type: "uploads",
    props: {
      width: "100px",
      height: "100px"
    },
    span: 24
  }
]);
const formView = ref<FormViewInstance>();

const router = useRouter();

const id = computed(() => router.currentRoute.value.query.id || "") as ComputedRef<string>;

const loading = ref(false);
const sumbit = () => {
  formView.value!.submitForm(async () => {
    if (loading.value) return;
    loading.value = true;
    const json: Partial<ProductItem> = {
      ...formData,
      categoryId: formData.categoryIds[formData.categoryIds.length - 1] || 0,
      mainPictures: formData.mainPictures.map(({ url }) => url),
      pictures: formData.pictures.map(({ url }) => url)
    };
    let api = createProductApi;
    if (id.value) {
      json.id = id.value;
      api = updateProductApi;
    }
    try {
      await api(json);
      loading.value = false;
      proxy.$message.success("提交成功");
      router.go(-1);
    } catch (error) {
      loading.value = false;
    }
  });
};

function initData() {
  formView.value!.initData();
}

// 获取详情
async function getInfo(id: string) {
  const { data } = await getProductInfoApi({ id });
  for (const key in formData) {
    if (key === "mainPictures" || key === "pictures") {
      formData[key] = data[key].map(url => ({ url }));
    } else {
      formData[key] = data[key];
    }
  }
}
id.value && getInfo(id.value);
</script>

<template>
  <div class="cz-card">
    <div class="title">基本信息</div>
    <FormView ref="formView" v-model="formData" :columns="columns" />
    <div class="title">规格信息</div>
    <GenerateSku v-model:specs="formData.specs" v-model:skus="formData.skus" />
    <div class="mt-16">
      <el-button :loading="loading" @click="initData()"> 重置 </el-button>
      <el-button type="primary" :loading="loading" @click="sumbit()"> 提交 </el-button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.cz-card {
  padding: 20px;
  box-sizing: border-box;
}
.title {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 16px;
}
</style>
