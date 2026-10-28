import { L2_CONFIRM_TIMEOUT_MS } from '../shared/limiter.js'
import {
  isVisible,
  loadSelectors,
  matchesAny,
  queryFirst,
  wait,
  waitForElement
} from '../shared/selectors.js'
import type { BgResponse, ApplyStatus, ApplyTask, RuntimeMessage, SelectorSet } from '../shared/types.js'

let selectors: SelectorSet
let task: ApplyTask | null = null
let inputEl: HTMLElement | null = null
let finished = false
let running = false
let handledJobId: number | null = null
let startedAt = 0
let clickBound = false

let panel: HTMLElement | null = null
let statusLine: HTMLElement | null = null
let hintLine: HTMLElement | null = null
let greetingBox: HTMLTextAreaElement | null = null

let countdownTimer: ReturnType<typeof setInterval> | null = null
let actionTimer: ReturnType<typeof setTimeout> | null = null

export function init(): void {
  chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
    if (message.type === 'APPLY_TASK') {
      sendResponse({ ok: true })
      void startTask(message.task)
      return false
    }
    return false
  })

  bindPageEvents()
  void loadPendingTask()
}

async function loadPendingTask(): Promise<void> {
  try {
    selectors = await loadSelectors()
    injectStyles()
    await wait(600)
    const response = await ask<{ task: ApplyTask | null }>({ type: 'GET_APPLY_TASK' })
    if (response?.task) void startTask(response.task)
  } catch (error) {
    console.warn('[JobFit] 投递脚本初始化失败', error)
  }
}

async function startTask(next: ApplyTask): Promise<void> {
  if (running) return
  if (handledJobId === next.jobId) return
  handledJobId = next.jobId
  running = true
  try {
    task = next
    finished = false
    startedAt = readSessionNumber(startedKey(next.jobId)) ?? Date.now()
    writeSession(startedKey(next.jobId), String(startedAt))
    if (!selectors) selectors = await loadSelectors()
    injectStyles()
    buildPanel(next)
    await wait(800)
    await runTask(next)
  } finally {
    running = false
  }
}

async function runTask(current: ApplyTask): Promise<void> {
  if (captchaDetected()) {
    await finish('FAILED', 'CAPTCHA')
    return
  }
  if (!detectLogin()) {
    updateStatus('Boss 未登录：请先登录，插件不代登录')
    await finish('FAILED', 'LOGIN_REQUIRED')
    return
  }
  if (readSession(triggerKey(current.jobId)) !== '1' && queryFirst(document, selectors.detail.alreadyApplied)) {
    updateStatus('该岗位已沟通过，跳过')
    await finish('SKIPPED', undefined, 'ALREADY_APPLIED')
    return
  }

  updateStatus('正在打开沟通窗口…')
  await openChat()
  if (captchaDetected()) {
    await finish('FAILED', 'CAPTCHA')
    return
  }

  const greeting = (greetingBox?.value ?? current.greeting).trim() || current.greeting
  const input = await waitForGreetingInput(8000)
  if (!input) {
    updateStatus('未找到打招呼输入框，已降级为手动操作（链接已打开）')
    await finish('FAILED', 'SELECTOR_MISS')
    return
  }
  inputEl = input
  fillGreeting(input, greeting)
  updateStatus(current.level === 'L3' ? '打招呼语已填入，准备自动发送…' : '打招呼语已填入，请在页面确认并发送')
  if (current.level === 'L3') {
    await autoSend()
  } else {
    await manualConfirm()
  }
}

/** 打开聊天窗口；点击“立即沟通”本身不发送消息，L2/L3 都需要这一步 */
async function openChat(): Promise<void> {
  if (!task) return
  if (readSession(triggerKey(task.jobId)) === '1') return
  const trigger = queryFirst(document, selectors.detail.applyButton) as HTMLElement | null
  if (!trigger) return
  writeSession(triggerKey(task.jobId), '1')
  trigger.click()
  await wait(1500)
}

