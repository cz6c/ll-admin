<script setup lang="ts">
import { ref, Ref, onMounted } from "vue";
import { useEcharts } from "@/hooks/useEcharts";

defineOptions({
  name: "Funnel"
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
const { setOptions } = useEcharts(chartRef as Ref<HTMLDivElement>);

onMounted(() => {
  setOptions({
    title: {
      text: "Funnel"
    },
    tooltip: {
      trigger: "item",
      formatter: "{a} <br/>{b} : {c}%"
    },
    legend: {
      data: ["Show", "Click", "Visit", "Inquiry", "Order"]
    },
    series: [
      {
        name: "Funnel",
        type: "funnel",
        left: "10%",
        top: 60,
        bottom: 0,
        width: "80%",
        min: 0,
        max: 100,
        minSize: "0%",
        maxSize: "100%",
        sort: "descending",
        gap: 2,
        label: {
          show: true,
          position: "inside"
        },
        labelLine: {
          length: 10,
          lineStyle: {
            width: 1,
            type: "solid"
          }
        },
        itemStyle: {
          borderColor: "#fff",
          borderWidth: 1
        },
        emphasis: {
          label: {
            fontSize: 20
          }
        },
        data: [
          { value: 60, name: "Visit" },
          { value: 40, name: "Inquiry" },
          { value: 20, name: "Order" },
          { value: 80, name: "Click" },
          { value: 100, name: "Show" }
        ]
      }
    ]
  });
});
</script>

<template>
  <div ref="chartRef" :style="{ height, width }" class="chart-view" />
</template>

<style lang="scss" scoped></style>
