<script lang="ts" setup name="Radar">
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
    title: {
      text: "Proportion of Browsers",
      subtext: "Fake Data",
      top: 10,
      left: 10
    },
    tooltip: {
      trigger: "item"
    },
    legend: {
      type: "scroll",
      bottom: 10,
      data: (function () {
        var list: string[] = [];
        for (var i = 1; i <= 28; i++) {
          list.push(i + 2000 + "");
        }
        return list;
      })()
    },
    visualMap: {
      top: "middle",
      right: 10,
      color: ["red", "yellow"],
      calculable: true
    },
    radar: {
      indicator: [
        { text: "IE8-", max: 400 },
        { text: "IE9+", max: 400 },
        { text: "Safari", max: 400 },
        { text: "Firefox", max: 400 },
        { text: "Chrome", max: 400 }
      ]
    },
    series: (function () {
      var series = [];
      for (var i = 1; i <= 28; i++) {
        series.push({
          type: "radar",
          symbol: "none",
          lineStyle: {
            width: 1
          },
          emphasis: {
            areaStyle: {
              color: "rgba(0,250,0,0.3)"
            }
          },
          data: [
            {
              value: [(40 - i) * 10, (38 - i) * 4 + 60, i * 5 + 10, i * 9, (i * i) / 2],
              name: i + 2000 + ""
            }
          ]
        });
      }
      return series;
    })()
  });
});
</script>

<template>
  <div ref="chartRef" :style="{ height, width }" class="chart-view" />
</template>

<style lang="scss" scoped></style>
