<script setup lang="ts">
import { isFunction } from "@llcz/common";
import { ElButton } from "element-plus";
import { useRenderIcon } from "@/hooks/useRenderIcon";

defineOptions({
  name: "ToolButton"
});

type ElButtonProps = Omit<Parameters<(typeof ElButton)["setup"]>[0], "icon">;
export type BtnOptionsProps<T = any> = {
  btnText: string;
  icon: string;
  props: Partial<ElButtonProps>;
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

// 按钮点击事件
function handleClick() {
  isFunction(options.handleClick) && options.handleClick(data);
}
</script>
<template>
  <div>
    <el-tooltip v-if="options.disabledTooltip" effect="light" trigger="hover" placement="top" :enterable="false" :disabled="!disabledCom">
      <template v-slot:content>
        <p style="color: #f56c6c" v-html="options.disabledTooltip" />
      </template>
      <div>
        <el-button v-bind="options.props" :icon="useRenderIcon(options.icon)" :disabled="disabledCom" @click.stop="handleClick">
          {{ options.btnText }}
        </el-button>
      </div>
    </el-tooltip>
    <el-button v-else v-bind="options.props" :icon="useRenderIcon(options.icon)" :disabled="disabledCom" @click.stop="handleClick">
      {{ options.btnText }}
    </el-button>
  </div>
</template>

<style scoped lang="scss"></style>
