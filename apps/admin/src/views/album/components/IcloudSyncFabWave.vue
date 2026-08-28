<!--
  iCloud 同步 FAB 水波球进度
  职责：echarts-liquidfill 渲染 46px 圆内液体进度，仅下载中使用
  适用：IcloudSyncFab 替换 a-progress circle
-->
<script setup lang="ts">
import type { ECharts, EChartsOption } from "echarts";
import { usePreferredReducedMotion } from "@vueuse/core";

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

/** 液体与波浪配色 */
const palette = computed(() => {
  switch (props.tone) {
    case "success":
      return { colors: ["#52c41e", "#95de64"], border: "#52c41e" };
    case "warning":
      return { colors: ["#faad14", "#ffd666"], border: "#faad14" };
    case "error":
      return { colors: ["#ff4d4f", "#ffa39e"], border: "#ff4d4f" };
    case "default":
      return { colors: ["#bfbfbf", "#d9d9d9"], border: "#8c8c8c" };
    default:
      return { colors: ["#1677ff", "#69b1ff"], border: "#1677ff" };
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
          color: "rgba(0, 0, 0, 0.03)"
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
          insideColor: "#fff"
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
