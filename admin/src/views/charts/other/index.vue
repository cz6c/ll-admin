<script lang="ts" setup name="Other">
import Bar from "./components/Bar.vue";
import Line from "./components/Line.vue";
import Pie from "./components/Pie.vue";
import Radar from "./components/Radar.vue";
import Calendar from "./components/Calendar.vue";
import Funnel from "./components/Funnel.vue";
</script>

<template>
  <div class="chart-page">
    <Bar class="cz-card" />
    <Line class="cz-card" />
    <Pie class="cz-card" />
    <Radar class="cz-card" />
    <Calendar class="cz-card" />
    <Funnel class="cz-card" />
  </div>
</template>

<style lang="scss" scoped>
.chart-page {
  display: grid;
  grid-template-columns: repeat(2, calc(50% - 10px));
  grid-template-rows: repeat(3, calc(33% - 11px));
  gap: 20px;
  overflow: hidden;
  width: 100%;
  height: 100%;
}
</style>
