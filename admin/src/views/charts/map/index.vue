<script lang="ts" setup name="Map">
import { ref, Ref, onMounted } from "vue";
import { useEcharts } from "@/hooks/useEcharts";
import { registerMap } from "echarts";
import { mapData } from "./data";
import mapJson from "./map.json";

withDefaults(
  defineProps<{
    width: string;
    height: string;
  }>(),
  {
    width: "100%",
    height: "100%"
  }
);
const chartRef = ref<HTMLDivElement | null>(null);
const { setOptions } = useEcharts(chartRef as Ref<HTMLDivElement>);

onMounted(async () => {
  registerMap("china", mapJson as any);
  setOptions({
    visualMap: [
      {
        min: 0,
        max: 1000,
        left: "left",
        top: "bottom",
        text: ["高", "低"],
        calculable: false,
        orient: "horizontal",
        inRange: {
          color: ["#e0ffff", "#006edd"],
          symbolSize: [30, 100]
        }
      }
    ],
    tooltip: {
      trigger: "item",
      backgroundColor: "rgba(0, 0, 0, .6)",
      textStyle: {
        color: "#fff",
        fontSize: 12
      }
    },
    series: [
      {
        name: "iphone4",
        type: "map",
        map: "china",
        label: {
          show: true,
          color: "rgb(249, 249, 249)",
          fontSize: 10
        },
        itemStyle: {
          areaColor: "#2f82ce",
          borderColor: "#0DAAC1"
        },
        data: mapData
      }
    ]
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
