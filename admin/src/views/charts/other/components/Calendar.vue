<script setup lang="ts">
import { ref, Ref, onMounted } from "vue";
import { useEcharts } from "@/hooks/useEcharts";

defineOptions({
  name: "Calendar"
});

withDefaults(
  defineProps<{
    width?: string;
    height?: string;
  }>(),
  {
    width: "100%",
    height: "100%"
  }
);
const chartRef = ref<HTMLDivElement | null>(null);
const { setOptions, echarts } = useEcharts(chartRef as Ref<HTMLDivElement>);

function getVirtualData(year: string) {
  const date = +echarts.time.parse(year + "-01-01");
  const end = +echarts.time.parse(+year + 1 + "-01-01");
  const dayTime = 3600 * 24 * 1000;
  const data: [string, number][] = [];
  for (let time = date; time < end; time += dayTime) {
    data.push([echarts.time.format(time, "{yyyy}-{MM}-{dd}", false), Math.floor(Math.random() * 10000)]);
  }
  return data;
}

onMounted(() => {
  setOptions({
    title: {
      top: 30,
      left: "center",
      text: "Daily Step Count"
    },
    tooltip: {},
    visualMap: {
      min: 0,
      max: 10000,
      type: "piecewise",
      orient: "horizontal",
      left: "center",
      top: 65
    },
    calendar: {
      top: 120,
      left: 30,
      right: 30,
      cellSize: ["auto", 13],
      range: "2016",
      itemStyle: {
        borderWidth: 0.5
      },
      yearLabel: { show: false }
    },
    series: {
      type: "heatmap",
      coordinateSystem: "calendar",
      data: getVirtualData("2016")
    }
  });
});
</script>

<template>
  <div ref="chartRef" :style="{ height, width }" class="chart-view" />
</template>

<style lang="scss" scoped>
.chart-view {
  overflow: hidden;
}
</style>
