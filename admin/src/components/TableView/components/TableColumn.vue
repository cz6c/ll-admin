<template>
  <RenderTableColumn v-bind="props.column" />
</template>

<script setup lang="tsx" name="TableColumn">
import { TableCol, RenderScope, HeaderRenderScope } from "../index.d";
import { formatValue, handleProp, handleRowAccordingToProp } from "@/utils";

const props = defineProps<{ column: TableCol }>();

const slots = useSlots();

// 渲染表格数据
const renderCellData = (item: TableCol, scope: RenderScope<any>) => {
  return formatValue(item.formatter ? item.formatter(scope) : handleRowAccordingToProp(scope.row, item.prop));
};

const RenderTableColumn = (item: TableCol) => {
  return (
    <>
      {
        <el-table-column {...item} align={item.align ?? "center"}>
          {{
            default: (scope: RenderScope<any>) => {
              if (item.render) return item.render(scope);
              if (slots[handleProp(item.prop)]) return slots[handleProp(item.prop)](scope);
              return renderCellData(item, scope);
            },
            header: (scope: HeaderRenderScope<any>) => {
              if (item.headerRender) return item.headerRender(scope);
              return item.label;
            },
          }}
        </el-table-column>
      }
    </>
  );
};
</script>
