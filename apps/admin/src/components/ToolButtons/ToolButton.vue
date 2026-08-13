<script setup lang="ts">
/**
 * 工具栏单按钮
 * 职责：权限外的可见/禁用由 options 控制；props 直接透传 ant-design-vue Button
 */
import { isFunction } from "@llcz/common";
import type { ButtonProps } from "ant-design-vue/es/button";
import { useRenderIcon } from "@/hooks/useRenderIcon";

defineOptions({
  name: "ToolButton"
});

export type BtnOptionsProps<T = any> = {
  btnText: string;
  icon: string;
  /** ant-design-vue Button 属性（type / ghost / danger / size …） */
  props: Partial<ButtonProps>;
  authCode?: string;
  visible?: (data: { row: T }) => boolean;
  disabled?: (data: { row: T }) => boolean;
  handleClick?: (data: { row: T }) => void;
  disabledTooltip?: string;
};

const { options, data } = defineProps<{
  options: BtnOptionsProps;
  data?: any;
}>();

const disabledCom = computed(() => {
  return options.props.disabled || (isFunction(options.disabled) && options.disabled(data));
});

function handleClick() {
  isFunction(options.handleClick) && options.handleClick(data);
}
</script>
<template>
  <div
    v-tippy="{
      content: !disabledCom ? '' : `<p style='color: #ff4d4f' >${options.disabledTooltip}</p>`,
      allowHTML: true,
      theme: 'light'
    }"
  >
    <a-button v-bind="options.props" :disabled="disabledCom" @click.stop="handleClick">
      <template v-if="options.icon" #icon>
        <component :is="useRenderIcon(options.icon, { width: '1em', height: '1em' })" />
      </template>
      <span>{{ options.btnText }}</span>
    </a-button>
  </div>
</template>

<style scoped lang="scss"></style>
