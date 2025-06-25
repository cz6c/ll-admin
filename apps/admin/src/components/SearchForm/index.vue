<script setup lang="ts">
import { SearchProps } from "./type";
import { BreakPoint } from "@/components/Grid/type";
import { Delete, Search, ArrowDown, ArrowUp } from "@element-plus/icons-vue";
import SearchFormItem from "./components/SearchFormItem.vue";
import Grid from "@/components/Grid/index.vue";
import GridItem from "@/components/Grid/components/GridItem.vue";

defineOptions({
  name: "SearchForm"
});

interface Props {
  columns?: SearchProps[]; // 搜索配置列
  searchParam?: { [key: string]: any }; // 搜索参数
  searchCol?: Record<BreakPoint, number>;
}

// 默认值
const props = withDefaults(defineProps<Props>(), {
  columns: () => [],
  searchParam: () => ({}),
  searchCol: () => ({ xs: 1, sm: 2, md: 2, lg: 3, xl: 4 })
});

defineEmits(["search", "reset"]);

// 是否默认折叠搜索项
const collapsed = ref(true);

// 获取响应式断点
const gridRef = ref();
const breakPoint = computed<BreakPoint>(() => gridRef.value?.breakPoint);

// 判断是否显示 展开/合并 按钮
const showCollapse = computed(() => {
  let show = false;
  props.columns.reduce((prev, current) => {
    prev += (current?.span ?? 1) + (current?.offset ?? 0);
    if (typeof props.searchCol !== "number") {
      if (prev >= props.searchCol[breakPoint.value]) show = true;
    } else {
      if (prev >= props.searchCol) show = true;
    }
    return prev;
  }, 0);
  return show;
});
</script>
<template>
  <el-form v-if="columns.length" ref="formRef" :model="searchParam">
    <Grid ref="gridRef" :collapsed="collapsed" :gap="[20, 0]" :cols="searchCol">
      <GridItem v-for="(item, index) in columns" :key="item.prop" v-bind="item" :index="index">
        <el-form-item :label="`${item.label} :`">
          <SearchFormItem :column="item" :search-param="searchParam" />
        </el-form-item>
      </GridItem>
      <GridItem suffix>
        <div class="operation">
          <el-button type="primary" :icon="Search" @click="$emit('search')">搜索</el-button>
          <el-button :icon="Delete" @click="$emit('reset')">重置</el-button>
          <el-button v-if="showCollapse" type="primary" link class="search-isOpen" @click="collapsed = !collapsed">
            {{ collapsed ? "展开" : "合并" }}
            <el-icon class="el-icon--right">
              <component :is="collapsed ? ArrowDown : ArrowUp" />
            </el-icon>
          </el-button>
        </div>
      </GridItem>
    </Grid>
  </el-form>
</template>
<style lang="scss" scoped>
.el-form {
  .el-form-item__content > * {
    width: 100%;
  }

  // 去除时间选择器上下 padding
  .el-range-editor.el-input__wrapper {
    padding: 0 10px;
  }
}

.operation {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  margin-bottom: 18px;
}
</style>
