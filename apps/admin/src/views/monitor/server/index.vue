<template>
  <div ref="printRef" class="app-page">
    <!-- <a-button @click="print">打印</a-button> -->
    <a-card>
      <template #title>
        <span class="flex-center"><IconifyIcon class="mr-1" icon="ant-design:desktop-outlined" />服务器信息</span>
        <a-row v-if="server.sys" :gutter="10" class="mt-4">
          <a-col :span="6"> 服务器名称：{{ server.sys.computerName }} </a-col>
          <a-col :span="6"> 部署目录：{{ server.sys.userDir }} </a-col>
          <a-col :span="6"> 操作系统：{{ server.sys.osName }}-{{ server.sys.osArch }} </a-col>
          <a-col :span="6"> 服务器IP：{{ server.sys.computerIp }} </a-col>
        </a-row>
      </template>

      <a-row :gutter="10">
        <a-col v-if="server.cpu" :span="8">
          <div class="flex-col-center">
            CPU使用率
            <a-progress
              type="circle"
              :percent="+server.cpu.usage"
              :stroke-color="server.cpu.usage > 85 ? '#ff4d4f' : 100 - server.cpu.usage > 70 ? '#faad14' : '#52c41a'"
            />
            CPU-{{ server.cpu.cpuNum }}核
          </div>
        </a-col>
        <a-col v-if="server.mem" :span="8">
          <div class="flex-col-center">
            内存使用率
            <a-progress
              type="circle"
              :percent="+server.mem.usage"
              :stroke-color="server.mem.usage > 85 ? '#ff4d4f' : server.mem.usage > 70 ? '#faad14' : '#52c41a'"
            />
            {{ server.mem.used }}/{{ server.mem.total }}GB
          </div>
        </a-col>
        <a-col v-if="server.sysFiles" :span="8">
          <div class="flex-col-center">
            磁盘使用率
            <a-progress
              type="circle"
              :percent="+server.sysFiles.usage"
              :stroke-color="server.sysFiles.usage > 85 ? '#ff4d4f' : server.sysFiles.usage > 70 ? '#faad14' : '#52c41a'"
            />
            {{ server.sysFiles.used }}/{{ server.sysFiles.total }}GB
          </div>
        </a-col>
      </a-row>
    </a-card>

    <a-card class="mt-4">
      <template #title>
        <span class="flex-center"><IconifyIcon class="mr-1" icon="ant-design:database-outlined" />redis信息</span>
        <a-row v-if="cache.info" :gutter="10" class="mt-4">
          <a-col :span="6"> Redis版本：{{ cache.info.redis_version }} </a-col>
          <a-col :span="6"> 端口：{{ cache.info.tcp_port }} </a-col>
          <a-col :span="6"> 运行时间(天)：{{ cache.info.uptime_in_days }} </a-col>
          <a-col :span="6"> 客户端数：{{ cache.info.connected_clients }} </a-col>
          <a-col :span="6"> 内存总量：{{ cache.info.used_memory_rss }} </a-col>
          <a-col :span="6"> 内存峰值：{{ cache.info.used_memory }} </a-col>
          <a-col :span="6"> 查找数据库键成功的次数：{{ cache.info.keyspace_hits }} </a-col>
          <a-col :span="6"> 查找数据库键失败的次数：{{ cache.info.keyspace_misses }} </a-col>
        </a-row>
      </template>
      <div ref="commandstats" style="height: 360px" />
    </a-card>
  </div>
</template>

<script setup>
/**
 * 服务监控
 * 职责：展示主机 CPU/内存/磁盘与 Redis 命令统计图
 * 适用：monitor/server
 */
import { getServer } from "@/api/monitor/server";
import { getCache } from "@/api/monitor/cache";
import Print from "@/utils/print";
import $feedback from "@/utils/feedback";
import { useEcharts } from "@/hooks/useEcharts";

const server = ref({});

function getServerInfo() {
  $feedback.loading("正在加载服务监控数据，请稍候！");
  getServer().then(response => {
    console.log(response);
    server.value = response.data;
    $feedback.closeLoading();
  });
}
getServerInfo();

const cache = ref({
  dbSize: 0,
  info: null,
  commandStats: []
});
const commandstats = ref(null);
const { setOptions } = useEcharts(commandstats);

function getCacheInfo() {
  $feedback.loading("正在加载缓存监控数据，请稍候！");
  getCache().then(response => {
    $feedback.closeLoading();
    cache.value = response.data;

    setOptions({
      tooltip: {
        trigger: "item",
        formatter: "{a} <br/>{b} : {c} ({d}%)"
      },
      series: [
        {
          name: "命令",
          type: "pie",
          roseType: "radius",
          radius: "100%",
          center: ["50%", "50%"],
          data: response.data.commandStats,
          animationEasing: "cubicInOut",
          animationDuration: 1000
        }
      ]
    });
  });
}
getCacheInfo();

const printRef = ref(null);
const print = () => {
  new Print(printRef.value);
};
</script>
