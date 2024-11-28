<script setup lang="ts">
import { isFunction } from "@/utils/is";
import { ElButton } from "element-plus";

defineOptions({
  name: "ToolButton"
});

type ElButtonProps = Parameters<(typeof ElButton)["setup"]>[0];
type TypeOrFn<T, P> = P | ((row: T) => P);
type BtnOptions<T = any> = {
  btnText?: string;
  btnHide?: TypeOrFn<T, boolean>;
  btnDisabled?: TypeOrFn<T, boolean>;
  btnClick?: TypeOrFn<T, void>;
  showOverflow?: boolean;
  tooltipDisabled?: TypeOrFn<T, boolean>;
  tooltipContent?: (row: T) => string;
};
export type BtnOptionsProps<T = any> = Partial<ElButtonProps> & BtnOptions<T>;

const {
  row,
  options,
  textBtn = false
} = defineProps<{
  row: any;
  options: BtnOptionsProps;
  textBtn?: boolean;
}>();

// 按钮点击事件
function btnClick() {
  isFunction(options.btnClick) && options.btnClick(row);
}

// 解析pros 如果是方法取执行后返回值
function AnalysisProp(prop: keyof BtnOptions) {
  return isFunction(prop) ? options[prop](row) : options[prop];
}

console.log(options);
</script>
<template>
  <div v-if="!AnalysisProp('btnHide')">
    <el-tooltip
      v-if="options.showOverflow"
      effect="light"
      trigger="hover"
      placement="top"
      :enterable="false"
      :disabled="AnalysisProp('tooltipDisabled')"
    >
      <template v-slot:content>
        <p v-html="options.tooltipContent(row)" />
      </template>
      <div>
        <el-button
          v-bind="options"
          :size="options.size || 'small'"
          :disabled="options.disabled || AnalysisProp('btnDisabled')"
          :text="textBtn"
          @click.stop="btnClick"
        >
          {{ options.btnText }}
        </el-button>
      </div>
    </el-tooltip>
    <el-button
      v-else
      v-bind="options"
      :size="options.size || 'small'"
      :disabled="options.disabled || AnalysisProp('btnDisabled')"
      :text="textBtn"
      @click.stop="btnClick"
    >
      {{ options.btnText }}
    </el-button>
  </div>
</template>

<style scoped lang="scss"></style>
