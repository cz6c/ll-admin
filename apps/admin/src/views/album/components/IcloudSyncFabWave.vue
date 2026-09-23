<!--
  iCloud 下载 FAB 水波球进度
  职责：echarts-liquidfill 渲染 46px 圆内液体进度，仅下载中使用
  适用：IcloudSyncFab 替换 a-progress circle
-->
<script setup lang="ts">
import type { ECharts, EChartsOption } from "echarts";
import { usePreferredReducedMotion } from "@vueuse/core";
import {
  COLOR_BG_LAYOUT,
  COLOR_ERROR,
  COLOR_ERROR_HOVER,
  COLOR_FILL_TERTIARY,
  COLOR_NEUTRAL,
  COLOR_NEUTRAL_BG,
  COLOR_NEUTRAL_BORDER,
  COLOR_PRIMARY,
  COLOR_SUCCESS,
  COLOR_SUCCESS_HOVER,
  COLOR_WARNING,
  COLOR_WARNING_HOVER
} from "@/utils/theme";

defineOptions({ name: "IcloudSyncFabWave" });

/** FAB 状态色，与 fabState.color 对齐；processing 等同 primary */
type FabWaveTone = "primary" | "processing" | "success" | "warning" | "error" | "default";

const props = withDefaults(
  defineProps<{
    /** 0–100 下载进度 */
    percent: number;
    tone?: FabWaveTone;
    /** 画布边长，默认适配 58px FAB 内圈 */
    size?: number;
  }>(),
  {
    tone: "primary",
    size: 46
  }
);

const chartRef = ref<HTMLDivElement | null>(null);
let chart: ECharts | null = null;

const reducedMotion = usePreferredReducedMotion();

/** 液体与波浪配色（ECharts 需 hex，走 theme.ts） */
const palette = computed(() => {
  switch (props.tone) {
    case "success":
      return { colors: [COLOR_SUCCESS, COLOR_SUCCESS_HOVER], border: COLOR_SUCCESS };
    case "warning":
      return { colors: [COLOR_WARNING, COLOR_WARNING_HOVER], border: COLOR_WARNING };
    case "error":
      return { colors: [COLOR_ERROR, COLOR_ERROR_HOVER], border: COLOR_ERROR };
    case "default":
      return { colors: [COLOR_NEUTRAL_BG, COLOR_NEUTRAL_BORDER], border: COLOR_NEUTRAL };
    default:
      return { colors: [COLOR_PRIMARY, COLOR_PRIMARY], border: COLOR_PRIMARY };
  }
});

const percentLabel = computed(() => `${Math.min(100, Math.max(0, Math.round(props.percent)))}%`);

/** 居中百分比字号，随球体缩放 */
const labelFontSize = computed(() => Math.max(8, Math.round(props.size * 0.28)));

/**
 * 构建 liquidFill 配置；小尺寸降低波幅避免糊成一块
 */
function buildOption(): EChartsOption {
  const main = Math.min(1, Math.max(0, props.percent / 100));
  const sub = Math.max(0, main - 0.04);
  const { colors, border } = palette.value;
  const waveAnimation = reducedMotion.value !== "reduce";

  return {
    series: [
      {
        type: "liquidFill",
        data: sub > 0 ? [main, sub] : [main],
        shape: "circle",
        radius: "92%",
        amplitude: 3,
        waveLength: "115%",
        waveAnimation,
        animationDurationUpdate: waveAnimation ? 420 : 0,
        direction: "right",
        outline: {
          show: true,
          borderDistance: 0,
          itemStyle: {
            borderWidth: 1,
            borderColor: border,
            shadowBlur: 0
          }
        },
        backgroundStyle: {
          color: COLOR_FILL_TERTIARY
        },
        itemStyle: {
          opacity: 0.92,
          shadowBlur: 0
        },
        label: {
          show: true,
          formatter: () => percentLabel.value,
          fontSize: labelFontSize.value,
          color: border,
          insideColor: COLOR_BG_LAYOUT
        },
        color: colors
      }
    ]
  } as EChartsOption;
}

/** 懒加载 echarts + liquidfill，避免非 Tauri  Web 首屏无谓体积 */
async function ensureChart() {
  const el = chartRef.value;
  if (!el) return;

  if (!chart) {
    const echarts = await import("echarts");
    await import("echarts-liquidfill");
    chart = echarts.init(el, undefined, { renderer: "canvas" });
  }
  chart.setOption(buildOption(), true);
}

watch(
  () => [props.percent, props.tone, reducedMotion.value] as const,
  () => {
    chart?.setOption(buildOption(), true);
  }
);

onMounted(() => {
  void ensureChart();
});

onUnmounted(() => {
  chart?.dispose();
  chart = null;
});
</script>

<template>
  <div ref="chartRef" class="fab-wave" :style="{ width: `${size}px`, height: `${size}px` }" :aria-label="percentLabel" role="img" />
</template>

<style scoped lang="scss">
.fab-wave {
  flex-shrink: 0;
  pointer-events: none;
}
</style>
