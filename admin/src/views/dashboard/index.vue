<script setup lang="ts">
import type { VxeGridProps } from "vxe-table";
import { useTable } from "@/hooks/useVxetable";
import type { ListParams } from "#/api/index.d";
import { BtnOptionsProps } from "@/components/ToolButtons/ToolButton.vue";
defineOptions({
  name: "Index"
});

const getListApi = query => {
  console.log("🚀 ~ getListApi ~ query:", query);
  const { field, order, pageNum, pageSize, name } = query;
  // 模拟接口
  return new Promise<{ data: { list: RowVO[]; total: number } }>(resolve => {
    setTimeout(() => {
      gridOptions.loading = false;
      const mockList = [
        {
          id: 10001,
          name: "Test1",
          nickname: "T1",
          role: "Develop",
          sex: "Man",
          age: 28,
          address: "Shenzhen",
          children: [
            { id: 1000101, name: "Test12", nickname: "T2", role: "Test", sex: "Women", age: 22, address: "Guangzhou" },
            { id: 1000102, name: "Test13", nickname: "T3", role: "PM", sex: "Man", age: 32, address: "Shanghai" },
            {
              id: 1000103,
              name: "Test14",
              nickname: "T4",
              role: "Designer",
              sex: "Women",
              age: 23,
              address: "test abc"
            }
          ]
        },
        {
          id: 10002,
          name: "Test2",
          nickname: "T2",
          role: "Test",
          sex: "Women",
          age: 22,
          address: "Guangzhou",
          children: [
            { id: 1000201, name: "Test22", nickname: "T2", role: "Test", sex: "Women", age: 22, address: "Guangzhou" },
            { id: 1000202, name: "Test23", nickname: "T3", role: "PM", sex: "Man", age: 32, address: "Shanghai" },
            {
              id: 1000203,
              name: "Test24",
              nickname: "T4",
              role: "Designer",
              sex: "Women",
              age: 23,
              address: "test abc"
            }
          ]
        },
        { id: 10003, name: "Test3", nickname: "T3", role: "PM", sex: "Man", age: 32, address: "Shanghai" },
        { id: 10004, name: "Test4", nickname: "T4", role: "Designer", sex: "Women", age: 23, address: "test abc" },
        { id: 10005, name: "Test5", nickname: "T5", role: "Develop", sex: "Women", age: 30, address: "Shanghai" },
        { id: 10006, name: "Test6", nickname: "T6", role: "Designer", sex: "Women", age: 21, address: "Shenzhen" },
        { id: 10007, name: "Test7", nickname: "T7", role: "Test", sex: "Man", age: 29, address: "Shenzhen" },
        { id: 10008, name: "Test8", nickname: "T8", role: "Develop", sex: "Man", age: 35, address: "test abc" },
        { id: 10009, name: "Test9", nickname: "T9", role: "Develop", sex: "Man", age: 35, address: "Shenzhen" },
        { id: 100010, name: "Test10", nickname: "T10", role: "Develop", sex: "Man", age: 35, address: "Guangzhou" },
        { id: 100011, name: "Test11", nickname: "T11", role: "Develop", sex: "Man", age: 49, address: "Guangzhou" },
        { id: 100012, name: "Test12", nickname: "T12", role: "Develop", sex: "Women", age: 45, address: "Shanghai" },
        { id: 100013, name: "Test13", nickname: "T13", role: "Test", sex: "Women", age: 35, address: "Guangzhou" },
        { id: 100014, name: "Test14", nickname: "T14", role: "Test", sex: "Man", age: 29, address: "Shanghai" },
        { id: 100015, name: "Test15", nickname: "T15", role: "Develop", sex: "Man", age: 39, address: "Guangzhou" },
        { id: 100016, name: "Test16", nickname: "T16", role: "Test", sex: "Women", age: 35, address: "Guangzhou" },
        { id: 100017, name: "Test17", nickname: "T17", role: "Test", sex: "Man", age: 39, address: "Shanghai" },
        { id: 100018, name: "Test18", nickname: "T18", role: "Develop", sex: "Man", age: 44, address: "Guangzhou" },
        { id: 100019, name: "Test19", nickname: "T19", role: "Develop", sex: "Man", age: 39, address: "Guangzhou" },
        { id: 100020, name: "Test20", nickname: "T20", role: "Test", sex: "Women", age: 35, address: "Guangzhou" },
        { id: 100021, name: "Test21", nickname: "T21", role: "Test", sex: "Man", age: 39, address: "Shanghai" },
        { id: 100022, name: "Test22", nickname: "T22", role: "Develop", sex: "Man", age: 44, address: "Guangzhou" }
      ];
      let arr = JSON.parse(JSON.stringify(mockList));
      if (name) {
        arr = arr.filter(r => r.name.includes(name));
      }
      if (field && order) {
        arr = mockList.sort((a, b) => {
          if (order === "ascending") {
            return a[field] - b[field];
          } else if (order === "descending") {
            return b[field] - a[field];
          } else {
            return;
          }
        });
      }
      const list = arr.slice((pageNum - 1) * pageSize, pageNum * pageSize);
      console.log("🚀 ~ setTimeout ~ list:", list);
      resolve({
        data: {
          list,
          total: arr.length
        }
      });
    }, 300);
  });
};

