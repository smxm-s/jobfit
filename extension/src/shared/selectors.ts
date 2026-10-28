import type { DetailSelectors, ListSelectors, SelectorSet } from './types.js'

/**
 * 兜底选择器：只在 selectors.json 读取失败时使用，保证插件不崩。
 * 真正的选择器以 selectors.json 为准，并允许服务端下发片段覆盖。
 */
const FALLBACK_SELECTORS: SelectorSet = {
  version: 0,
  list: {
    container: ['.job-list-box'],
    card: ['.job-card-wrapper', '.job-card-box'],
    link: ["a[href*='/job_detail/']"],
    title: ['.job-name'],
    company: ['.company-name'],
    city: ['.job-area'],
    salary: ['.salary'],
    exp: [],
    degree: [],
    tags: ['.tag-list li'],
    jdSummary: ['.info-desc', '.job-desc'],
    footer: ['.job-card-footer'],
    nextPage: [],
    emptyHint: []
  },
  login: {
    loggedIn: ['.nav-figure', '.header-user'],
    loginEntry: ['.header-login', '.login-btn'],
    loginDialog: ['.login-dialog']
  },
  captcha: {
    container: ['.geetest_panel', '.verify-wrap', '#captcha'],
    textHints: ['请完成验证', '安全验证', '滑动验证', '验证码']
  },
  detail: {
    jd: ['.job-sec-text', '.job-detail-section .job-sec-text'],
    title: ['h1'],
    company: ['.company-name'],
    salary: ['.salary'],
    city: ['.text-city'],
    tags: ['.tag-list li'],
    applyButton: ['.btn-startchat', '.op-btn-chat'],
    alreadyApplied: ['.btn-startchat.disabled', '.already-apply'],
    chatDialog: ['.dialog-container', '.chat-dialog'],
    greetingInput: ['.chat-input', '#chat-input', 'textarea', "div[contenteditable='true']"],
    sendButton: ['.btn-send', '.send-message'],
    sentHint: ['.chat-message']
  },
  search: {
    base: 'https://www.zhipin.com/web/geek/job',
    cityCodes: {},
    expCodes: {},
    degreeCodes: {}
  }
}

let cache: SelectorSet | null = null

/** 读取本地 selectors.json，并按 remoteSelectors（服务端下发）覆盖 */
export async function loadSelectors(force = false): Promise<SelectorSet> {
  if (cache && !force) return cache
  let local: unknown = null
  try {
    const response = await fetch(chrome.runtime.getURL('selectors.json'), { cache: 'no-store' })
    if (response.ok) local = await response.json()
  } catch {
    local = null
  }
  let remote: unknown = null
  try {
    const stored = await chrome.storage.local.get('remoteSelectors')
    remote = stored.remoteSelectors ?? null
  } catch {
    remote = null
  }
  const merged = mergeSelectors(FALLBACK_SELECTORS, local, remote)
  cache = merged
  return merged
}

export function invalidateSelectors(): void {
  cache = null
}

export function mergeSelectors(base: SelectorSet, ...overrides: unknown[]): SelectorSet {
  const target = clone(base) as unknown as Record<string, unknown>
  for (const override of overrides) {
    if (!isPlainObject(override)) continue
    mergeInto(target, override)
  }
  return target as unknown as SelectorSet
}

function mergeInto(target: Record<string, unknown>, source: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(source)) {
    if (value == null || key === '_comment') continue
    const current = target[key]
    if (Array.isArray(value)) {
      target[key] = value.map((item) => String(item)).filter(Boolean)
    } else if (isPlainObject(value)) {
      if (!isPlainObject(current)) {
        target[key] = clone(value)
      } else {
        mergeInto(current, value)
      }
    } else {
      target[key] = value
    }
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

/* ---------------- DOM 查询工具 ---------------- */

export function queryFirst(root: ParentNode, selectors: string[] | undefined): Element | null {
  if (!selectors?.length) return null
  for (const selector of selectors) {
    try {
      const element = root.querySelector(selector)
      if (element) return element
    } catch {
      // 单个选择器写错不影响其余候选
    }
  }
  return null
}

export function queryAll(root: ParentNode, selectors: string[] | undefined): Element[] {
  if (!selectors?.length) return []
  const seen = new Set<Element>()
  const result: Element[] = []
  for (const selector of selectors) {
    let elements: Element[] = []
    try {
      elements = Array.from(root.querySelectorAll(selector))
    } catch {
      elements = []
    }
    for (const element of elements) {
      if (seen.has(element)) continue
      seen.add(element)
      result.push(element)
    }
  }
  return result
}

/** 去掉嵌套的重复卡片（父卡片已命中时不再重复计算子卡片） */
export function dedupeNested(elements: Element[]): Element[] {
  return elements.filter(
    (element) => !elements.some((other) => other !== element && other.contains(element))
  )
}

export function textOf(root: ParentNode, selectors: string[] | undefined): string {
  const element = queryFirst(root, selectors)
  return normalizeText(element?.textContent ?? '')
}

export function attrOf(root: ParentNode, selectors: string[] | undefined, attr: string): string {
  const element = queryFirst(root, selectors)
  return element?.getAttribute(attr)?.trim() ?? ''
}

export function normalizeText(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim()
}

export function isVisible(element: Element | null | undefined): boolean {
  if (!element) return false
  const rect = element.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0
}

export function matchesAny(target: Element | null | undefined, selectors: string[] | undefined): boolean {
  if (!target || !selectors?.length) return false
  for (const selector of selectors) {
    try {
      if (target.closest(selector)) return true
    } catch {
      // ignore invalid selector
    }
  }
  return false
}

export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function waitForElement(
  selectors: string[] | undefined,
  timeoutMs: number,
  root: ParentNode = document
): Promise<Element | null> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const element = queryFirst(root, selectors)
    if (element) return element
    await wait(300)
  }
  return queryFirst(root, selectors)
}

/** 把相对链接转成稳定的绝对 URL（去掉 query/hash，保证 jdHash 可复算） */
export function absoluteUrl(href: string): string {
  if (!href) return ''
  try {
    const url = new URL(href, location.origin)
    if (!/(^|\.)zhipin\.com$/.test(url.hostname)) return ''
    return `${url.origin}${url.pathname}`
  } catch {
    return ''
  }
}

/** 选择器集合在内容脚本里经常用到，这里给个简化入口 */
export function listSelectors(selectors: SelectorSet): ListSelectors {
  return selectors.list
}

export function detailSelectors(selectors: SelectorSet): DetailSelectors {
  return selectors.detail
}
