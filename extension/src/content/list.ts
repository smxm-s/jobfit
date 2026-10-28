import { buildJdHash } from '../shared/hash.js'
import {
  absoluteUrl,
  dedupeNested,
  invalidateSelectors,
  isVisible,
  loadSelectors,
  normalizeText,
  queryAll,
  queryFirst,
  textOf,
  wait
} from '../shared/selectors.js'
import type {
  BgResponse,
  ContentBootstrap,
  JobCard,
  RuntimeMessage,
  ScoreResult,
  SelectorSet
} from '../shared/types.js'

interface CollectResult {
  queued: boolean
  threshold: number
  scores: ScoreResult[]
}

let selectors: SelectorSet
let threshold = 0.7
let batchSize = 20
let stopped = false
let degraded = false
let parseAttempts = 0
let parseSuccesses = 0
let flushFailures = 0

const parsedCards = new WeakSet<Element>()
const localHashes = new Set<string>()
const elementByHash = new Map<string, HTMLElement>()
let pending: JobCard[] = []

let observer: MutationObserver | null = null
let parseTimer: ReturnType<typeof setTimeout> | null = null
let captchaReported = false

export function init(): void {
  void main()
}

async function main(): Promise<void> {
  try {
    injectStyles()
    selectors = await loadSelectors()

    const info = await ask<ContentBootstrap>({ type: 'CONTENT_READY', pageType: 'LIST' })
    if (info) {
      threshold = info.threshold
      batchSize = info.batchSize
    }
    if (info && !info.paired) {
      showBanner('未配对：请打开浏览器工具栏的 JobFit 扩展，输入平台生成的配对码')
      return
    }

    await wait(1200)
    if (captchaDetected(true)) {
      reportCaptcha()
      return
    }
    const loggedIn = detectLogin()
    void ask({ type: 'LOGIN_STATE', loggedIn })
    if (!loggedIn) {
      showBanner('Boss 未登录：请先在本页完成登录，插件不代登录、不读取 Cookie')
      return
    }

    await parseVisible()
    startObserver()
    startInterval()
    startAutoScroll()
  } catch (error) {
    console.warn('[JobFit] 列表页初始化失败', error)
  }
}

/* ---------------- 卡片解析 ---------------- */

async function parseVisible(): Promise<void> {
  if (stopped || degraded) return
  const cards = dedupeNested(queryAll(document, selectors.list.card)) as HTMLElement[]
  for (const card of cards) {
    if (parsedCards.has(card)) continue
    parsedCards.add(card)
    parseAttempts += 1
    const job = await parseCard(card)
    if (!job) continue
    parseSuccesses += 1
    if (localHashes.has(job.jdHash)) continue
    localHashes.add(job.jdHash)
    elementByHash.set(job.jdHash, card)
    pending.push(job)
  }
  checkDegraded()
  await flushPending()
}

async function parseCard(card: HTMLElement): Promise<JobCard | null> {
  const config = selectors.list
  const title = textOf(card, config.title)
  const link =
    queryFirst(card, config.link) ?? card.querySelector("a[href*='/job_detail/']")
  const jobUrl = absoluteUrl(link?.getAttribute('href') ?? '')
  if (!title || !jobUrl) return null

  const allTags = queryAll(card, config.tags)
    .map((element) => normalizeText(element.textContent))
    .filter(Boolean)

  const company = textOf(card, config.company)
  const city = textOf(card, config.city)
  const salary = textOf(card, config.salary)
  let exp = textOf(card, config.exp)
  let degree = textOf(card, config.degree)
  if (!exp) exp = allTags.find(isExpTag) ?? ''
  if (!degree) degree = allTags.find(isDegreeTag) ?? ''
  const skillTags = allTags.filter((tag) => tag !== exp && tag !== degree).slice(0, 12)
  const jdSummary = textOf(card, config.jdSummary).slice(0, 500)

  const jdHash = await buildJdHash(title, company, jobUrl)
  return { title, company, city, salary, exp, degree, tags: skillTags, jdSummary, jobUrl, jdHash }
}

function isExpTag(tag: string): boolean {
  return /(应届|在校|经验不限|无经验|\d+\s*[-–~]\s*\d+\s*年|\d+\s*年以上|\d+\s*年以内)/.test(tag)
}

function isDegreeTag(tag: string): boolean {
  return /^(学历不限|初中|高中|中专|大专|本科|硕士|博士)$/.test(tag)
}

function checkDegraded(): void {
  if (degraded || parseAttempts < 10) return
  if (parseSuccesses / parseAttempts >= 0.3) return
  degraded = true
  stopped = true
  observer?.disconnect()
  showBanner('页面结构与选择器不匹配，已降级为仅打开链接；请更新 selectors.json')
  void ask({ type: 'DEGRADED', reason: `parse rate ${parseSuccesses}/${parseAttempts}` })
}

