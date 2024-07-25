<script lang="ts" setup name="Bar">
import { ref, Ref, onMounted } from "vue";
import { useEcharts } from "@/hooks/useEcharts";

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

onMounted(() => {
  setOptions({
    xAxis: {
      type: "category",
      data: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    },
    yAxis: {
      type: "value"
    },
    series: [
      {
        data: [120, 200, 150, 80, 70, 110, 130],
        type: "bar"
      }
    ]
  });
});
</script>

<template>
  <div ref="chartRef" :style="{ height, width }" class="chart-view" />
</template>

<style lang="scss" scoped></style>
