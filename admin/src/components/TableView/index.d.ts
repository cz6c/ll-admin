import { VNode, ComponentPublicInstance } from "vue";
import { TableColumnCtx } from "element-plus/es/components/table/src/table-column/defaults";
import { TableProps } from "./index.vue";
import TableView from "./index.vue";

export type RenderScope<T> = {
  row: T;
  $index: number;
  column: TableColumnCtx<T>;
};

export type HeaderRenderScope<T> = {
  $index: number;
  column: TableColumnCtx<T>;
};

// 表格子项配置
export interface TableCol<T = any>
  extends Partial<Omit<TableColumnCtx<T>, "renderCell" | "renderHeader" | "formatter">> {
  prop: string; // 列的key ==>必传 并且确保唯一性
  type?: "expand";
  visible?: boolean; // 控制列显隐 需配合TabelHeader组件使用
  headerRender?: (scope: HeaderRenderScope<T>) => VNode; // 自定义表头内容渲染（tsx语法）
  render?: (scope: RenderScope<T>) => VNode | string; // 自定义单元格内容渲染（tsx语法）
  formatter?: (scope: RenderScope<T>) => VNode | string; // 用来格式化内容
}

export type TableViewInstance = Omit<InstanceType<typeof TableView>, keyof ComponentPublicInstance | keyof TableProps>;

export type TableConfig<T> = Omit<TableProps<T>, "data" | "loading">;
