<script setup lang="ts">
/**
 * 工具栏按钮组
 * 职责：按权限/可见性渲染 ToolButton；超出 maxShowNum 收进 Popover
 * @note 并排按钮用 a-space（antd 官方间距），勿依赖 Button 自身 margin
 */
defineOptions({
  name: "ToolButtons"
});
import { hasPermission } from "@/directives/modules/permission";
import { BtnOptionsProps } from "./ToolButton.vue";
import { isFunction } from "@llcz/common";
import { useRenderIcon } from "@/hooks/useRenderIcon";

const {
  buttons,
  data,
  maxShowNum,
  size = "small"
} = defineProps<{
  buttons: BtnOptionsProps<any>[];
  data?: { row: any };
  /** 超过几个按钮收入「更多」 */
  maxShowNum?: number;
  /** ant Button size */
  size?: "large" | "middle" | "small";
}>();

const maxShowNumCom = computed(() => maxShowNum || buttons.length);
const moreBtnsCom = computed(() => buttons.slice(maxShowNumCom.value, buttons.length).filter(btn => getBtnVisible(btn)));

const getBtnVisible = (btn: BtnOptionsProps) => {
  return isFunction(btn.visible) ? btn.visible(data) : hasPermission(btn.authCode || "default");
};
</script>
<template>
  <a-space :size="8" align="center" class="action-btns">
    <template v-for="(btn, index) in buttons.slice(0, maxShowNumCom)">
      <ToolButton v-if="getBtnVisible(btn)" :key="index" :options="{ ...btn, props: { ...btn.props, size } }" :data="data" />
    </template>
    <a-popover v-if="moreBtnsCom.length > 0" trigger="hover" placement="leftTop">
      <template #content>
        <a-space direction="vertical" :size="4" class="more-btns">
          <ToolButton
            v-for="(btn, index) in moreBtnsCom"
            :key="index"
            :options="{ ...btn, props: { ...btn.props, size, type: 'text' } }"
            :data="data"
          />
        </a-space>
      </template>
      <a-button :size="size">
        <template #icon>
          <component :is="useRenderIcon('ant-design:appstore-outlined')" />
        </template>
      </a-button>
    </a-popover>
  </a-space>
</template>
