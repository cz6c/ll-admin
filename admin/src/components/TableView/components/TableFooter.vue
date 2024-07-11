<script setup lang="ts" name="TableFooter">
import { GetListParams } from "@/api/public/index.d";

export interface Pagination {
  pageQuery: GetListParams;
  handleSizeChange: (size: number) => void;
  handleCurrentChange: (currentPage: number) => void;
}

const props = defineProps<Pagination>();
</script>
<template>
  <div class="table-footer">
    <div>
      <slot></slot>
    </div>
    <!-- 分页组件 -->
    <el-pagination
      :current-page="props.pageQuery.page"
      :page-size="props.pageQuery.limit"
      :total="props.pageQuery.total"
      :page-sizes="[10, 25, 50, 100]"
      layout="total, sizes, prev, pager, next, jumper"
      @size-change="props.handleSizeChange"
      @current-change="props.handleCurrentChange"
    />
  </div>
</template>
<style lang="scss" scoped>
.table-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 50px;
}
</style>
