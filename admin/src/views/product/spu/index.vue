<script setup lang="tsx" name="Spu">
import TableView from "@/components/TableView/index.vue";
import { TableConfig, TableViewInstance } from "@/components/TableView/index.d";
import { useTable } from "@/components/TableView/useTable";
import { SearchProps } from "@/components/SearchForm/type";
import { getProductListApi, statusChangeApi, delProductApi } from "@/api/product/spu";
import { ProductItem } from "@/api/product/spu/index.d";
import { dayjs } from "element-plus";

const { proxy } = getCurrentInstance();

const getListApi = getProductListApi;
const delApi = delProductApi;
const statusApi = statusChangeApi;

const router = useRouter();

const searchList = reactive<SearchProps[]>([
  {
    el: "input",
    prop: "name",
    label: "商品名称"
  }
  // {
  //   el: "date-picker",
  //   prop: "createTime",
  //   label: "创建时间",
  //   props: {
  //     type: "date",
  //   },
  // },
]);

const apiQuery = reactive({
  page: 1,
  limit: 20,
  total: 0,
  name: ""
  // createTime: "",
});

const tableRef = ref<TableViewInstance>();

const { loading, tableData, reset, search, getList, pagination } = useTable({
  getListApi,
  apiQuery
});
getList();

const tableConfig = reactive<TableConfig<ProductItem>>({
  title: "商品列表",
  columns: [
    {
      label: "商品名称",
      prop: "name"
    },
    {
      label: "商品编码",
      prop: "spuCode"
    },
    {
      label: "商品主图",
      prop: "mainPictures",
      render: ({ row: { mainPictures } }) => <el-image src={mainPictures[0]} />
    },
    {
      label: "商品描述",
      prop: "desc"
    },
    {
      label: "商品分类",
      prop: "categoryName"
    },
    {
      label: "当前价格",
      prop: "price"
    },
    {
      label: "上架状态",
      prop: "status",
      render: ({ row }) => <el-switch v-model={row.status} onClick={() => statusChange(row.id)} />
    },
    {
      label: "创建时间",
      prop: "createTime",
      width: 160,
      formatter: ({ row }) => dayjs(row.createTime).format("YYYY/MM/DD HH:mm:ss")
    },
    {
      label: "操作",
      prop: "action",
      width: 140,
      fixed: "right",
      render: ({ row }) => (
        <>
          <el-button link type="primary" size="small" onClick={() => goDetails(row.id)}>
            详情
          </el-button>
          <el-button link type="primary" size="small" onClick={() => goForm(row.id)}>
            编辑
          </el-button>
          <el-button link type="danger" size="small" onClick={() => del(row.id)}>
            删除
          </el-button>
        </>
      )
    }
  ],
  pagination
});

/**
 * @description: 编辑
 * @param {*} id
 */
function goForm(id?: string) {
  console.log(1);
  router.push({
    name: "SpuForm",
    query: {
      id
    }
  });
}
function goDetails(id: string) {
  router.push({
    name: "SpuDetails",
    query: {
      id
    }
  });
}

/**
 * @description: 状态切换
 * @param {*} id
 */
async function statusChange(id: string) {
  try {
    await statusApi({ id });
    proxy.$message.success("切换成功");
    getList();
  } catch (error: any) {
    proxy.$message.error(error.message);
  }
}
/**
 * @description: 删除
 * @param {*} id
 */
async function del(id: string) {
  ElMessageBox.confirm("确定要删除该商品吗?", "删除商品", {
    type: "warning"
  })
    .then(async () => {
      try {
        await delApi({ id });
        getList();
        proxy.$message.success(`删除成功`);
      } catch (error: any) {
        proxy.$message.error(error.message);
      }
    })
    .catch();
}
</script>

<template>
  <div class="app-page flex flex-col">
    <div class="cz-card mb-10 p16 pb0">
      <SearchForm :columns="searchList" :search-param="apiQuery" @search="search" @reset="reset" />
    </div>
    <div class="cz-card flex-1-hidden px16">
      <TableView ref="tableRef" :data="tableData" :loading="loading" v-bind="tableConfig">
        <template #header-tools>
          <el-button type="primary" @click="goForm()">新增商品</el-button>
        </template>
      </TableView>
    </div>
  </div>
</template>

<style lang="scss" scoped></style>
