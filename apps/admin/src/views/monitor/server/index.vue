<template>
  <div ref="printRef" class="app-page">
    <!-- <el-button @click="print">打印</el-button> -->
    <el-card>
      <template #header>
        <span class="flex-center"><IconifyIcon class="mr-1" icon="ep:monitor" />服务器信息</span>
        <el-row v-if="server.sys" :gutter="10" class="mt-4">
          <el-col :span="6"> 服务器名称：{{ server.sys.computerName }} </el-col>
          <el-col :span="6"> 部署目录：{{ server.sys.userDir }} </el-col>
          <el-col :span="6"> 操作系统：{{ server.sys.osName }}-{{ server.sys.osArch }} </el-col>
          <el-col :span="6"> 服务器IP：{{ server.sys.computerIp }} </el-col>
        </el-row>
      </template>

      <el-row :gutter="10">
        <el-col v-if="server.cpu" :span="8">
          <div class="flex-col-center">
            CPU使用率
            <el-progress
              type="circle"
              :percentage="+server.cpu.usage"
              :color="server.cpu.usage > 85 ? '#f56c6c' : 100 - server.cpu.usage > 70 ? '#e6a23c' : '#5cb87a'"
            />
            CPU-{{ server.cpu.cpuNum }}核
          </div>
        </el-col>
        <el-col v-if="server.mem" :span="8">
          <div class="flex-col-center">
            内存使用率
            <el-progress
              type="circle"
              :percentage="+server.mem.usage"
              :color="server.mem.usage > 85 ? '#f56c6c' : server.mem.usage > 70 ? '#e6a23c' : '#5cb87a'"
            />
            {{ server.mem.used }}/{{ server.mem.total }}GB
          </div>
        </el-col>
        <el-col v-if="server.sysFiles" :span="8">
          <div class="flex-col-center">
            磁盘使用率
            <el-progress
              type="circle"
              :percentage="+server.sysFiles.usage"
              :color="server.sysFiles.usage > 85 ? '#f56c6c' : server.sysFiles.usage > 70 ? '#e6a23c' : '#5cb87a'"
            />
            {{ server.sysFiles.used }}/{{ server.sysFiles.total }}GB
          </div>
        </el-col>
      </el-row>
    </el-card>

    <el-card class="mt-4">
      <template #header>
        <span class="flex-center"><IconifyIcon class="mr-1" icon="ep:collection" />redis信息</span>
        <el-row v-if="cache.info" :gutter="10" class="mt-4">
          <el-col :span="6"> Redis版本：{{ cache.info.redis_version }} </el-col>
          <el-col :span="6"> 端口：{{ cache.info.tcp_port }} </el-col>
          <el-col :span="6"> 运行时间(天)：{{ cache.info.uptime_in_days }} </el-col>
          <el-col :span="6"> 客户端数：{{ cache.info.connected_clients }} </el-col>
          <el-col :span="6"> 内存总量：{{ cache.info.used_memory_rss }} </el-col>
          <el-col :span="6"> 内存峰值：{{ cache.info.used_memory }} </el-col>
          <el-col :span="6"> 查找数据库键成功的次数：{{ cache.info.keyspace_hits }} </el-col>
          <el-col :span="6"> 查找数据库键失败的次数：{{ cache.info.keyspace_misses }} </el-col>
        </el-row>
      </template>
      <div ref="commandstats" style="height: 360px" />
    </el-card>
  </div>
</template>

<script setup>
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
