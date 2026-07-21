/**
 * sessionStart：清空本会话「已编辑源码」清单，避免跨会话误追问。
 * stdin: Cursor sessionStart JSON；stdout: {} 或 { env }
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

readStdin()

try {
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true })
  fs.writeFileSync(STATE_PATH, JSON.stringify({ files: [] }, null, 2), 'utf8')
}
catch {
  // fail open
}

process.stdout.write('{}\n')
