/** 保存图片到相册 */
export function saveImageToAlbum(filePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    uni.saveImageToPhotosAlbum({
      filePath,
      success: () => resolve(),
      fail: (err) => {
        const msg = String(err?.errMsg ?? '')
        if (msg.includes('auth deny') || msg.includes('authorize')) {
          uni.showModal({
            title: '需要相册权限',
            content: '请在设置中允许保存到相册后重试',
            confirmText: '去设置',
            success: (res) => {
              if (res.confirm)
                uni.openSetting({})
            },
          })
        }
        else {
          uni.showToast({ title: '保存失败，请重试', icon: 'none' })
        }
        reject(err)
      },
    })
  })
}
