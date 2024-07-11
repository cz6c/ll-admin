<script lang="ts" setup name="Pie">
import { ref, Ref, onMounted } from "vue";
import { useEcharts } from "@/hooks/useEcharts";

withDefaults(
  defineProps<{
    width: string;
    height: string;
  }>(),
  {
    width: "100%",
    height: "100%",
  },
);
const chartRef = ref<HTMLDivElement | null>(null);
const { setOptions } = useEcharts(chartRef as Ref<HTMLDivElement>);

onMounted(() => {
  setOptions({
    title: {
      text: "Referer of a Website",
      subtext: "Fake Data",
      left: "center",
    },
    tooltip: {
      trigger: "item",
    },
    legend: {
      orient: "vertical",
      left: "left",
    },
    series: [
      {
        name: "Access From",
        type: "pie",
        radius: "50%",
        data: [
          { value: 1048, name: "Search Engine" },
          { value: 735, name: "Direct" },
          { value: 580, name: "Email" },
          { value: 484, name: "Union Ads" },
          { value: 300, name: "Video Ads" },
        ],
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowOffsetX: 0,
            shadowColor: "rgba(0, 0, 0, 0.5)",
          },
        },
      },
    ],
  });
});
</script>

<template>
  <div ref="chartRef" :style="{ height, width }" class="chart-view"></div>
</template>

<style lang="scss" scoped></style>
