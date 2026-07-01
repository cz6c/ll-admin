import type { WifiInfo } from '@/utils/wifi'
import { defineStore } from 'pinia'

export type WifiHistoryType = 'scanned' | 'generated'

export interface WifiHistoryItem extends WifiInfo {
  id: string
  type: WifiHistoryType
  createdAt: number
}

const MAX = 50

function createId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

/** WiFi 历史记录：本地 `wifi_history` 键持久化 */
export const useWifiHistoryStore = defineStore('wifiHistory', {
  state: () => ({
    items: [] as WifiHistoryItem[],
  }),

  getters: {
    count: state => state.items.length,
  },

  actions: {
    /** 新增或更新（相同 ssid+password 则更新时间并置顶） */
    add(info: WifiInfo, type: WifiHistoryType) {
      const idx = this.items.findIndex(
        i => i.ssid === info.ssid && i.password === info.password,
      )
      if (idx >= 0) {
        const existing = this.items[idx]
        const updated: WifiHistoryItem = {
          ...existing,
          hidden: info.hidden,
          type,
          createdAt: Date.now(),
        }
        this.items = [updated, ...this.items.filter((_, i) => i !== idx)]
        return updated
      }

      const row: WifiHistoryItem = {
        id: createId(),
        ssid: info.ssid,
        password: info.password,
        hidden: info.hidden,
        type,
        createdAt: Date.now(),
      }
      this.items = [row, ...this.items].slice(0, MAX)
      return row
    },

    findById(id: string): WifiHistoryItem | undefined {
      return this.items.find(i => i.id === id)
    },

    clearAll() {
      this.items = []
    },
  },

  persist: {
    key: 'wifi_history',
    paths: ['items'],
  },
})