interface RowVO {
  id: number;
  name: string;
  role: string;
  sex: string;
  age: number;
  address: string;
}
const gridOptions = reactive<VxeGridProps<RowVO>>({
  height: 500,
  treeConfig: {
    childrenField: "children"
  },
  checkboxConfig: {
    reserve: true
  },
  pagerConfig: {
    total: 0,
    currentPage: 1,
    pageSize: 10
  },
  toolbarConfig: {
    zoom: true,
    custom: true,
    refresh: {
      queryMethod: () => {
        console.log("🚀 ~ refresh:");
        return getTableData();
      }
    }
  },
  columns: [
    {
      treeNode: true,
      title: "treeNode",
      width: 50,
      slots: {
        header: "treeNode_header"
      }
    },
    { type: "checkbox", title: "checked", width: 80 },
    { field: "name", title: "name" },
    { field: "role", title: "role" },
    { field: "sex", title: "sex" },
    { field: "age", title: "Age", sortable: true },
    { field: "address", title: "Address", showOverflow: true },
    {
      title: "操作",
      width: 150,
      slots: {
        default: "tools"
      }
    }
  ],
  data: []
});
const apiQuery = reactive<ListParams & { name: string }>({
  pageNum: null,
  pageSize: null,
  beginTime: null,
  endTime: null,
  orderByColumn: null,
  order: null,
  name: "Test"
});

const { gridRef, gridEvents, expandAll, expandAllChange, selectRows, getTableData } = useTable(
  gridOptions,
  getListApi,
  apiQuery
);
console.log("🚀 ~ gridOptions:", gridOptions);

getTableData();

const rowButtons: BtnOptionsProps<RowVO>[] = [
  {
    type: "primary",
    btnText: "添加",
    btnDisabled: row => {
      return row.name === "Test1";
    },
    btnClick: row => {
      console.log(row);
    },
    showOverflow: true,
    tooltipContent: row => {
      return `<span>添加</span>`;
    }
  },
  {
    type: "warning",
    btnText: "移出",
    btnClick: row => {
      console.log(row);
    },
    showOverflow: true,
    tooltipContent: row => {
      return `移出`;
    }
  }
];
</script>

<template>
  <div class="app-page home">
    <vxe-grid ref="gridRef" v-bind="gridOptions" v-on="gridEvents">
      <template #treeNode_header>
        <el-tooltip effect="dark" :content="expandAll ? '一键折叠' : '一键展开'" placement="top">
          <div>
            <i
              :class="['vxe-tree--node-btn vxe-table-icon-caret-right', expandAll ? 'rotate90' : '']"
              @click="expandAllChange(!expandAll)"
            />
          </div>
        </el-tooltip>
      </template>
      <template #tools="{ row }">
        <ToolButtons :buttons="rowButtons" :row="row" :maxShowNum="1" />
      </template>
    </vxe-grid>
    {{ selectRows.length }}
  </div>
</template>

<style scoped lang="scss">
.vxe-table--render-default .vxe-tree--node-btn {
  display: inline-block;
}
</style>
