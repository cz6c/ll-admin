<script setup lang="ts">
defineOptions({
  name: "ToolButtons"
});
import { hasPermission } from "@/directives/modules/permission";
import { BtnOptionsProps } from "./ToolButton.vue";
import { isFunction } from "@llcz/common";

const {
  buttons,
  data,
  maxShowNum,
  size = "small"
} = defineProps<{
  buttons: BtnOptionsProps<any>[];
  data?: { row: any };
  // 超过几个按钮显示更多按钮，并把后面的按钮功能放进更多按钮中
  maxShowNum?: number;
  // 按钮大小
  size?: "large" | "default" | "small";
}>();

const maxShowNumCom = computed(() => maxShowNum || buttons.length);
const moreBtnsCom = computed(() => buttons.slice(maxShowNumCom.value, buttons.length).filter(btn => getBtnVisible(btn)));

const getBtnVisible = (btn: BtnOptionsProps) => {
  return isFunction(btn.visible) ? btn.visible(data) : hasPermission(btn.authCode || "default");
};
</script>
<template>
  <div class="action-btns">
    <template v-for="(btn, index) in buttons.slice(0, maxShowNumCom)">
      <ToolButton v-if="getBtnVisible(btn)" :key="index" class="action-btn" :options="{ ...btn, props: { ...btn.props, size } }" :data="data" />
    </template>
    <!-- maxShowNum后的按钮收起 -->
    <el-popover v-if="moreBtnsCom.length > 0" effect="light" trigger="hover" placement="left-start">
      <ToolButton v-for="(btn, index) in moreBtnsCom" :key="index" :options="{ ...btn, props: { ...btn.props, size, text: true } }" :data="data" />
      <template v-slot:reference>
        <el-button icon="Operation" :size="size" />
      </template>
    </el-popover>
  </div>
</template>

<style scoped lang="scss">
.action-btns {
  display: flex;
  align-items: center;
  column-gap: 10px;
}
</style>
