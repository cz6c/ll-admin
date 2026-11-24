<script lang="ts" setup>
/**
 * 试驾体验打分列表
 * 主流程：拉本人记录 → 新建 / 进入详情；侧滑删除
 */
import type { DriveScoreRecord } from '@/api/driveScore'
import { onShow } from '@dcloudio/uni-app'
import { useQueue } from '@wot-ui/ui'
import { ref } from 'vue'
import { deleteDriveScore, getDriveScoreList } from '@/api/driveScore'

defineOptions({ name: 'DriveScoreList' })

definePage({
  style: {
    navigationBarTitleText: '试驾体验打分',
  },
})

const { closeOutside } = useQueue()

const list = ref<DriveScoreRecord[]>([])
const loading = ref(false)

async function loadList() {
  loading.value = true
  try {
    list.value = (await getDriveScoreList()) || []
  }
  catch {
    // 业务/网络错误已由 http 层 toast
  }
  finally {
    loading.value = false
  }
}

onShow(() => {
  loadList()
})

function openCreate() {
  uni.navigateTo({ url: '/pages-sub/driveScore/edit' })
}

function openDetail(item: DriveScoreRecord) {
  uni.navigateTo({ url: `/pages-sub/driveScore/detail?id=${item.driveScoreId}` })
}

function confirmDelete(item: DriveScoreRecord) {
  uni.showModal({
    title: '删除记录',
    content: `确定删除「${item.vehicleName}」的打分记录吗？`,
    async success(res) {
      if (!res.confirm)
        return
      try {
        await deleteDriveScore(item.driveScoreId)
        await loadList()
        uni.showToast({ title: '已删除', icon: 'success' })
      }
      catch {
        // 业务/网络错误已由 http 层 toast
      }
    },
  })
}
</script>

<template>
  <view class="page-shell" @click="closeOutside">
    <view v-if="!loading && list.length === 0" class="empty-wrap">
      <text class="empty-title">还没有打分记录</text>
      <text class="empty-desc">试完车，按六个维度记下当时的感受</text>
      <wd-button type="primary" @click="openCreate">
        新建打分
      </wd-button>
    </view>

    <view v-else class="list-wrap">
      <wd-cell-group border>
        <wd-swipe-action v-for="item in list" :key="item.driveScoreId">
          <wd-cell
            :title="item.vehicleName"
            :label="item.remark || '六维试驾打分'"
            is-link
            @click="openDetail(item)"
          >
            <template #value>
              <text class="score-value">{{ item.totalScore }}</text>
            </template>
          </wd-cell>
          <template #right>
            <view class="action-delete" @click="confirmDelete(item)">
              删除
            </view>
          </template>
        </wd-swipe-action>
      </wd-cell-group>
    </view>

    <view v-if="list.length > 0" class="footer-safe">
      <wd-button block type="primary" @click="openCreate">
        新建打分
      </wd-button>
    </view>
  </view>
</template>

<style scoped lang="scss">
.page-shell {
  min-height: 100vh;
  background: #f5f5f5;
  padding-bottom: calc(140rpx + env(safe-area-inset-bottom));
}

.empty-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 160rpx 48rpx 0;
}

.empty-title {
  font-size: 32rpx;
  font-weight: 600;
  color: #1d2129;
  margin-bottom: 12rpx;
}

.empty-desc {
  font-size: 26rpx;
  color: #8a9199;
  margin-bottom: 48rpx;
}

.list-wrap {
  padding: 24rpx 0;
}

.score-value {
  font-size: 36rpx;
  font-weight: 600;
  color: var(--wot-primary-6, #1688ff);
}

:deep(.wd-cell__right) {
  flex: 0 0 auto;
}

.action-delete {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 144rpx;
  height: 100%;
  color: #fff;
  background: var(--wot-danger-main, #f56c6c);
}

.footer-safe {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 16rpx 32rpx calc(16rpx + env(safe-area-inset-bottom));
  background: #fff;
  box-shadow: 0 -2rpx 12rpx rgba(0, 0, 0, 0.04);
}
</style>
