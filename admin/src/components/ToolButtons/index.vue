<script setup lang="ts">
defineOptions({
  name: "ToolButtons"
});
import { BtnOptionsProps } from "./ToolButton.vue";
import { isFunction } from "@/utils/is";

export type ToolBtnsProps<T = any> = {
  row: T;
  buttons: BtnOptionsProps<T>[];
  // 超过几个按钮显示更多按钮，并把后面的按钮功能放进更多按钮中
  maxShowNum?: number;
  // 按钮布局
  align?: string;
};

const { row, buttons, maxShowNum = 3, align = "center" } = defineProps<ToolBtnsProps>();

const moreBtnsCom = computed(() =>
  buttons.slice(maxShowNum, buttons.length).filter(btn => !(isFunction(btn.btnHide) ? btn.btnHide(row) : btn.btnHide))
);
</script>
<template>
  <div :class="`action-btns ${align}`">
    <ToolButton
      v-for="(btn, index) in buttons.slice(0, maxShowNum)"
      :key="index"
      class="action-btn"
      :options="btn"
      :row="row"
    />
    <!-- maxShowNum后的按钮收起 -->
    <el-popover v-if="moreBtnsCom.length > 0" effect="light" trigger="click" placement="left-start">
      <ToolButton v-for="(btn, index) in moreBtnsCom" :key="index" class="more_btn" :options="btn" :row="row" textBtn />
      <template v-slot:reference>
        <el-button icon="Operation" size="small" />
      </template>
    </el-popover>
  </div>
</template>

<style scoped lang="scss">
.action-btns {
  display: flex;
  align-items: center;
  column-gap: 10px;

  &.lefe {
    justify-content: flex-start;
  }

  &.center {
    justify-content: center;
  }

  &.right {
    justify-content: flex-end;
  }
}

.more_btn {
  width: 100%;
  min-width: 100px;
  margin: 0;
  border: none;
  height: 42px;
  box-sizing: border-box;
  color: #333333;
}
</style>
