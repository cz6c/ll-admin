import type { SalaryCalcInput, SalaryCalcResult } from '@/utils/salaryCalculator'
import { defineStore } from 'pinia'

const MAX = 20

/**
 * 一次「保存并查看明细」写入的成对数据：
 * - `input`：用户当时的表单条件，用于说明文案、与明细中的假设一致；
 * - `result`：当时 `calcSalary(input)` 的完整输出。历史明细页只展示 `result`，
 *   这样以后即使调整税率表或城市参数，已保存记录上的数字也不会被悄悄改掉。
 */
export interface SalaryCalcSnapshot {
  input: SalaryCalcInput
  result: SalaryCalcResult
}

/** 本地历史列表中的一条 */
export interface SalaryHistoryItem {
  id: string
  savedAt: number
  /** 列表摘要标题 */
  title: string
  /** 该条记录对应的「条件 + 计算结果」绑定快照 */
  snapshot: SalaryCalcSnapshot
}

/** 深拷贝计算结果，便于序列化写入本地 */
export function cloneSalaryCalcResult(r: SalaryCalcResult): SalaryCalcResult {
  return JSON.parse(JSON.stringify(r)) as SalaryCalcResult
}

/** 薪资测算历史：由 pinia-plugin-persistedstate 写入本地 `salary-calc-history` */
export const useSalaryHistoryStore = defineStore('salaryHistory', {
  state: () => ({
    items: [] as SalaryHistoryItem[],
  }),

  actions: {
    /** 新增一条并置顶，同 id 则覆盖为新快照 */
    prepend(entry: Omit<SalaryHistoryItem, 'savedAt'> & { savedAt?: number }) {
      const row: SalaryHistoryItem = {
        id: entry.id,
        savedAt: entry.savedAt ?? Date.now(),
        title: entry.title,
        snapshot: entry.snapshot,
      }
      this.items = [row, ...this.items.filter(i => i.id !== row.id)].slice(0, MAX)
    },

    removeById(id: string) {
      this.items = this.items.filter(i => i.id !== id)
    },

    findById(id: string): SalaryHistoryItem | undefined {
      return this.items.find(i => i.id === id)
    },
  },

  persist: {
    key: 'salary-calc-history',
    paths: ['items'],
  },
})
