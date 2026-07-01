/** 复制到剪贴板 */
export function copyToClipboard(data: string, successTitle: string) {
  uni.setClipboardData({
    data,
    showToast: false,
    success: () => {
      uni.showToast({ title: successTitle, icon: 'success' })
    },
    fail: () => {
      uni.showToast({ title: '复制失败，请重试', icon: 'none' })
    },
  })
}
