export interface WifiInfo {
  ssid: string
  password: string
  /** 是否为隐藏网络（不广播 SSID） */
  hidden?: boolean
}

function escapeWifiField(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/"/g, '\\"')
}

function unescapeWifiField(value: string): string {
  return value.replace(/\\([\\;,":])/g, '$1')
}

/** 有密码输出 WPA2，无密码输出 nopass */
function qrEncryptionType(password: string): 'WPA2' | 'nopass' {
  return password.trim() ? 'WPA2' : 'nopass'
}

/** 解析 H 字段 */
function parseHiddenField(h: string | undefined): boolean {
  if (!h)
    return false
  const v = h.trim().toLowerCase()
  return v === 'true' || v === '1' || v === 'yes'
}

/** 按标准格式生成 WiFi 二维码文本 */
export function buildWifiQr(info: WifiInfo): string {
  const t = qrEncryptionType(info.password)
  let text = `WIFI:T:${t};S:${escapeWifiField(info.ssid)};`
  if (t !== 'nopass' && info.password)
    text += `P:${escapeWifiField(info.password)};`
  if (info.hidden)
    text += 'H:true;'
  text += ';'
  return text
}

/** 解析 WiFi 二维码文本，失败返回 null */
export function parseWifiQr(raw: string): WifiInfo | null {
  const trimmed = raw.trim()
  if (!/^WIFI:/i.test(trimmed))
    return null

  const content = trimmed.slice(5)
  const fields: Record<string, string> = {}
  let i = 0

  while (i < content.length) {
    const key = content[i]
    if (content[i + 1] !== ':') {
      i++
      continue
    }
    i += 2
    let value = ''
    while (i < content.length) {
      if (content[i] === '\\' && i + 1 < content.length) {
        value += content[i + 1]
        i += 2
      }
      else if (content[i] === ';') {
        break
      }
      else {
        value += content[i]
        i++
      }
    }
    fields[key] = unescapeWifiField(value)
    if (content[i] === ';')
      i++
  }

  const ssid = fields.S
  if (!ssid)
    return null

  return {
    ssid,
    password: fields.P ?? '',
    hidden: parseHiddenField(fields.H),
  }
}

/** 跳转扫码结果页 query；connected 为扫码后自动连接结果 */
export function toScanResultQuery(info: WifiInfo, connected?: boolean): string {
  let q = `ssid=${encodeURIComponent(info.ssid)}&password=${encodeURIComponent(info.password)}`
  if (info.hidden)
    q += '&hidden=1'
  if (connected !== undefined)
    q += `&connected=${connected ? '1' : '0'}`
  return q
}

const CONNECT_POLL_INTERVAL = 300
/** iOS 密码错误时 connectWifi 可能走 success，需短轮询确认；不宜过长否则 loading 久停 */
const CONNECT_VERIFY_TIMEOUT = 3000

export interface AttemptConnectWifiOptions {
  ssid: string
  password: string
  onSuccess: () => void
  onFail: () => void
  onComplete: () => void
}

/** 微信小程序连接 WiFi（含 iOS 短轮询校验） */
export function attemptConnectWifi(options: AttemptConnectWifiOptions) {
  const { ssid, password, onSuccess, onFail, onComplete } = options

  // #ifdef MP-WEIXIN
  let settled = false
  let verifyTimer: ReturnType<typeof setTimeout> | null = null
  let verifyDeadline = 0

  const cleanup = () => {
    if (verifyTimer) {
      clearTimeout(verifyTimer)
      verifyTimer = null
    }
    uni.offWifiConnected(onWifiConnected)
  }

  const finish = (success: boolean) => {
    if (settled)
      return
    settled = true
    cleanup()
    if (success)
      onSuccess()
    else
      onFail()
    onComplete()
  }

  function onWifiConnected(res: { wifi?: { SSID?: string } }) {
    if (res?.wifi?.SSID === ssid)
      finish(true)
  }

  function pollConnection() {
    if (settled)
      return
    if (Date.now() >= verifyDeadline) {
      finish(false)
      return
    }

    uni.getConnectedWifi({
      partialInfo: true,
      success: (res) => {
        if (settled)
          return
        if (res?.wifi?.SSID === ssid)
          finish(true)
        else
          verifyTimer = setTimeout(pollConnection, CONNECT_POLL_INTERVAL)
      },
      fail: () => {
        if (!settled)
          verifyTimer = setTimeout(pollConnection, CONNECT_POLL_INTERVAL)
      },
    })
  }

  function startVerify() {
    verifyDeadline = Date.now() + CONNECT_VERIFY_TIMEOUT
    pollConnection()
  }

  function startConnect() {
    uni.onWifiConnected(onWifiConnected)
    uni.startWifi({
      success: () => {
        uni.connectWifi({
          SSID: ssid,
          password,
          success: startVerify,
          fail: () => finish(false),
        })
      },
      fail: () => finish(false),
    })
  }

  uni.getSetting({
    success: (res) => {
      if (!res.authSetting?.['scope.userLocation']) {
        uni.authorize({
          scope: 'scope.userLocation',
          success: startConnect,
          fail: startConnect,
        })
      }
      else {
        startConnect()
      }
    },
    fail: startConnect,
  })
  // #endif

  // #ifndef MP-WEIXIN
  onFail()
  onComplete()
  // #endif
}
