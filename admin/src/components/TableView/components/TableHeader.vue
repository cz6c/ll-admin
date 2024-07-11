<script setup lang="ts" name="TableHeader">
import { CheckboxValueType } from "element-plus/es/components/checkbox";
import { TableCol } from "../index.d";
import { useSortable } from "@/hooks/useSortable";
import { isNullAndUnDef } from "@/utils/is";
import { cloneDeep } from "lodash-es";

const props = defineProps<{
  title: string;
  columns: TableCol[];
}>();
const emits = defineEmits(["update-list", "update-columns"]);

const plainSortOptions = ref<TableCol[]>(props.columns);
const checkedKeys = ref<string[]>([]);
const checkAll = ref(false);
const isIndeterminate = ref(true);

/**
 * @description: 初始化/重置
 */
function init() {
  handleCheckAllChange(true);
}
onMounted(() => {
  init();
});

/**
 * @description: 全选
 * @param {*} val
 */
function handleCheckAllChange(val: CheckboxValueType) {
  checkedKeys.value = val ? unref(plainSortOptions).map(c => c.prop) : [];
  handleCheckedChange(checkedKeys.value);
}
/**
 * @description: 单选
 * @param {*} checkedKeys
 */
function handleCheckedChange(checkedKeys: CheckboxValueType[]) {
  // 判断是否全选
  const checkedCount = checkedKeys.length;
  checkAll.value = checkedCount === unref(plainSortOptions).map(c => c.prop).length;
  isIndeterminate.value = checkedCount > 0 && checkedCount < unref(plainSortOptions).map(c => c.prop).length;
  // 重新排序
  // const arr = checkedKeys as string[];
  // const sortList = unref(plainSortOptions).map(item => item.prop);
  // arr.sort((prev, next) => {
  //   return sortList.indexOf(prev) - sortList.indexOf(next);
  // });
  // setColumns(arr);
  setColumns(checkedKeys as string[]);
}
/**
 * @description: 拖拽排序
 */
nextTick(() => {
  const el = document.querySelectorAll(`.el-checkbox-group`)?.[0] as HTMLElement;
  const { initSortable } = useSortable(el, {
    onEnd: evt => {
      const { oldIndex, newIndex } = evt;
      if (isNullAndUnDef(oldIndex) || isNullAndUnDef(newIndex) || oldIndex === newIndex) {
        return;
      }
      // 排序改变
      const columns = cloneDeep(plainSortOptions.value);
      if (oldIndex > newIndex) {
        columns.splice(newIndex, 0, columns[oldIndex]);
        columns.splice(oldIndex + 1, 1);
      } else {
        columns.splice(newIndex + 1, 0, columns[oldIndex]);
        columns.splice(oldIndex, 1);
      }
      plainSortOptions.value = columns;
      setColumns(columns.filter(item => checkedKeys.value.includes(item.prop!)));
    },
  });
  initSortable();
});

/**
 * @description: 控制浮动固定
 */
function handleItemfixed(key: string, type: string) {
  const item = unref(plainSortOptions).find(c => c.prop === key);
  if (!item) return;
  item.fixed = type;
  setColumns(unref(plainSortOptions));
}
/**
 * @description: 更新columns
 * @param {*} columns
 */
function setColumns(columns: TableCol[] | string[]) {
  const data: TableCol[] = unref(plainSortOptions).map(col => {
    const visible =
      columns.findIndex((c: TableCol | string) => c === col.prop || (typeof c !== "string" && c.prop === col.prop)) !==
      -1;
    return { ...col, visible };
  });
  emits("update-columns", data);
}
</script>

<template>
  <div class="table-header">
    <div class="text-16 font-600">{{ props.title }}</div>
    <div class="flex-y-center">
      <slot name="tools"> </slot>
      <div class="flex pl8">
        <!-- <span class="icon-wrap" @click="emits('update-list')">
          <el-icon><Refresh /></el-icon>
        </span> -->
        <el-popover placement="bottom-start" :width="336" trigger="click" popper-class="setting-popper">
          <template #reference>
            <span class="icon-wrap">
              <el-icon><Setting /></el-icon>
            </span>
          </template>
          <template #default>
            <div class="flex-y-center justify-between">
              <el-checkbox v-model="checkAll" :indeterminate="isIndeterminate" @change="handleCheckAllChange"
                >数据列
              </el-checkbox>
              <el-button type="primary" link @click="init">重置</el-button>
            </div>
            <el-divider />
            <el-checkbox-group v-model="checkedKeys" @change="handleCheckedChange">
              <div class="flex-y-center" v-for="item in plainSortOptions" :key="item.prop">
                <el-icon size="16" class="cursor-move mr-8"><Rank /></el-icon>
                <el-checkbox :label="item.prop">{{ item.label }}</el-checkbox>
                <div class="flex-y-center">
                  <SvgIcon
                    name="fixed-l"
                    size="18"
                    :class="{ on: item.fixed === 'left' }"
                    @click="handleItemfixed(item.prop!, 'left')"
                  />
                  <SvgIcon
                    name="fixed-r"
                    size="18"
                    :class="{ on: item.fixed === 'right' }"
                    @click="handleItemfixed(item.prop!, 'right')"
                  />
                </div>
              </div>
            </el-checkbox-group>
          </template>
        </el-popover>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.table-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 50px;

  .icon-wrap {
    display: flex;
    justify-content: center;
    align-items: center;
    width: 32px;
    height: 32px;
    font-size: 18px;
    cursor: pointer;
  }
}
</style>
<style lang="scss">
.setting-popper {
  .el-checkbox {
    flex: 1;
  }

  .svg-icon {
    color: #c1c1c1;
    cursor: pointer;

    &.on {
      color: var(--el-color-primary);
    }
    & + .svg-icon {
      margin-left: 8px;
    }
  }

  .el-divider {
    margin: 4px 0;
  }
}
</style>