async function flushPending(): Promise<void> {
  if (!pending.length || degraded) return
  const jobs = pending.splice(0)
  const result = await ask<CollectResult>({ type: 'COLLECT_JOBS', jobs })
  if (!result) {
    flushFailures += 1
    if (flushFailures <= 3) {
      pending.unshift(...jobs)
    } else {
      showBanner('岗位上报连续失败，请检查 JobFit 服务与配对状态')
    }
    return
  }
  flushFailures = 0
  if (typeof result.threshold === 'number') threshold = result.threshold
  if (result.scores?.length) applyScores(result.scores, result.threshold)
}

/* ---------------- 分数角标 ---------------- */

function applyScores(items: ScoreResult[], nextThreshold?: number): void {
  if (typeof nextThreshold === 'number') threshold = nextThreshold
  for (const item of items) {
    const card = elementByHash.get(item.jdHash)
    if (!card) continue
    renderScore(card, item)
  }
}

function renderScore(card: HTMLElement, item: ScoreResult): void {
  card.classList.add('jobfit-card')
  let badge = card.querySelector(':scope > .jobfit-badge') as HTMLElement | null
  if (!badge) {
    badge = document.createElement('span')
    badge.className = 'jobfit-badge'
    card.appendChild(badge)
  }

  const score = item.score
  let tier: 'green' | 'yellow' | 'gray' = 'gray'
  if (item.rejectReason) {
    tier = 'gray'
  } else if (score != null && score >= threshold) {
    tier = 'green'
  } else if (score != null && score >= 0.6) {
    tier = 'yellow'
  }

  if (item.rejectReason) {
    badge.textContent = item.rejectReason === 'EXCLUDED' ? '已排除' : '未评分'
    badge.title = `服务端拒绝原因：${item.rejectReason}`
  } else if (score == null) {
    badge.textContent = '—'
    badge.title = '暂未返回分数'
  } else {
    badge.textContent = String(Math.round(score * 100))
    const stage = item.stage === 'FINE' ? '精算' : '粗筛'
    const hit = item.hitSkills.length ? `命中：${item.hitSkills.join(' / ')}` : ''
    const miss = item.missSkills.length ? `缺失：${item.missSkills.join(' / ')}` : ''
    badge.title = [`匹配分 ${(score * 100).toFixed(0)}（${stage}）`, hit, miss].filter(Boolean).join('\n')
  }
  badge.classList.remove('green', 'yellow', 'gray')
  badge.classList.add(tier)
  card.dataset.jobfitScore = score != null ? score.toFixed(4) : ''

  if (item.rejectReason || score == null || score < threshold) {
    foldCard(card)
  }
}

function foldCard(card: HTMLElement): void {
  card.classList.add('jobfit-folded')
  if (card.querySelector(':scope > .jobfit-toggle')) return
  const toggle = document.createElement('button')
  toggle.type = 'button'
  toggle.className = 'jobfit-toggle'
  toggle.textContent = '展开'
  toggle.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    const folded = card.classList.toggle('jobfit-folded')
    toggle.textContent = folded ? '展开' : '收起'
  })
  card.appendChild(toggle)
}

/* ---------------- 页面状态 ---------------- */

function detectLogin(): boolean {
  const login = selectors.login
  if (login.loggedIn?.some((selector) => isVisible(queryFirst(document, [selector])))) return true
  if (login.loginDialog?.some((selector) => isVisible(queryFirst(document, [selector])))) return false
  if (login.loginEntry?.some((selector) => isVisible(queryFirst(document, [selector])))) return false
  // 没有任何登录入口/弹窗时按“已登录”处理，避免误报
  return true
}

function captchaDetected(deep = false): boolean {
  if (selectors.captcha.container?.some((selector) => isVisible(queryFirst(document, [selector])))) {
    return true
  }
  if (/验证|安全验证/.test(document.title)) return true
  if (!deep) return false
  const hints = selectors.captcha.textHints ?? []
  const text = normalizeText(document.body?.innerText ?? '').slice(0, 3000)
  return hints.some((hint) => text.includes(hint))
}

function reportCaptcha(): void {
  if (captchaReported) return
  captchaReported = true
  stopped = true
  observer?.disconnect()
  showBanner('检测到验证码/风控页：已停止采集并暂停投递队列，请手动完成验证')
  void ask({ type: 'CAPTCHA_DETECTED', where: 'LIST' })
}

/* ---------------- 滚动与观察 ---------------- */

function startObserver(): void {
  if (!document.body) return
  observer = new MutationObserver(() => {
    if (parseTimer) return
    parseTimer = setTimeout(() => {
      parseTimer = null
      void parseVisible()
    }, 800)
  })
  observer.observe(document.body, { childList: true, subtree: true })
}