async function waitForGreetingInput(timeoutMs: number): Promise<HTMLElement | null> {
  const element = await waitForElement(selectors.detail.greetingInput, timeoutMs)
  return resolveEditable(element)
}

function resolveEditable(element: Element | null): HTMLElement | null {
  if (!element) return null
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) return element
  if (element instanceof HTMLElement && element.isContentEditable) return element
  const inner = element.querySelector("textarea, input, [contenteditable='true']")
  if (inner instanceof HTMLElement) return inner
  return element instanceof HTMLElement ? element : null
}

function fillGreeting(element: HTMLElement, value: string): void {
  element.focus()
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
    const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set
    if (setter) {
      setter.call(element, value)
    } else {
      element.value = value
    }
  } else {
    element.textContent = value
  }
  element.dispatchEvent(new Event('input', { bubbles: true }))
  element.dispatchEvent(new Event('change', { bubbles: true }))
}

/* ---------------- L2：等用户点发送 ---------------- */

async function manualConfirm(): Promise<void> {
  if (!task) return
  setPrimary('确认发送', () => {
    void sendNow()
  })
  setSecondary('跳过', () => {
    void finish('SKIPPED', undefined, 'MANUAL_SKIP')
  })
  updateHint('L2：请在页面点击发送，或在面板点“确认发送”；超时自动跳过')
  if (inputEl) inputEl.focus()

  const remaining = L2_CONFIRM_TIMEOUT_MS - (Date.now() - startedAt)
  if (remaining <= 0) {
    await finish('SKIPPED', undefined, 'NO_CONFIRM')
    return
  }
  actionTimer = setTimeout(() => {
    void finish('SKIPPED', undefined, 'NO_CONFIRM')
  }, remaining)
  startCountdown()
}

/* ---------------- L3：随机延迟后自动发送 ---------------- */

async function autoSend(): Promise<void> {
  if (!task) return
  setPrimary('取消自动投递', () => {
    void finish('SKIPPED', undefined, 'MANUAL_CANCEL')
  })
  setSecondary(null, null)
  updateHint('L3 实验特性：队列自动发送，遇验证码立即熔断')
  const delay = 1500 + Math.round(Math.random() * 2000)
  startCountdown()
  actionTimer = setTimeout(() => {
    void (async () => {
      if (captchaDetected()) {
        await finish('FAILED', 'CAPTCHA')
        return
      }
      const sent = await sendNow()
      if (!sent && !finished) {
        await finish('FAILED', 'SELECTOR_MISS')
      }
    })()
  }, delay)
}

async function sendNow(): Promise<boolean> {
  const current = task
  if (!current || finished) return false
  if (captchaDetected()) {
    await finish('FAILED', 'CAPTCHA')
    return false
  }
  const greeting = (greetingBox?.value ?? current.greeting).trim() || current.greeting
  if (inputEl) fillGreeting(inputEl, greeting)

  const button = await waitForElement(selectors.detail.sendButton, 4000)
  if (!(button instanceof HTMLElement)) {
    updateStatus('未找到发送按钮，请手动点击页面发送')
    return false
  }
  button.click()
  await wait(900)
  if (captchaDetected()) {
    await finish('FAILED', 'CAPTCHA')
    return false
  }
  await finish('SENT')
  return true
}

/* ---------------- 结束与回报 ---------------- */

async function finish(status: ApplyStatus, failReason?: string, skipReason?: string): Promise<void> {
  if (finished) return
  finished = true
  clearTimers()
  const current = task
  updateStatus(statusText(status, failReason, skipReason))
  if (current) {
    removeSession(triggerKey(current.jobId))
    removeSession(startedKey(current.jobId))
    if (failReason === 'CAPTCHA') {
      void ask({ type: 'CAPTCHA_DETECTED', where: 'APPLY' })
    }
    try {
      await chrome.runtime.sendMessage({
        type: 'APPLY_TASK_DONE',
        jobId: current.jobId,
        status,
        failReason,
        skipReason
      } satisfies RuntimeMessage)
    } catch {
      // 标签即将被关闭时忽略
    }
  }
}

