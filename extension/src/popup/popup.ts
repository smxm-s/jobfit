import type { BgResponse, PopupStatus, RuntimeMessage } from '../shared/types.js'

function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id)
  if (!element) throw new Error(`缺少元素 #${id}`)
  return element as T
}

const connDot = byId<HTMLSpanElement>('connDot')
const connTag = byId<HTMLSpanElement>('connTag')
const connText = byId<HTMLElement>('connText')
const quotaText = byId<HTMLElement>('quotaText')
const quotaBar = byId<HTMLElement>('quotaBar')
const queueText = byId<HTMLElement>('queueText')
const levelText = byId<HTMLElement>('levelText')
const versionText = byId<HTMLElement>('versionText')
const loginText = byId<HTMLElement>('loginText')
const heartbeatText = byId<HTMLElement>('heartbeatText')
const apiBaseText = byId<HTMLElement>('apiBaseText')
const l3Toggle = byId<HTMLInputElement>('l3Toggle')
const l3Hint = byId<HTMLElement>('l3Hint')
const pauseBtn = byId<HTMLButtonElement>('pauseBtn')
const refreshBtn = byId<HTMLButtonElement>('refreshBtn')
const openBossBtn = byId<HTMLButtonElement>('openBossBtn')
const openWebBtn = byId<HTMLButtonElement>('openWebBtn')
const pairSection = byId<HTMLElement>('pairSection')
const mainSection = byId<HTMLElement>('mainSection')
const pairForm = byId<HTMLFormElement>('pairForm')
const pairCode = byId<HTMLInputElement>('pairCode')
const pairBtn = byId<HTMLButtonElement>('pairBtn')
const pairTip = byId<HTMLElement>('pairTip')
const errorBanner = byId<HTMLElement>('error')
const noticeBanner = byId<HTMLElement>('notice')

let status: PopupStatus | null = null
let busy = false
let refreshTimer: ReturnType<typeof setTimeout> | null = null

function send<T>(message: RuntimeMessage): Promise<BgResponse<T> | null> {
  return chrome.runtime
    .sendMessage(message)
    .then((response) => (response ?? null) as BgResponse<T> | null)
    .catch(() => null)
}

async function loadStatus(refresh = false): Promise<void> {
  const message: RuntimeMessage = refresh ? { type: 'REFRESH_BOOTSTRAP' } : { type: 'GET_STATUS' }
  const response = await send<PopupStatus>(message)
  if (response?.ok && response.data) {
    status = response.data
    clearError()
    render()
    return
  }
  showError(response?.error ?? '扩展后台未响应，请关闭后重新打开 popup')
  render()
}

function render(): void {
  const current = status
  const paired = Boolean(current?.paired)
  pairSection.classList.toggle('hidden', paired)
  mainSection.classList.toggle('hidden', !paired)

  if (!current) {
    connDot.className = 'dot'
    connTag.textContent = '未连接'
    if (!paired) pairCode.focus()
    return
  }

  const connected = current.connected
  connDot.className = `dot ${connected ? 'ok' : 'warn'}`
  connTag.textContent = connected ? '已连接' : '待连接'
  connText.textContent = connected
    ? '平台配置已同步'
    : current.paired
      ? '已配对，等待平台响应'
      : '未配对'

  const { quota, queue, config } = current
  quotaText.textContent = `${quota.remaining} / ${quota.limit}`
  quotaBar.style.width = `${quota.limit > 0 ? Math.min(100, (quota.used / quota.limit) * 100) : 0}%`
  const next = queue.nextRunAt ? ` · 下次约 ${clock(queue.nextRunAt)}` : ''
  queueText.textContent = `${queue.pending} 待投 · ${queue.sent} 已投 · ${queue.skipped} 跳过 · ${queue.failed} 失败${next}`
  levelText.textContent =
    config.effectiveLevel === config.applyLevel
      ? config.effectiveLevel
      : `${config.effectiveLevel}（配置 ${config.applyLevel}）`
  versionText.textContent = current.version
    ? `${current.version.title || '未命名简历'} · v${current.version.versionNo}`
    : '未上传简历'

  loginText.textContent =
    current.login.loggedIn == null ? '未检测' : current.login.loggedIn ? '已登录' : '未登录'
  heartbeatText.textContent = timeAgo(current.lastHeartbeatAt)
  apiBaseText.textContent = current.apiBase

  // L3 开关：本地默认关闭，服务端配置为 L3 时才可能真正执行
  l3Toggle.checked = current.l3Enabled
  if (config.applyLevel !== 'L3') {
    l3Hint.textContent = '服务端投递等级不是 L3，本开关不生效。'
  } else if (!current.l3Enabled) {
    l3Hint.textContent = '服务端已设为 L3，但本地默认关闭，当前按 L2 执行。'
  } else {
    l3Hint.textContent = 'L3 已开启：随机 40–120 秒/条、日上限、时段窗口，遇验证码立即熔断。'
  }

  pauseBtn.textContent = current.paused.value ? '继续队列' : '暂停队列'

  if (current.paused.value) {
    showNotice(`已暂停：${pauseReason(current.paused.reason)}`)
  } else {
    noticeBanner.classList.add('hidden')
  }

  if (!paired) pairCode.focus()
}