function startInterval(): void {
  setInterval(() => {
    if (stopped || degraded) return
    if (captchaDetected()) {
      reportCaptcha()
      return
    }
    void parseVisible()
  }, 2500)
}

function startAutoScroll(): void {
  if (stopped || degraded) return
  let idleRounds = 0
  let rounds = 0
  const step = (): void => {
    if (stopped || degraded || rounds >= 30) return
    rounds += 1
    if (document.hidden) {
      setTimeout(step, 3000)
      return
    }
    const before = queryAll(document, selectors.list.card).length
    window.scrollTo({
      top: Math.max(document.body.scrollHeight, document.documentElement.scrollHeight),
      behavior: 'smooth'
    })
    setTimeout(() => {
      void parseVisible()
      const after = queryAll(document, selectors.list.card).length
      if (after > before) {
        idleRounds = 0
      } else {
        idleRounds += 1
      }
      if (idleRounds >= 3) return
      setTimeout(step, 1600)
    }, 1400)
  }
  setTimeout(step, 2000)
}

/* ---------------- UI ---------------- */

function injectStyles(): void {
  if (document.getElementById('jobfit-list-style')) return
  const style = document.createElement('style')
  style.id = 'jobfit-list-style'
  style.textContent = `
    .jobfit-card { position: relative !important; }
    .jobfit-badge {
      position: absolute; top: 8px; right: 8px; z-index: 20;
      min-width: 42px; height: 22px; padding: 0 8px; border-radius: 11px;
      font: 600 12px/22px -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif;
      color: #fff; text-align: center; cursor: default; box-shadow: 0 1px 3px rgba(0, 0, 0, .18);
      white-space: nowrap;
    }
    .jobfit-badge.green { background: #16a34a; }
    .jobfit-badge.yellow { background: #d97706; }
    .jobfit-badge.gray { background: #9ca3af; }
    .jobfit-toggle {
      position: absolute; top: 8px; right: 58px; z-index: 21;
      font-size: 11px; line-height: 18px; padding: 0 6px; border-radius: 4px;
      border: 1px solid #d1d5db; background: #fff; color: #374151; cursor: pointer;
    }
    .jobfit-folded { max-height: 52px !important; overflow: hidden !important; opacity: .72; }
    .jobfit-folded .jobfit-badge, .jobfit-folded .jobfit-toggle { opacity: 1; }
    #jobfit-banner {
      position: fixed; right: 16px; bottom: 16px; z-index: 2147483647;
      max-width: 360px; padding: 10px 14px; border-radius: 8px;
      background: #111827; color: #f9fafb; font: 13px/1.5 -apple-system, "PingFang SC", sans-serif;
      box-shadow: 0 8px 24px rgba(0, 0, 0, .28); cursor: pointer;
    }
  `
  document.documentElement.appendChild(style)
}

function showBanner(text: string): void {
  let banner = document.getElementById('jobfit-banner')
  if (!banner) {
    banner = document.createElement('div')
    banner.id = 'jobfit-banner'
    banner.addEventListener('click', () => banner?.remove())
    document.documentElement.appendChild(banner)
  }
  banner.textContent = text
}

/* ---------------- 消息 ---------------- */

async function ask<T>(message: RuntimeMessage): Promise<T | null> {
  try {
    const response = (await chrome.runtime.sendMessage(message)) as BgResponse<T> | undefined
    if (!response?.ok) return null
    return (response.data ?? null) as T | null
  } catch {
    return null
  }
}

chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
  if (message.type === 'SCORE_UPDATE') {
    applyScores(message.items, message.threshold)
    sendResponse({ ok: true })
    return
  }
  if (message.type === 'PAUSE_STATE') {
    if (message.paused.value) {
      showBanner(`队列已暂停：${reasonText(message.paused.reason)}`)
    }
    sendResponse({ ok: true })
    return
  }
  if (message.type === 'SELECTORS_UPDATED') {
    invalidateSelectors()
    void loadSelectors(true).then((next) => {
      selectors = next
    })
    sendResponse({ ok: true })
    return
  }
  if (message.type === 'NOTICE') {
    showBanner(message.message)
    sendResponse({ ok: true })
  }
})

function reasonText(reason: string | null): string {
  switch (reason) {
    case 'CAPTCHA':
      return '检测到验证码，请手动完成验证后在 popup 继续'
    case 'CONSECUTIVE_FAILURES':
      return '连续投递失败，已停止队列'
    case 'QUOTA':
      return '今日投递额度已用尽'
    case 'LOGIN_REQUIRED':
      return 'Boss 未登录'
    case 'TOKEN_INVALID':
      return '设备已解绑，请重新配对'
    default:
      return '已手动暂停'
  }
}
