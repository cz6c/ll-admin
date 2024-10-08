<script setup lang="tsx">
import { SpecificationItem, SkuItem } from "@/api/product/spu/index.d";
import { betchDelSkuApi, betchDelSpecsApi } from "@/api/product/spu";
import { isEqual } from "lodash-es";
import UploadImg from "@/components/Upload/UploadImg.vue";
import { TableCol } from "@/components/TableView";
import TableView from "@/components/TableView/index.vue";

defineOptions({
  name: "GenerateSku"
});
const specList = defineModel<SpecificationItem[]>("specs", { required: true });
const skuList = defineModel<SkuItem[]>("skus", { required: true });
const columns: TableCol<SkuItem>[] = [
  {
    label: "sku名称",
    prop: "skuName",
    render: ({ row }) => <el-input style="height: 30px" v-model={row.skuName} />
  },
  {
    label: "sku编码",
    prop: "skuCode",
    render: ({ row }) => <el-input style="height: 30px" v-model={row.skuCode} />
  },
  {
    label: "sku图片",
    prop: "picture",
    // render: ({ row }) => <el-image src={row.picture} />,
    render: ({ row }) => <UploadImg v-model={row.picture} width="80px" height="80px" />
  },
  {
    label: "销售价",
    prop: "price",
    render: ({ row }) => (
      <el-input-number style={"width: 100%; height: 30px"} v-model={row.price} min={0} precision={2} controls={false} />
    )
  },
  {
    label: "库存",
    prop: "inventory",
    render: ({ row }) => (
      <el-input-number style={"width: 100%; height: 30px"} v-model={row.inventory} min={0} controls={false} />
    )
  }
];
const columnss = computed(() => {
  const list = specList.value
    .filter(c => c.name)
    .map((x, index) => ({
      prop: x.name,
      label: x.name,
      render: ({ row }) => row.specVals[index]
    }));
  return [...list, ...columns];
});

/**
 * @description: 笛卡尔积生成sku列表
 * @param {SpecificationItem} specList
 */
function generateSKUs(specList: SpecificationItem[]) {
  const arr = specList.map(x => [x.options.filter(Boolean)]);
  return arr.reduce((pre, cur) => pre.flatMap(x => cur[0].map(y => [...x, y])), [[]]);
}

function handleGenerate() {
  skuList.value = generateSKUs(specList.value).map(specs => {
    const item = skuList.value.find(c => isEqual(c.specVals, specs));
    return (
      item ?? {
        id: undefined,
        price: undefined,
        inventory: undefined,
        skuName: specs.map((spec, i) => `${specList.value[i].name}:${spec}`).join(";"),
        picture: "",
        skuCode: "",
        specVals: specs
      }
    );
  });
}

// 新增规格项
function addSpecItem() {
  if (specList.value.length > 3) return;
  specList.value.push({
    id: undefined,
    name: "",
    options: []
  });
}

// 删除规格项
async function delSpecItem(idx: number) {
  if (specList.value.length > 1) {
    await betchDelSpecsApi({ ids: [specList.value[idx].id] });
    specList.value.splice(idx, 1);
    // 同步更新skuList
    handleGenerate();
  } else {
    const list = skuList.value.filter(c => c.id);
    ElMessageBox.confirm(`sku名称为：${list.map(c => c.skuName).join()}的sku数据，将被删除`, "删除规格项")
      .then(async () => {
        await betchDelSpecsApi({ ids: [specList.value[idx].id] });
        await betchDelSkuApi({ ids: list.map(c => c.id) });
        specList.value.splice(idx, 1);
        // 同步更新skuList
        handleGenerate();
      })
      .catch();
  }
}

// 新增规格值
const optionsInputVal = ref<string[]>([]);
function addSpecOptVal(item: SpecificationItem, idx: number) {
  if (!optionsInputVal.value[idx] || item.options.includes(optionsInputVal.value[idx])) return;
  item.options.push(optionsInputVal.value[idx]);
  optionsInputVal.value[idx] = "";
  // 同步更新skuList
  handleGenerate();
}

// 删除规格值
function delSpecOptVal(item: SpecificationItem, index: number) {
  const list = skuList.value.filter(c => c.id && c.specVals.includes(item.options[index]));
  ElMessageBox.confirm(`sku名称为：${list.map(c => c.skuName).join()}的sku数据，将被删除`, "删除规格值")
    .then(async () => {
      await betchDelSkuApi({ ids: list.map(c => c.id) });
      item.options.splice(index, 1);
      // 同步更新skuList
      handleGenerate();
    })
    .catch();
}

// 修改规格值时同步更新sku的规格数据
const oldVal = ref("");
function specValInputChange(val: string, idx: number) {
  skuList.value.forEach(c => {
    if (c.specVals[idx] === oldVal.value) {
      c.specVals[idx] = val;
    }
  });
  // 同步更新skuList
  handleGenerate();
}
</script>

<template>
  <div class="generate-sku">
    <!-- 规格 -->
    <div v-for="(item, idx) in specList" :key="idx" class="mt-12">
      <div>
        <div class="flex-y-center justify-between bg-#F5F7FA p-10">
          <div class="flex-y-center">
            <span class="flex-60px">规格名：</span>
            <el-input v-model="item.name" />
          </div>
          <el-button class="ml-8" link type="danger" @click="delSpecItem(idx)"> 删除 </el-button>
        </div>
        <div class="flex-y-center flex-wrap p-10">
          <span class="flex-60px">规格值：</span>
          <el-popover v-for="(value, index) in item.options" :key="index" placement="bottom" trigger="hover">
            <template #reference>
              <el-tag style="height: 30px" class="mr-8" closable @close="delSpecOptVal(item, index)">
                {{ value }}
              </el-tag>
            </template>
            <el-input
              v-model="item.options[index]"
              style="width: 126px; height: 30px"
              placeholder="请输入规格值"
              @focus="() => (oldVal = item.options[index])"
              @change="val => specValInputChange(val, idx)"
            />
          </el-popover>
          <el-input
            v-model="optionsInputVal[idx]"
            style="width: 126px; height: 30px"
            placeholder="请输入规格值"
            @change="() => addSpecOptVal(item, idx)"
          />
        </div>
      </div>
    </div>
    <div class="flex-y-center bg-#F5F7FA p-10 mt-12">
      <el-button link type="primary" :disabled="specList.length > 2" @click="addSpecItem"> + 新增规格 </el-button>
    </div>
    <!-- sku列表 -->
    <div class="flex-y-center justify-between mt-20 mb-10 px-10">
      <div class="text-16">sku列表</div>
    </div>
    <TableView :columns="columnss" :data="skuList" border />
  </div>
</template>
