/**
 * stop：本回合若改过业务源码，则自动追问注释交付清单（仅 loop_count===0 追问一次）。
 * stdin: { status, loop_count }
 * stdout: {} | { followup_message }
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const STATE_PATH = path.join(__dirname, 'state', 'edited-sources.json')

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8')
  }
  catch {
    return '{}'
  }
}

function loadFiles() {
  try {
    const raw = fs.readFileSync(STATE_PATH, 'utf8')
    const data = JSON.parse(raw)
    return Array.isArray(data.files) ? data.files : []
  }
  catch {
    return []
  }
}

function clearState() {
  try {
    fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true })
    fs.writeFileSync(STATE_PATH, JSON.stringify({ files: [] }, null, 2), 'utf8')
  }
  catch {
    // ignore
  }
}

function toRel(p) {
  const lower = p.replace(/\\/g, '/').toLowerCase()
  const appsIdx = lower.lastIndexOf('/apps/')
  if (appsIdx >= 0)
    return p.replace(/\\/g, '/').slice(appsIdx + 1)
  const pkgIdx = lower.lastIndexOf('/packages/')
  if (pkgIdx >= 0)
    return p.replace(/\\/g, '/').slice(pkgIdx + 1)
  return path.basename(p)
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

  const status = payload.status
  const loopCount = Number(payload.loop_count ?? 0)

  // 中断/错误或已追问过：不再打扰
  if (status !== 'completed' || loopCount >= 1) {
    if (loopCount >= 1)
      clearState()
    process.stdout.write('{}\n')
    return
  }

  const files = loadFiles()
  if (!files.length) {
    process.stdout.write('{}\n')
    return
  }

  const listed = files.slice(0, 12).map(f => `- ${toRel(f)}`).join('\n')
  const more = files.length > 12 ? `\n- …共 ${files.length} 个文件` : ''

  const followup_message = [
    '【注释交付门禁】本回合改过业务源码，请对照 `.cursor/rules/comment-standards.mdc` 硬门禁自检并补齐后再结束：',
    '',
    '改动文件：',
    listed + more,
    '',
    '必查：',
    '1. 新文件/复杂页是否有文件头或 script 顶职责说明？',
    '2. 导出函数、Store action、Composable 是否有 JSDoc？',
    '3. 导出类型/枚举非自解释字段是否有注释？',
    '4. 复杂规则/坑点是否有 why 块注释且与实现一致？',
    '5. 有无废话或过时注释？',
    '',
    '若已齐全，简短回复「注释已自检通过」即可；若有缺漏请直接补代码注释，不要只口头承诺。',
  ].join('\n')

  // 不清空 state：若 followup 在 Windows 未注入，下次仍可能再提醒；loop_limit=1 限制只追一次
  process.stdout.write(`${JSON.stringify({ followup_message })}\n`)
}

main()
