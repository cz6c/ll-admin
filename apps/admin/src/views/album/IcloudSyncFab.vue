<!--
  iCloud 同步浮动触发区
  职责：右下角常驻 FAB 体现同步状态（图标/进度环/标签），点击展开右侧抽屉承载全部同步功能
  主流程：hydrate → FAB 状态显示 → 抽屉内 StatusCard 主按钮 + 折叠任务明细
-->
<script setup lang="ts">
import { Icon } from "@iconify/vue";
import IcloudSyncAuthModal from "@/components/IcloudSyncAuthModal/IcloudSyncAuthModal.vue";
import IcloudSyncStatusCard from "@/components/IcloudSyncStatusCard/IcloudSyncStatusCard.vue";
import { formatAssetTaskError, formatIcloudSyncError, logoutIcloudSync } from "@/api/icloudSync";
import { useIcloudSyncJob } from "@/composables/useIcloudSyncJob";
import { isTauri } from "@/utils/tauri";

defineOptions({ name: "AlbumIcloudSyncFab" });

const {
  fabState,
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
  onTaskFilterChange,
  onTaskKeywordSearch,
  onTaskTableChange,
  onLoggedIn,
  onLoggedOut,
  hydrateFromStorage
} = useIcloudSyncJob();

const drawerOpen = ref(false);
const loggingOut = ref(false);

const iconName = computed(() => {
  switch (fabState.value.icon) {
    case "check":
      return "mdi:check-circle";
    case "warning":
      return "mdi:alert-circle";
    case "pause":
      return "mdi:pause-circle";
    default:
      return "mdi:cloud-outline";
  }
});

/** 下载中显示进度环，其余状态显示图标 */
const showProgress = computed(() => fabState.value.percent > 0 && fabState.value.percent < 100);

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
  <div class="fab-root">
    <button class="fab-btn" :class="`fab-${fabState.color}`" :title="fabState.label" @click="drawerOpen = true">
      <a-progress v-if="showProgress" type="circle" :percent="fabState.percent" :size="36" :show-info="false" />
      <Icon v-else :icon="iconName" :class="{ spin: fabState.spin }" />
    </button>
  </div>

  <a-drawer
    v-model:open="drawerOpen"
    title="iCloud 同步"
    placement="right"
    width="440"
    :body-style="{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }"
  >
    <div class="drawer-head">
      <a-tag v-if="isLoggedIn" color="success">已登录 · {{ maskedCurrentAppleId }}</a-tag>
      <a-button v-if="isLoggedIn" type="link" danger size="small" :loading="loggingOut" @click="onLogout">退出登录</a-button>
      <a-button v-else type="link" size="small" @click="authModalOpen = true">Apple ID 登录</a-button>
    </div>

    <IcloudSyncStatusCard />

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

    <a-alert v-if="errorMsg" type="error" :message="errorMsg" show-icon />

    <IcloudSyncAuthModal v-model:open="authModalOpen" @logged-in="onLoggedIn" @logged-out="onLoggedOut" />
  </a-drawer>
</template>

<style scoped lang="scss">
.fab-root {
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  pointer-events: auto;
}
.fab-btn {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  border: 2px solid currentColor;
  background: var(--color-bg-container, #fff);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  font-size: 22px;
  line-height: 1;
  transition: transform 0.2s;
  &:hover {
    transform: scale(1.08);
  }
}
.fab-default {
  color: var(--color-text-tertiary);
}
.fab-processing {
  color: var(--color-primary);
}
.fab-success {
  color: #52c41e;
}
.fab-warning {
  color: #faad14;
}
.fab-error {
  color: #ff4d4f;
}
.spin {
  animation: fab-spin 1.5s linear infinite;
}
@keyframes fab-spin {
  to {
    transform: rotate(360deg);
  }
}
.fab-text {
  font-size: 11px;
  color: var(--color-text-secondary);
  white-space: nowrap;
  background: rgba(255, 255, 255, 0.92);
  padding: 1px 6px;
  border-radius: 8px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
}

.drawer-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
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
</style>