function statusText(status: ApplyStatus, failReason?: string, skipReason?: string): string {
  if (status === 'SENT') return '已发送，投递结果已回报'
  if (status === 'SKIPPED') {
    if (skipReason === 'NO_CONFIRM') return '等待超时，已跳过该岗位'
    if (skipReason === 'ALREADY_APPLIED') return '已沟通过，跳过'
    if (skipReason === 'MANUAL_CANCEL') return '已取消自动投递'
    return '已跳过该岗位'
  }
  switch (failReason) {
    case 'CAPTCHA':
      return '检测到验证码：已停止队列，请手动完成验证'
    case 'LOGIN_REQUIRED':
      return 'Boss 未登录，无法投递'
    case 'SELECTOR_MISS':
      return '页面元素未找到，已降级为手动操作'
    default:
      return '投递失败，已停止该条'
  }
}

function clearTimers(): void {
  if (countdownTimer) {
    clearInterval(countdownTimer)
    countdownTimer = null
  }
  if (actionTimer) {
    clearTimeout(actionTimer)
    actionTimer = null
  }
}

function startCountdown(): void {
  if (countdownTimer) clearInterval(countdownTimer)
  countdownTimer = setInterval(() => {
    if (finished) return
    if (task?.level === 'L2') {
      const left = Math.max(0, Math.ceil((L2_CONFIRM_TIMEOUT_MS - (Date.now() - startedAt)) / 1000))
      updateHint(`L2：请在页面点击发送；剩余 ${left}s，超时自动跳过`)
    }
  }, 1000)
}

/* ---------------- 面板 ---------------- */

function buildPanel(current: ApplyTask): void {
  panel?.remove()
  panel = document.createElement('div')
  panel.id = 'jobfit-apply-panel'
  panel.innerHTML = `
    <div class="jf-head">
      <span class="jf-title">JobFit 投递助手</span>
      <span class="jf-level">${current.level}</span>
    </div>
    <div class="jf-status">正在准备…</div>
    <textarea class="jf-greeting" rows="4" spellcheck="false"></textarea>
    <div class="jf-actions">
      <button type="button" class="jf-primary">确认发送</button>
      <button type="button" class="jf-secondary">跳过</button>
    </div>
    <div class="jf-hint"></div>
  `
  document.documentElement.appendChild(panel)
  statusLine = panel.querySelector('.jf-status')
  hintLine = panel.querySelector('.jf-hint')
  greetingBox = panel.querySelector('.jf-greeting')
  if (greetingBox) greetingBox.value = current.greeting
  updateStatus(`准备投递：${current.title}${current.company ? ' · ' + current.company : ''}`)
}

function setPrimary(label: string, handler: () => void): void {
  const button = panel?.querySelector('.jf-primary')
  if (!(button instanceof HTMLButtonElement)) return
  button.textContent = label
  button.onclick = handler
}

function setSecondary(label: string | null, handler: (() => void) | null): void {
  const button = panel?.querySelector('.jf-secondary')
  if (!(button instanceof HTMLButtonElement)) return
  if (!label || !handler) {
    button.style.display = 'none'
    button.onclick = null
    return
  }
  button.style.display = ''
  button.textContent = label
  button.onclick = handler
}

function updateStatus(text: string): void {
  if (statusLine) statusLine.textContent = text
}

function updateHint(text: string): void {
  if (hintLine) hintLine.textContent = text
}

