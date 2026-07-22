/**
 * 同步 @qiun/uni-ucharts 内的 u-charts 到 src/components/u-charts
 *
 * why：qiun-data-charts 写死 import `@/components/u-charts/*`；
 * uni 小程序插件 `uni:mp-using-component` 自行解析 `@/`，Vite alias 无效，
 * 必须把包内文件落到项目 src 下。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const srcDir = path.join(root, 'node_modules/@qiun/uni-ucharts/components/u-charts')
const destDir = path.join(root, 'src/components/u-charts')

if (!fs.existsSync(srcDir)) {
  console.warn('[sync-ucharts] 未安装 @qiun/uni-ucharts，跳过同步')
  process.exit(0)
}

fs.mkdirSync(destDir, { recursive: true })
for (const name of fs.readdirSync(srcDir)) {
  fs.copyFileSync(path.join(srcDir, name), path.join(destDir, name))
}
console.log('[sync-ucharts] 已同步到 src/components/u-charts')
