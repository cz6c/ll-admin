<script setup lang="tsx">
import { TableConfig, TableViewInstance } from "@/components/TableView";
import { getCategoryTreesApi, delCategoryApi } from "@/api/product/category";
import { CategoryItem } from "@/api/product/category/index.d";
import CategoryFormDrawer from "./components/CategoryFormDrawer.vue";
import { useTable } from "@/components/TableView/useTable";

defineOptions({
  name: "Category"
});
const { proxy } = getCurrentInstance();

const getListApi = getCategoryTreesApi;
const delApi = delCategoryApi;

const { loading, tableData, getList } = useTable({
  getListApi
});
getList();

const tableRef = ref<TableViewInstance>();

const tableConfig = reactive<TableConfig<CategoryItem>>({
  title: "分类列表",
  columns: [
    {
      label: "分类名称",
      prop: "name"
    },
    {
      label: "创建时间",
      prop: "createTime"
    },
    {
      label: "操作",
      prop: "action",
      width: 140,
      fixed: "right",
      render: ({ row }) => (
        <>
          <el-button link type="primary" size="small" onClick={() => goForm(row.id)}>
            编辑
          </el-button>
          <el-button link type="danger" size="small" onClick={() => del(row.id)}>
            删除
          </el-button>
        </>
      )
    }
  ]
});

/**
 * @description: 新增/编辑
 * @param {*} id
 */
const isEdit = ref(false);
const nowId = ref("");
function goForm(id?: string) {
  nowId.value = id || "";
  isEdit.value = true;
}

/**
 * @description: 删除
 * @param {*} id
 */
async function del(id: string) {
  ElMessageBox.confirm("确定删除该分类吗?", "删除分类", {
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
    .catch(() => {
      proxy.$message.info(`Delete canceled`);
    });
}
</script>

<template>
  <div class="app-page cz-card px16">
    <TableView ref="tableRef" :data="tableData" :loading="loading" v-bind="tableConfig">
      <template #header-tools>
        <el-button type="primary" @click="goForm()">新增分类</el-button>
      </template>
    </TableView>
    <CategoryFormDrawer :id="nowId" v-model="isEdit" @update-list="getList" />
  </div>
</template>
