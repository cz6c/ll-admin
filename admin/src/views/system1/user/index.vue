<script setup lang="tsx" name="User">
import TableView from "@/components/TableView/index.vue";
import { TableConfig, TableViewInstance } from "@/components/TableView/index.d";
import { useTable } from "@/components/TableView/useTable";
import { SearchProps } from "@/components/SearchForm/type";
import { getUserListApi, delUserApi } from "@/api/system1/user";
import { UserItem, Gender } from "@/api/system1/user/index.d";
import { $message } from "@/utils/message";
import { dayjs } from "element-plus";
import UserFormDrawer from "./components/UserFormDrawer.vue";

const getListApi = getUserListApi;
const delApi = delUserApi;

const searchList = reactive<SearchProps[]>([
  {
    el: "input",
    prop: "nickname",
    label: "用户昵称",
  },
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
  name: "",
  // createTime: "",
});

const tableRef = ref<TableViewInstance>();

const { loading, tableData, reset, search, getList, pagination } = useTable({
  getListApi,
  apiQuery,
});
getList();

const tableConfig = reactive<TableConfig<UserItem>>({
  title: "用户列表",
  columns: [
    {
      label: "用户账户",
      prop: "username",
    },
    {
      label: "用户昵称",
      prop: "nickname",
    },
    {
      label: "用户头像",
      prop: "avatar",
      render: ({ row: { avatar } }) => <el-image src={avatar} />,
    },
    {
      label: "用户生日",
      prop: "birthday",
    },
    {
      label: "用户性别",
      prop: "gender",
      formatter: ({ row: { gender } }) => Gender[gender],
    },
    {
      label: "用户职位",
      prop: "profession",
    },
    {
      label: "创建时间",
      prop: "createTime",
      width: 165,
      formatter: ({ row }) => dayjs(row.createTime).format("YYYY/MM/DD HH:mm:ss"),
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
      ),
    },
  ],
  pagination,
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
  ElMessageBox.confirm("确定要删除该用户吗?", "删除用户", {
    type: "warning",
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
</script>

<template>
  <div class="app-page flex flex-col">
    <div class="cz-card mb-10 p16 pb0">
      <SearchForm :columns="searchList" :search-param="apiQuery" @search="search" @reset="reset" />
    </div>
    <div class="cz-card flex-1-hidden px16">
      <TableView ref="tableRef" :data="tableData" :loading="loading" showHeader v-bind="tableConfig">
        <template #header-tools>
          <el-button type="primary" @click="goForm()">新增用户</el-button>
        </template>
      </TableView>
    </div>
    <UserFormDrawer :id="nowId" v-model="isEdit" @update-list="getList" />
  </div>
</template>

<style lang="scss" scoped></style>
