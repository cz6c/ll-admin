<script setup lang="ts">
import { VxeGridProps } from "vxe-table";

defineOptions({
  name: "Index"
});

interface RowVO {
  id: number;
  name: string;
  role: string;
  sex: string;
  age: number;
  address: string;
}

const gridOptions = reactive<VxeGridProps<RowVO>>({
  border: true,
  height: 500,
  rowConfig: {
    isHover: true
  },
  checkboxConfig: {
    labelField: "name",
    highlight: true
  },
  toolbarConfig: {
    zoom: true,
    custom: true
  },
  pagerConfig: {
    total: 0,
    currentPage: 1,
    pageSize: 10
  },
  columns: [
    { type: "checkbox", title: "Name", width: 300 },
    { field: "id", title: "ID" },
    { field: "age", title: "Age" },
    { field: "address", title: "Address", showOverflow: true }
  ],
  data: [
    { id: 10001, name: "Test1", role: "Develop", sex: "Man", age: 28, address: "test abc" },
    { id: 10002, name: "Test2", role: "Test", sex: "Women", age: 22, address: "Guangzhou" },
    { id: 10003, name: "Test3", role: "PM", sex: "Man", age: 32, address: "Shanghai" },
    { id: 10004, name: "Test4", role: "Designer", sex: "Women", age: 23, address: "test abc" },
    { id: 10005, name: "Test5", role: "Develop", sex: "Women", age: 30, address: "Shanghai" }
  ]
});
</script>

<template>
  <div class="app-page home">
    <vxe-grid v-bind="gridOptions" />
  </div>
</template>

<style scoped lang="scss">
.home {
  blockquote {
    padding: 10px 20px;
    margin: 0 0 20px;
    font-size: 17.5px;
    border-left: 5px solid #eee;
  }
  hr {
    margin-top: 20px;
    margin-bottom: 20px;
    border: 0;
    border-top: 1px solid #eee;
  }
  .col-item {
    margin-bottom: 20px;
  }

  ul {
    padding: 0;
    margin: 0;
  }

  font-family: "open sans", "Helvetica Neue", Helvetica, Arial, sans-serif;
  font-size: 13px;
  color: #676a6c;
  overflow-x: hidden;

  ul {
    list-style-type: none;
  }

  h4 {
    margin-top: 0px;
  }

  h2 {
    margin-top: 10px;
    font-size: 26px;
    font-weight: 100;
  }

  p {
    margin-top: 10px;

    b {
      font-weight: 700;
    }
  }

  .update-log {
    ol {
      display: block;
      list-style-type: decimal;
      margin-block-start: 1em;
      margin-block-end: 1em;
      margin-inline-start: 0;
      margin-inline-end: 0;
      padding-inline-start: 40px;
    }
  }
}
</style>
