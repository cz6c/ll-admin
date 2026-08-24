<!--
  相册 — iCloud 同步页
  职责：图库全量同步；P2 单屏状态 + 折叠任务明细
  主流程：hydrate → StatusCard 主按钮 → 折叠区查看文件任务
-->
<script setup lang="ts">
import IcloudSyncAuthModal from "@/components/IcloudSyncAuthModal/IcloudSyncAuthModal.vue";
import IcloudSyncStatusCard from "@/components/IcloudSyncStatusCard/IcloudSyncStatusCard.vue";
import { formatAssetTaskError, logoutIcloudSync, formatIcloudSyncError } from "@/api/icloudSync";
import { useIcloudSyncJob } from "@/composables/useIcloudSyncJob";
import { isTauri } from "@/utils/tauri";

defineOptions({ name: "AlbumIcloudSync" });

const {
  isLoggedIn,
  maskedCurrentAppleId,
  authModalOpen,
  activeJobId,
  progress,
  taskCollapseOpen,
  taskFilter,
  taskKeyword,
  loadingTasks,
  assetTasks,
  taskPage,
  taskPageSize,
  taskTotal,
  errorMsg,
  goSettings,
  onTaskFilterChange,
  onTaskKeywordSearch,
  onTaskTableChange,
  onLoggedIn,
  onLoggedOut,
  hydrateFromStorage
} = useIcloudSyncJob();
const loggingOut = ref(false);

const taskTableColumns = [
  { title: "序号", dataIndex: "indexNum", width: 72 },
  { title: "部件", dataIndex: "part", width: 56 },
  { title: "文件名", dataIndex: "originalFilename", ellipsis: true },
  { title: "状态", dataIndex: "status", width: 80 },
  { title: "备注", dataIndex: "lastError", ellipsis: true }
];

function partLabel(part: string): string {
  if (part === "still") return "静态";
  if (part === "mov") return "视频";
  if (part === "full") return "整图";
  return part;
}

function statusLabel(status: string): string {
  if (status === "done") return "已完成";
  if (status === "failed") return "失败";
  if (status === "pending") return "待下载";
  return status;
}

function statusTagColor(status: string): string {
  if (status === "done") return "success";
  if (status === "failed") return "error";
  return "default";
}

async function onLogout() {
  loggingOut.value = true;
  errorMsg.value = "";
  try {
    await logoutIcloudSync(true);
    onLoggedOut();
  } catch (e) {
    errorMsg.value = formatIcloudSyncError(e);
  } finally {
    loggingOut.value = false;
  }
}

onMounted(() => {
  if (isTauri()) void hydrateFromStorage();
});
</script>

<template>
  <div class="icloud-sync-page">
    <a-card class="sync-card card-rounded" :bordered="true">
      <template #title>
        <div class="card-head">
          <div>
            <span>同步 iCloud 照片</span>
            <span class="scope-hint">按拍摄时间顺序下载全部照片、视频与 Live Photo</span>
          </div>
          <div class="head-actions">
            <a-tag v-if="isLoggedIn" color="success">已登录 · {{ maskedCurrentAppleId }}</a-tag>
            <a-button v-if="isLoggedIn" type="link" danger size="small" :loading="loggingOut" @click="onLogout">退出登录</a-button>
            <a-button v-else type="link" size="small" @click="authModalOpen = true">Apple ID 登录</a-button>
          </div>
        </div>
      </template>

      <IcloudSyncStatusCard @settings="goSettings(true)" />

      <a-collapse v-if="activeJobId != null && progress.total > 0" v-model:active-key="taskCollapseOpen" class="task-collapse" :bordered="false">
        <a-collapse-panel key="tasks" :header="`文件任务（共 ${progress.total} 个）`">
          <div class="task-toolbar">
            <a-radio-group v-model:value="taskFilter" size="small" @change="onTaskFilterChange">
              <a-radio-button value="all">全部</a-radio-button>
              <a-radio-button value="pending">待下载</a-radio-button>
              <a-radio-button value="done">已完成</a-radio-button>
              <a-radio-button value="failed">失败</a-radio-button>
            </a-radio-group>
            <a-input-search v-model:value="taskKeyword" placeholder="搜索文件名" allow-clear size="small" class="task-search" @search="onTaskKeywordSearch" />
          </div>
          <a-spin :spinning="loadingTasks">
            <a-table
              :columns="taskTableColumns"
              :data-source="assetTasks"
              size="small"
              bordered
              row-key="rowKey"
              :scroll="{ y: 280 }"
              :pagination="{
                current: taskPage,
                pageSize: taskPageSize,
                total: taskTotal,
                showSizeChanger: true,
                pageSizeOptions: ['50', '100', '200'],
                showTotal: (total: number) => `共 ${total} 条`
              }"
              @change="onTaskTableChange"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.dataIndex === 'indexNum'">
                  {{ String(record.indexNum).padStart(5, "0") }}
                </template>
                <template v-else-if="column.dataIndex === 'part'">
                  {{ partLabel(record.part) }}
                </template>
                <template v-else-if="column.dataIndex === 'status'">
                  <a-tag :color="statusTagColor(record.status)">{{ statusLabel(record.status) }}</a-tag>
                </template>
                <template v-else-if="column.dataIndex === 'lastError'">
                  {{ formatAssetTaskError(record.lastError) }}
                </template>
              </template>
            </a-table>
          </a-spin>
        </a-collapse-panel>
      </a-collapse>

      <a-alert v-if="errorMsg" type="error" :message="errorMsg" show-icon class="mt-12px" />
    </a-card>

    <IcloudSyncAuthModal v-model:open="authModalOpen" @logged-in="onLoggedIn" @logged-out="onLoggedOut" />
  </div>
</template>

<style scoped lang="scss">
.sync-card {
  :deep(.ant-card-head) {
    min-height: auto;
    padding: 12px 16px;
  }
  :deep(.ant-card-body) {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
}
.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  font-size: 16px;
  font-weight: 600;
}
.head-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.scope-hint {
  margin-left: 8px;
  font-size: 13px;
  font-weight: 400;
  color: var(--color-text-tertiary);
}
.task-collapse {
  background: transparent;
  :deep(.ant-collapse-header) {
    padding: 8px 0 !important;
    font-size: 13px;
    font-weight: 600;
    color: var(--color-text-secondary);
  }
  :deep(.ant-collapse-content-box) {
    padding: 0 0 8px !important;
  }
}
.task-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
}
.task-search {
  width: 200px;
}
.mt-12px {
  margin-top: 12px;
}
</style>
