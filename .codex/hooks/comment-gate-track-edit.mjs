/**
 * afterFileEdit：记录本会话改过的业务源码路径（供 stop 门禁使用）。
 * stdin: { file_path, edits }
 * stdout: {}（afterFileEdit 无输出字段）
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const STATE_PATH = path.join(__dirname, 'state', 'edited-sources.json')

/** 仅追踪业务源码；规则/hooks/配置/lock 不追问 */
const SOURCE_RE = /[\\/](apps[\\/](uni|server|admin)[\\/].+\.(ts|tsx|vue|js|mjs)|packages[\\/].+\.(ts|tsx|vue|js))$/i
const SKIP_RE = /[\\/](\.cursor[\\/]|node_modules[\\/]|dist[\\/]|migrations[\\/].*\.ts$)/i

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8')
  }
  catch {
    return '{}'
  }
}

function loadState() {
  try {
    const raw = fs.readFileSync(STATE_PATH, 'utf8')
    const data = JSON.parse(raw)
    return Array.isArray(data.files) ? data.files : []
  }
  catch {
    return []
  }
}

function saveState(files) {
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true })
  fs.writeFileSync(STATE_PATH, JSON.stringify({ files }, null, 2), 'utf8')
}

function main() {
  let payload = {}
  try {
    payload = JSON.parse(readStdin() || '{}')
  }
  catch {
    process.stdout.write('{}\n')
    return
  }

  const filePath = String(payload.file_path || '')
  if (!filePath || SKIP_RE.test(filePath) || !SOURCE_RE.test(filePath)) {
    process.stdout.write('{}\n')
    return
  }

  const files = loadState()
  const normalized = path.normalize(filePath)
  if (!files.includes(normalized)) {
    files.push(normalized)
    try {
      saveState(files)
    }
    catch {
      // fail open
    }
  }

  process.stdout.write('{}\n')
}

main()