function injectStyles(): void {
  if (document.getElementById('jobfit-apply-style')) return
  const style = document.createElement('style')
  style.id = 'jobfit-apply-style'
  style.textContent = `
    #jobfit-apply-panel {
      position: fixed; left: 16px; bottom: 16px; z-index: 2147483647;
      width: 320px; padding: 12px; border-radius: 10px; background: #ffffff;
      border: 1px solid #e5e7eb; box-shadow: 0 10px 30px rgba(0, 0, 0, .18);
      font: 13px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif;
      color: #111827;
    }
    #jobfit-apply-panel .jf-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
    #jobfit-apply-panel .jf-title { font-weight: 600; }
    #jobfit-apply-panel .jf-level {
      font-size: 11px; padding: 1px 6px; border-radius: 4px;
      background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0;
    }
    #jobfit-apply-panel .jf-status { color: #374151; margin-bottom: 8px; word-break: break-all; }
    #jobfit-apply-panel .jf-greeting {
      width: 100%; box-sizing: border-box; resize: vertical; padding: 8px;
      border: 1px solid #d1d5db; border-radius: 6px; font: inherit; color: #111827;
      background: #f9fafb; margin-bottom: 8px;
    }
    #jobfit-apply-panel .jf-actions { display: flex; gap: 8px; }
    #jobfit-apply-panel button {
      flex: 1; padding: 6px 10px; border-radius: 6px; cursor: pointer; font: inherit;
      border: 1px solid #d1d5db; background: #fff; color: #374151;
    }
    #jobfit-apply-panel button.jf-primary { background: #111827; border-color: #111827; color: #fff; }
    #jobfit-apply-panel .jf-hint { margin-top: 8px; font-size: 11px; color: #6b7280; }
  `
  document.documentElement.appendChild(style)
}

/* ---------------- 页面事件 ---------------- */

function bindPageEvents(): void {
  if (clickBound) return
  clickBound = true
  document.addEventListener(
    'click',
    (event) => {
      if (finished || !task || task.level !== 'L2') return
      const target = event.target as Element | null
      if (matchesAny(target, selectors?.detail.sendButton)) {
        setTimeout(() => void finish('SENT'), 700)
      }
    },
    true
  )
  document.addEventListener(
    'keydown',
    (event) => {
      if (finished || !task || task.level !== 'L2') return
      if (event.key !== 'Enter' || event.shiftKey) return
      if (greetingBox && event.target === greetingBox) {
        setTimeout(() => void finish('SENT'), 900)
      }
    },
    true
  )
}

function detectLogin(): boolean {
  if (selectors.login.loggedIn?.some((selector) => isVisible(queryFirst(document, [selector])))) return true
  if (selectors.login.loginDialog?.some((selector) => isVisible(queryFirst(document, [selector])))) return false
  if (selectors.login.loginEntry?.some((selector) => isVisible(queryFirst(document, [selector])))) return false
  return true
}

function captchaDetected(): boolean {
  if (selectors.captcha.container?.some((selector) => isVisible(queryFirst(document, [selector])))) {
    return true
  }
  return /验证|安全验证/.test(document.title)
}

/* ---------------- 工具 ---------------- */

async function ask<T>(message: RuntimeMessage): Promise<T | null> {
  try {
    const response = (await chrome.runtime.sendMessage(message)) as BgResponse<T> | undefined
    if (!response?.ok) return null
    return (response.data ?? null) as T | null
  } catch {
    return null
  }
}

function triggerKey(jobId: number): string {
  return `jobfit:apply:trigger:${jobId}`
}

function startedKey(jobId: number): string {
  return `jobfit:apply:started:${jobId}`
}

function readSession(key: string): string | null {
  try {
    return sessionStorage.getItem(key)
  } catch {
    return null
  }
}

function readSessionNumber(key: string): number | null {
  const value = readSession(key)
  if (!value) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function writeSession(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value)
  } catch {
    // 某些页面禁用了 sessionStorage，不影响主流程
  }
}

function removeSession(key: string): void {
  try {
    sessionStorage.removeItem(key)
  } catch {
    // ignore
  }
}
