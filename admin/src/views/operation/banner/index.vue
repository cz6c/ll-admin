<script setup lang="tsx" name="Banner">
import TableView from "@/components/TableView/index.vue";
import { TableConfig, TableViewInstance } from "@/components/TableView/index.d";
import { useTable } from "@/components/TableView/useTable";
import { getBannerListApi, delBannerApi, statusChangeApi } from "@/api/operation/banner";
import { BannerItem } from "@/api/operation/banner/index.d";
import { $message } from "@/utils/message";
import { dayjs } from "element-plus";
import BannerFormDrawer from "./components/BannerFormDrawer.vue";

const getListApi = getBannerListApi;
const delApi = delBannerApi;
const statusApi = statusChangeApi;

const apiQuery = reactive({
  page: 1,
  limit: 20,
  total: 0,
  name: ""
  // createTime: "",
});

const { loading, tableData, getList, pagination } = useTable({
  getListApi,
  apiQuery
});
getList();

const tableRef = ref<TableViewInstance>();

const tableConfig = reactive<TableConfig<BannerItem>>({
  title: "轮播图列表",
  columns: [
    {
      label: "跳转地址",
      prop: "hrefUrl"
    },
    {
      label: "轮播图片",
      prop: "imgUrl",
      render: ({ row: { imgUrl } }) => <el-image src={imgUrl} />
    },
    {
      label: "备注",
      prop: "remark"
    },
    {
      label: "排序",
      prop: "sortNum"
    },
    {
      label: "创建时间",
      prop: "createTime",
      width: 165,
      formatter: ({ row }) => dayjs(row.createTime).format("YYYY/MM/DD HH:mm:ss")
    },
    {
      label: "上架状态",
      prop: "status",
      render: ({ row }) => <el-switch v-model={row.status} onClick={() => statusChange(row.id)} />
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
  ],
  pagination
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
  ElMessageBox.confirm("确定要删除该轮播图吗?", "删除轮播图", {
    type: "warning"
  })
    .then(async () => {
      try {
        await delApi({ id });
        getList();
        $message.success(`删除成功`);
      } catch (error: any) {
        $message.error(error.message);
      }
    })
    .catch();
}

/**
 * @description: 状态切换
 * @param {*} id
 */
async function statusChange(id: string) {
  try {
    await statusApi({ id });
    $message.success("切换成功");
    getList();
  } catch (error: any) {
    $message.error(error.message);
  }
}
</script>

<template>
  <div class="app-page flex flex-col">
    <div class="cz-card flex-1-hidden px16">
      <TableView ref="tableRef" :data="tableData" :loading="loading" v-bind="tableConfig">
        <template #header-tools>
          <el-button type="primary" @click="goForm()">新增轮播图</el-button>
        </template>
      </TableView>
    </div>
    <BannerFormDrawer :id="nowId" v-model="isEdit" @update-list="getList" />
  </div>
</template>

<style lang="scss" scoped></style>