function pauseReason(reason: string | null): string {
  switch (reason) {
    case 'CAPTCHA':
      return '检测到验证码，请完成验证后点“继续队列”'
    case 'CONSECUTIVE_FAILURES':
      return '连续投递失败，已停止'
    case 'QUOTA':
      return '今日额度已用尽（跨天后刷新额度）'
    case 'LOGIN_REQUIRED':
      return 'Boss 未登录'
    case 'TOKEN_INVALID':
      return '设备 token 失效，请重新配对'
    default:
      return '手动暂停'
  }
}

function timeAgo(timestamp: number | null): string {
  if (!timestamp) return '—'
  const diff = Date.now() - timestamp
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  return clock(timestamp)
}

function clock(timestamp: number): string {
  const date = new Date(timestamp)
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function showError(text: string): void {
  errorBanner.textContent = text
  errorBanner.classList.remove('hidden')
}

function clearError(): void {
  errorBanner.textContent = ''
  errorBanner.classList.add('hidden')
}

function showNotice(text: string): void {
  noticeBanner.textContent = text
  noticeBanner.classList.remove('hidden')
}

function setBusy(value: boolean): void {
  busy = value
  pairBtn.disabled = value
  refreshBtn.disabled = value
  openBossBtn.disabled = value
  openWebBtn.disabled = value
  pauseBtn.disabled = value
}

function showPairTip(text: string): void {
  pairTip.textContent = text
  pairTip.hidden = false
}

pairForm.addEventListener('submit', (event) => {
  event.preventDefault()
  if (busy) return
  const raw = pairCode.value.trim().toUpperCase()
  const compact = raw.replace(/[\s-]/g, '')
  if (!/^[A-Z0-9]{6,10}$/.test(compact)) {
    showPairTip('配对码应为 6-10 位字母或数字（可含横线）')
    return
  }
  pairTip.hidden = true
  void (async () => {
    setBusy(true)
    const response = await send<PopupStatus>({ type: 'PAIR', code: raw })
    setBusy(false)
    if (response?.ok && response.data) {
      status = response.data
      pairCode.value = ''
      clearError()
      render()
      return
    }
    showPairTip(response?.error ?? '配对失败，请检查配对码是否过期')
  })()
})

pauseBtn.addEventListener('click', () => {
  if (busy || !status) return
  void (async () => {
    setBusy(true)
    const response = await send<PopupStatus>({ type: 'SET_PAUSED', paused: !status?.paused.value })
    setBusy(false)
    if (response?.ok && response.data) {
      status = response.data
      clearError()
      render()
    } else {
      showError(response?.error ?? '操作失败')
    }
  })()
})

l3Toggle.addEventListener('change', () => {
  if (busy) return
  void (async () => {
    const response = await send<PopupStatus>({ type: 'SET_L3', enabled: l3Toggle.checked })
    if (response?.ok && response.data) {
      status = response.data
      clearError()
      render()
    } else {
      l3Toggle.checked = status?.l3Enabled ?? false
      showError(response?.error ?? '切换 L3 失败')
    }
  })()
})

refreshBtn.addEventListener('click', () => {
  if (busy) return
  void (async () => {
    setBusy(true)
    await loadStatus(true)
    setBusy(false)
  })()
})

openBossBtn.addEventListener('click', () => {
  if (busy) return
  void (async () => {
    setBusy(true)
    const response = await send<{ url: string }>({ type: 'OPEN_LIST_PAGE' })
    setBusy(false)
    if (response?.ok) {
      window.close()
    } else {
      showError(response?.error ?? '打开失败，请检查是否已配对')
    }
  })()
})

openWebBtn.addEventListener('click', () => {
  if (busy) return
  void (async () => {
    setBusy(true)
    const response = await send<{ url: string }>({ type: 'OPEN_WEB' })
    setBusy(false)
    if (response?.ok) {
      window.close()
    } else {
      showError(response?.error ?? '打开失败')
    }
  })()
})

chrome.storage.onChanged.addListener(() => {
  if (refreshTimer) clearTimeout(refreshTimer)
  refreshTimer = setTimeout(() => {
    refreshTimer = null
    void loadStatus()
  }, 300)
})

void loadStatus()
