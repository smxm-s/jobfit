import { ApiError, api } from '../shared/api.js'
import { CircuitBreaker } from '../shared/circuit.js'
import {
  APPLY_TASK_TIMEOUT_MS,
  L2_CONFIRM_TIMEOUT_MS,
  formatDateTime,
  isQualified,
  isWithinActiveHours,
  nextApplyDelay
} from '../shared/limiter.js'
import { loadSelectors } from '../shared/selectors.js'
import {
  DEFAULT_API_BASE,
  DEFAULT_LOGIN,
  DEFAULT_PAUSE,
  L3_DEFAULT_ENABLED,
  MAX_SEEN_HASHES,
  STORAGE_KEYS,
  clearDevice,
  effectiveApplyLevel,
  normalizeConfig,
  readDevice
} from '../shared/storage.js'
import type {
  ApplyLevel,
  ApplyStatus,
  ApplyTask,
  BatchMatchItem,
  BgResponse,
  BootstrapState,
  ContentBootstrap,
  JobCard,
  LatestVersion,
  LoginState,
  NormalizedConfig,
  PauseState,
  PopupStatus,
  QueueItem,
  QueueState,
  RuntimeMessage,
  ScoreResult,
  SelectorSet
} from '../shared/types.js'

interface RuntimeState {
  token: string
  deviceId: number | null
  userId: number | null
  apiBase: string
  config: NormalizedConfig | null
  latestVersion: LatestVersion | null
  remainingQuota: number
  queue: QueueState
  paused: PauseState
  l3Enabled: boolean
  login: LoginState
  seenHashes: Set<string>
  appliedJobIds: Set<number>
  lastHeartbeatAt: number | null
  bootstrapAt: number | null
}

interface ActiveApply {
  jobId: number
  tabId: number
  level: ApplyLevel
  startedAt: number
  greeting: string
}

interface CollectResult {
  queued: boolean
  threshold: number
  scores: ScoreResult[]
}

function freshQueue(): QueueState {
  return { pending: [], sent: 0, skipped: 0, failed: 0, activeJobId: null, nextRunAt: null }
}

const state: RuntimeState = {
  token: '',
  deviceId: null,
  userId: null,
  apiBase: DEFAULT_API_BASE,
  config: null,
  latestVersion: null,
  remainingQuota: 0,
  queue: freshQueue(),
  paused: { ...DEFAULT_PAUSE },
  l3Enabled: L3_DEFAULT_ENABLED,
  login: { ...DEFAULT_LOGIN },
  seenHashes: new Set<string>(),
  appliedJobIds: new Set<number>(),
  lastHeartbeatAt: null,
  bootstrapAt: null
}

const circuit = new CircuitBreaker(2)
const cardCache = new Map<string, JobCard>()
const bufferHashes = new Set<string>()

let initialized = false
let initPromise: Promise<void> | null = null
let buffer: JobCard[] = []
let bufferTabId: number | null = null
let bufferTimer: ReturnType<typeof setTimeout> | null = null
let flushing: Promise<void> | null = null
let activeApply: ActiveApply | null = null
let pumpTimer: ReturnType<typeof setTimeout> | null = null
let timeoutTimer: ReturnType<typeof setTimeout> | null = null
let pumping = false

/* ---------------- 生命周期 ---------------- */

async function ensureInit(): Promise<void> {
  if (initialized) return
  if (!initPromise) initPromise = doInit()
  await initPromise
}

async function doInit(): Promise<void> {
  const [device, stored] = await Promise.all([
    readDevice(),
    chrome.storage.local.get([
      STORAGE_KEYS.apiBase,
      STORAGE_KEYS.bootstrap,
      STORAGE_KEYS.queue,
      STORAGE_KEYS.paused,
      STORAGE_KEYS.l3Enabled,
      STORAGE_KEYS.seenHashes,
      STORAGE_KEYS.appliedJobIds,
      STORAGE_KEYS.login,
      STORAGE_KEYS.lastHeartbeatAt
    ])
  ])

  state.token = device.token
  state.deviceId = device.deviceId
  state.userId = device.userId
  state.apiBase = (stored[STORAGE_KEYS.apiBase] as string | undefined) || DEFAULT_API_BASE
  state.l3Enabled =
    typeof stored[STORAGE_KEYS.l3Enabled] === 'boolean'
      ? (stored[STORAGE_KEYS.l3Enabled] as boolean)
      : L3_DEFAULT_ENABLED
  state.paused = (stored[STORAGE_KEYS.paused] as PauseState | undefined) ?? { ...DEFAULT_PAUSE }
  state.login = (stored[STORAGE_KEYS.login] as LoginState | undefined) ?? { ...DEFAULT_LOGIN }
  state.lastHeartbeatAt = (stored[STORAGE_KEYS.lastHeartbeatAt] as number | undefined) ?? null
  state.queue = sanitizeQueue(stored[STORAGE_KEYS.queue] as QueueState | undefined)

  const bootstrap = stored[STORAGE_KEYS.bootstrap] as BootstrapState | undefined
  if (bootstrap) {
    state.config = bootstrap.config
    state.latestVersion = bootstrap.latestVersion ?? null
    state.remainingQuota = Number(bootstrap.remainingQuota) || 0
    state.bootstrapAt = bootstrap.fetchedAt ?? null
    for (const hash of bootstrap.jdHashes ?? []) state.seenHashes.add(hash)
  }
  const seen = (stored[STORAGE_KEYS.seenHashes] as string[] | undefined) ?? []
  for (const hash of seen) state.seenHashes.add(hash)
  const applied = (stored[STORAGE_KEYS.appliedJobIds] as number[] | undefined) ?? []
  for (const jobId of applied) state.appliedJobIds.add(jobId)

  // 背景页重启后上一次投递视为中断，避免把 activeJobId 永久挂在队列里
  state.queue.activeJobId = null
  await persistQueue()

  initialized = true
  ensureAlarms()
  updateBadge()

  if (state.token) {
    void bootstrapAtStart()
  }
}

async function bootstrapAtStart(): Promise<void> {
  try {
    await refreshBootstrap()
  } catch (error) {
    handleApiError(error)
  }
  try {
    await api.heartbeat()
    state.lastHeartbeatAt = Date.now()
    await chrome.storage.local.set({ [STORAGE_KEYS.lastHeartbeatAt]: state.lastHeartbeatAt })
  } catch (error) {
    handleApiError(error)
  }
  void pumpQueue()
}

function sanitizeQueue(raw: QueueState | undefined): QueueState {
  if (!raw || !Array.isArray(raw.pending)) return freshQueue()
  return {
    pending: raw.pending.filter(
      (item): item is QueueItem =>
        !!item &&
        typeof item.jobId === 'number' &&
        typeof item.url === 'string' &&
        item.url.length > 0
    ),
    sent: Number(raw.sent) || 0,
    skipped: Number(raw.skipped) || 0,
    failed: Number(raw.failed) || 0,
    activeJobId: null,
    nextRunAt: typeof raw.nextRunAt === 'number' ? raw.nextRunAt : null
  }
}

function ensureAlarms(): void {
  try {
    chrome.alarms.create('jobfit-tick', { periodInMinutes: 1 })
  } catch {
    // alarm 已存在时忽略
  }
}

/* ---------------- 配置与额度 ---------------- */

async function refreshBootstrap(): Promise<void> {
  if (!state.token) return
  const payload = await api.bootstrap()
  state.config = normalizeConfig(payload.config)
  state.latestVersion = payload.latestVersion ?? null
  state.remainingQuota = Number(payload.remainingQuota) || 0
  state.bootstrapAt = Date.now()
  for (const hash of payload.jdHashes ?? []) state.seenHashes.add(hash)

  if (payload.selectors) {
    await chrome.storage.local.set({ [STORAGE_KEYS.remoteSelectors]: payload.selectors })
    void broadcastToBossTabs({ type: 'SELECTORS_UPDATED' })
  }

  const snapshot: BootstrapState = {
    config: state.config,
    latestVersion: state.latestVersion,
    remainingQuota: state.remainingQuota,
    jdHashes: Array.from(state.seenHashes).slice(-MAX_SEEN_HASHES),
    fetchedAt: state.bootstrapAt
  }
  await chrome.storage.local.set({ [STORAGE_KEYS.bootstrap]: snapshot })

  if (state.paused.value && state.paused.reason === 'QUOTA' && state.remainingQuota > 0) {
    await setPaused(null, false)
  }
  updateBadge()
}

async function ensureBootstrap(): Promise<void> {
  if (!state.token) return
  if (state.config && state.bootstrapAt && Date.now() - state.bootstrapAt < 10 * 60_000) return
  try {
    await refreshBootstrap()
  } catch (error) {
    handleApiError(error)
  }
}

/* ---------------- 配对 ---------------- */

async function pairDevice(rawCode: string, deviceName?: string): Promise<PopupStatus> {
  const code = normalizePairCode(rawCode)
  if (!code) {
    throw new Error('请输入 6-10 位配对码')
  }
  const result = await api.pair(code, deviceName?.trim() || defaultDeviceName())
  state.token = result.deviceToken
  state.deviceId = result.deviceId
  state.userId = result.userId
  state.paused = { ...DEFAULT_PAUSE }
  state.login = { ...DEFAULT_LOGIN }
  state.config = null
  state.latestVersion = null
  state.remainingQuota = 0
  state.bootstrapAt = null
  state.queue = freshQueue()
  state.seenHashes.clear()
  state.appliedJobIds.clear()
  circuit.reset()
  await chrome.storage.local.remove([
    STORAGE_KEYS.bootstrap,
    STORAGE_KEYS.queue,
    STORAGE_KEYS.seenHashes,
    STORAGE_KEYS.appliedJobIds,
    STORAGE_KEYS.login
  ])
  await chrome.storage.local.set({
    [STORAGE_KEYS.deviceToken]: result.deviceToken,
    [STORAGE_KEYS.deviceId]: result.deviceId,
    [STORAGE_KEYS.userId]: result.userId,
    [STORAGE_KEYS.paused]: state.paused
  })
  await persistQueue()
  try {
    await refreshBootstrap()
  } catch {
    // token 已保存，平台暂不可用时 popup 会显示“待连接”
  }
  try {
    await api.heartbeat()
    state.lastHeartbeatAt = Date.now()
  } catch {
    // 心跳失败不影响配对结果
  }
  updateBadge()
  return buildStatus()
}

/** 后端配对码形如 "7K3D-9QX2"；用户漏输横线时补上，输入长度按 6-10 位校验 */
function normalizePairCode(input: string): string {
  const raw = (input ?? '').trim().toUpperCase()
  const compact = raw.replace(/[\s-]/g, '')
  if (!/^[A-Z0-9]{6,10}$/.test(compact)) return ''
  if (!raw.includes('-') && compact.length === 8) {
    return `${compact.slice(0, 4)}-${compact.slice(4)}`
  }
  return raw
}

function defaultDeviceName(): string {
  const ua = navigator.userAgent
  const os = /Windows/.test(ua) ? 'Win' : /Mac OS X/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'Unknown'
  const browser = /Edg\//.test(ua) ? 'Edge' : 'Chrome'
  return `${browser}-${os}`
}

/* ---------------- 采集与批量打分 ---------------- */

async function handleCollect(jobs: JobCard[], tabId: number | null): Promise<CollectResult> {
  await ensureBootstrap()
  if (!state.token) throw new Error('设备未配对，请先在扩展 popup 输入配对码')
  const threshold = state.config?.scoreThreshold ?? 0.7
  const fresh: JobCard[] = []
  for (const raw of jobs ?? []) {
    const card = sanitizeCard(raw)
    if (!card) continue
    if (state.seenHashes.has(card.jdHash) || bufferHashes.has(card.jdHash)) continue
    bufferHashes.add(card.jdHash)
    cardCache.set(card.jdHash, card)
    fresh.push(card)
  }
  if (!fresh.length) {
    return { queued: false, threshold, scores: [] }
  }
  buffer.push(...fresh)
  if (tabId != null) bufferTabId = tabId
  const batchSize = state.config?.batchSize ?? 20
  if (buffer.length >= batchSize) {
    await flushBatch()
    return { queued: false, threshold, scores: [] }
  }
  scheduleFlush()
  return { queued: true, threshold, scores: [] }
}

function scheduleFlush(): void {
  if (bufferTimer) clearTimeout(bufferTimer)
  bufferTimer = setTimeout(() => {
    bufferTimer = null
    void flushBatch()
  }, 4000)
}

async function flushBatch(): Promise<void> {
  if (flushing) {
    await flushing
    return
  }
  if (!buffer.length) return
  const tabId = bufferTabId
  const jobs = buffer.splice(0)
  const hashes = new Set(jobs.map((job) => job.jdHash))
  for (const hash of hashes) bufferHashes.delete(hash)

  flushing = (async () => {
    const batchId = `b-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    let response: Awaited<ReturnType<typeof api.ingest>> | null = null
    for (let attempt = 0; attempt < 2 && !response; attempt += 1) {
      try {
        response = await api.ingest({ batchId, jobs })
      } catch (error) {
        handleApiError(error)
        if (attempt === 0) await delay(2000)
      }
    }
    if (!response) {
      if (tabId != null) {
        void sendToTab(tabId, { type: 'NOTICE', message: '岗位上报失败，请确认平台服务是否可用' })
      }
      return
    }

    for (const hash of hashes) state.seenHashes.add(hash)
    await saveSeenHashes()

    const accepted = response.accepted ?? []
    const rejected = response.rejected ?? []
    const acceptedIds = accepted.map((item) => item.jobId)
    const versionId = state.latestVersion?.versionId ?? state.config?.resumeVersionId ?? null

    let matchItems: BatchMatchItem[] = []
    if (acceptedIds.length && versionId != null) {
      try {
        matchItems = await api.batchMatch(versionId, acceptedIds)
      } catch (error) {
        handleApiError(error)
        matchItems = []
      }
    }
    const byJobId = new Map(matchItems.map((item) => [item.jobId, item]))

    const items: ScoreResult[] = accepted.map((item) => {
      const match = byJobId.get(item.jobId)
      return {
        jdHash: item.jdHash,
        jobId: item.jobId,
        score: match?.score ?? null,
        stage: match?.stage ?? null,
        hitSkills: match?.hitSkills ?? [],
        missSkills: match?.missSkills ?? [],
        rejectReason: match?.rejectReason ?? (versionId == null ? 'NO_RESUME' : null)
      }
    })
    for (const item of rejected) {
      items.push({
        jdHash: item.jdHash,
        jobId: null,
        score: null,
        stage: null,
        hitSkills: [],
        missSkills: [],
        rejectReason: item.reason || 'REJECTED'
      })
    }

    if (tabId != null) {
      void sendToTab(tabId, {
        type: 'SCORE_UPDATE',
        items,
        threshold: state.config?.scoreThreshold ?? 0.7
      })
    }
    await enqueueQualified(items)
    if (tabId != null && versionId == null && acceptedIds.length) {
      void sendToTab(tabId, { type: 'NOTICE', message: '未找到简历版本，已采集岗位但无法打分' })
    }
  })()

  try {
    await flushing
  } finally {
    flushing = null
  }
}

function sanitizeCard(card: JobCard): JobCard | null {
  const title = (card?.title ?? '').trim()
  const jobUrl = (card?.jobUrl ?? '').trim()
  const jdHash = (card?.jdHash ?? '').trim()
  if (!title || !jobUrl || jdHash.length !== 64) return null
  return {
    title,
    company: (card.company ?? '').trim(),
    city: (card.city ?? '').trim(),
    salary: (card.salary ?? '').trim(),
    exp: (card.exp ?? '').trim(),
    degree: (card.degree ?? '').trim(),
    tags: Array.isArray(card.tags) ? card.tags.map((tag) => String(tag).trim()).filter(Boolean).slice(0, 20) : [],
    jdSummary: (card.jdSummary ?? '').trim().slice(0, 500),
    jobUrl,
    jdHash
  }
}

async function saveSeenHashes(): Promise<void> {
  const list = Array.from(state.seenHashes)
  const trimmed = list.length > MAX_SEEN_HASHES ? list.slice(list.length - MAX_SEEN_HASHES) : list
  state.seenHashes = new Set(trimmed)
  await chrome.storage.local.set({ [STORAGE_KEYS.seenHashes]: trimmed })
}

async function enqueueQualified(items: ScoreResult[]): Promise<void> {
  const config = state.config
  if (!config) return
  if (effectiveApplyLevel(config, state.l3Enabled) === 'L1') return
  let changed = false
  for (const item of items) {
    if (item.jobId == null) continue
    if (!isQualified(item.score, config.scoreThreshold, item.rejectReason)) continue
    if (state.appliedJobIds.has(item.jobId)) continue
    if (state.queue.pending.some((queued) => queued.jobId === item.jobId)) continue
    const card = cardCache.get(item.jdHash)
    if (!card) continue
    state.queue.pending.push({
      jobId: item.jobId,
      jdHash: item.jdHash,
      title: card.title,
      company: card.company,
      url: card.jobUrl,
      score: item.score as number,
      stage: item.stage ?? 'COARSE',
      addedAt: Date.now()
    })
    changed = true
  }
  if (!changed) return
  state.queue.pending.sort((a, b) => b.score - a.score)
  await persistQueue()
  updateBadge()
  void pumpQueue()
}

/* ---------------- 投递队列 ---------------- */

async function pumpQueue(): Promise<void> {
  if (pumping) return
  pumping = true
  try {
    if (!state.token || !state.config) return
    if (state.paused.value) return
    const level = effectiveApplyLevel(state.config, state.l3Enabled)
    if (level === 'L1') return
    if (activeApply) return
    if (!state.queue.pending.length) return
    if (state.remainingQuota <= 0) {
      await setPaused('QUOTA')
      return
    }
    if (level === 'L3') {
      if (!isWithinActiveHours(state.config.activeHours)) return
      if (state.queue.nextRunAt && Date.now() < state.queue.nextRunAt) {
        schedulePump(state.queue.nextRunAt - Date.now())
        return
      }
    }
    await openApplyTab(level)
  } finally {
    pumping = false
  }
}

async function openApplyTab(level: ApplyLevel): Promise<void> {
  const config = state.config
  const item = state.queue.pending[0]
  if (!config || !item) return
  const greeting = buildGreeting(config.greetingTemplate, item)
  const tab = await chrome.tabs.create({ url: item.url, active: level === 'L2' })
  const tabId = tab.id
  if (tabId == null) return
  activeApply = { jobId: item.jobId, tabId, level, startedAt: Date.now(), greeting }
  state.queue.activeJobId = item.jobId
  await persistQueue()
  scheduleTimeoutCheck(level === 'L2' ? L2_CONFIRM_TIMEOUT_MS : APPLY_TASK_TIMEOUT_MS)
  // 内容脚本就绪时间不确定，onUpdated 之外再做一次兜底重发
  setTimeout(() => {
    if (activeApply?.tabId === tabId) void sendApplyTask(tabId)
  }, 1500)
  updateBadge()
}

async function sendApplyTask(tabId: number): Promise<void> {
  const active = activeApply
  if (!active || active.tabId !== tabId) return
  const item = state.queue.pending.find((queued) => queued.jobId === active.jobId)
  const task: ApplyTask = {
    jobId: active.jobId,
    jobUrl: item?.url ?? '',
    title: item?.title ?? '',
    company: item?.company ?? '',
    level: active.level,
    greeting: active.greeting
  }
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const response = await trySend(tabId, { type: 'APPLY_TASK', task })
    if (response) return
    await delay(700)
  }
  await recordApplyResult(active.jobId, 'FAILED', 'CONTENT_NOT_READY')
}

function buildGreeting(template: string, item: QueueItem): string {
  const source = template.trim() || '您好，我对{job}岗位很感兴趣，方便沟通一下吗？'
  return source.replace(/\{job\}/g, item.title || '该').replace(/\{company\}/g, item.company || '贵公司')
}

async function recordApplyResult(
  jobId: number,
  status: ApplyStatus,
  failReason?: string,
  skipReason?: string
): Promise<void> {
  const active = activeApply
  const inQueue = state.queue.pending.some((item) => item.jobId === jobId)
  // 内容脚本与 CAPTCHA 检测可能同时回报同一条，已处理过的直接忽略
  if (!active && !inQueue) return
  const level = active?.level ?? effectiveApplyLevel(state.config, state.l3Enabled)
  if (active?.jobId === jobId) {
    activeApply = null
    clearTimeoutCheck()
  }
  state.queue.pending = state.queue.pending.filter((item) => item.jobId !== jobId)
  state.queue.activeJobId = null
  if (status === 'SENT') {
    state.queue.sent += 1
    state.appliedJobIds.add(jobId)
    state.remainingQuota = Math.max(0, state.remainingQuota - 1)
  } else if (status === 'SKIPPED') {
    state.queue.skipped += 1
  } else {
    state.queue.failed += 1
  }
  await persistQueue()
  await chrome.storage.local.set({
    [STORAGE_KEYS.appliedJobIds]: Array.from(state.appliedJobIds).slice(-500)
  })

  try {
    const result = await api.reportApplications([
      {
        jobId,
        applyLevel: level,
        status,
        appliedAt: status === 'SENT' ? formatDateTime() : undefined,
        skipReason,
        failReason
      }
    ])
    if (typeof result?.remainingQuota === 'number') {
      state.remainingQuota = result.remainingQuota
    }
  } catch (error) {
    handleApiError(error)
  }

  if (failReason === 'CAPTCHA') {
    circuit.trip('CAPTCHA')
  } else if (status === 'FAILED') {
    circuit.recordFailure('CONSECUTIVE_FAILURES')
  } else if (status === 'SENT') {
    circuit.recordSuccess()
  }
  if (circuit.isOpen) {
    await setPaused(failReason === 'CAPTCHA' ? 'CAPTCHA' : 'CONSECUTIVE_FAILURES')
  }

  if (active) {
    const closeTab = active.level === 'L3' || status !== 'SENT'
    if (closeTab) {
      try {
        await chrome.tabs.remove(active.tabId)
      } catch {
        // 用户可能已关闭标签
      }
    }
  }

  if (level === 'L3') {
    const wait = nextApplyDelay()
    state.queue.nextRunAt = Date.now() + wait
    await persistQueue()
    schedulePump(wait)
  }
  updateBadge()
  setTimeout(() => void pumpQueue(), 100)
}

function schedulePump(delayMs: number): void {
  if (pumpTimer) clearTimeout(pumpTimer)
  pumpTimer = setTimeout(() => {
    pumpTimer = null
    void pumpQueue()
  }, Math.max(1000, delayMs))
}

function scheduleTimeoutCheck(delayMs: number): void {
  clearTimeoutCheck()
  timeoutTimer = setTimeout(() => {
    timeoutTimer = null
    checkActiveTimeout()
  }, delayMs + 500)
}

function clearTimeoutCheck(): void {
  if (timeoutTimer) {
    clearTimeout(timeoutTimer)
    timeoutTimer = null
  }
}

function checkActiveTimeout(): void {
  if (!activeApply) return
  const limit = activeApply.level === 'L2' ? L2_CONFIRM_TIMEOUT_MS : APPLY_TASK_TIMEOUT_MS
  if (Date.now() - activeApply.startedAt >= limit) {
    void recordApplyResult(activeApply.jobId, 'SKIPPED', undefined, 'NO_CONFIRM')
  }
}

/* ---------------- 熔断与暂停 ---------------- */

async function onCaptcha(where: string): Promise<void> {
  circuit.trip('CAPTCHA')
  await setPaused('CAPTCHA')
  console.warn('[JobFit] 检测到验证码/风控页，队列已熔断', where)
  const active = activeApply
  if (active) {
    await recordApplyResult(active.jobId, 'FAILED', 'CAPTCHA')
  }
}

async function setPaused(reason: string | null, value = true): Promise<void> {
  state.paused = value
    ? { value: true, reason: reason ?? 'MANUAL', at: Date.now() }
    : { value: false, reason: null, at: null }
  await chrome.storage.local.set({ [STORAGE_KEYS.paused]: state.paused })
  void broadcastToBossTabs({ type: 'PAUSE_STATE', paused: state.paused })
  updateBadge()
}

function handleApiError(error: unknown): void {
  if (error instanceof ApiError && (error.code === 6002 || error.code === 1002)) {
    state.token = ''
    state.deviceId = null
    state.userId = null
    state.config = null
    state.latestVersion = null
    void clearDevice()
    void setPaused('TOKEN_INVALID')
  }
}

/* ---------------- 消息处理 ---------------- */

async function handleMessage(
  message: RuntimeMessage,
  sender: chrome.runtime.MessageSender
): Promise<unknown> {
  await ensureInit()
  switch (message.type) {
    case 'GET_STATUS':
      if (state.token && !state.config) await ensureBootstrap()
      return buildStatus()
    case 'PAIR':
      return pairDevice(message.code, message.deviceName)
    case 'REFRESH_BOOTSTRAP':
      await refreshBootstrap()
      return buildStatus()
    case 'SET_PAUSED':
      if (message.paused) {
        await setPaused('MANUAL')
      } else {
        circuit.reset()
        await setPaused(null, false)
        void pumpQueue()
      }
      return buildStatus()
    case 'SET_L3':
      state.l3Enabled = Boolean(message.enabled)
      await chrome.storage.local.set({ [STORAGE_KEYS.l3Enabled]: state.l3Enabled })
      void pumpQueue()
      return buildStatus()
    case 'OPEN_LIST_PAGE': {
      const selectors = await loadSelectors()
      const url = buildSearchUrl(state.config, selectors)
      await chrome.tabs.create({ url, active: true })
      return { url }
    }
    case 'OPEN_WEB': {
      const url = `${state.apiBase}/agent`
      await chrome.tabs.create({ url, active: true })
      return { url }
    }
    case 'CONTENT_READY':
      if (state.token && !state.config) void ensureBootstrap()
      return buildContentBootstrap()
    case 'COLLECT_JOBS':
      return handleCollect(message.jobs, sender.tab?.id ?? null)
    case 'LOGIN_STATE':
      state.login = { onBoss: true, loggedIn: Boolean(message.loggedIn), checkedAt: Date.now() }
      await chrome.storage.local.set({ [STORAGE_KEYS.login]: state.login })
      if (!message.loggedIn && state.queue.pending.length) {
        await setPaused('LOGIN_REQUIRED')
      } else if (message.loggedIn && state.paused.reason === 'LOGIN_REQUIRED') {
        await setPaused(null, false)
      }
      return { ok: true }
    case 'CAPTCHA_DETECTED':
      await onCaptcha(message.where)
      return buildStatus()
    case 'DEGRADED':
      console.warn('[JobFit] 页面解析降级：', message.reason)
      return { ok: true }
    case 'DETAIL_READY': {
      const item = state.queue.pending.find((queued) => queued.url === message.detail.jobUrl)
      if (item) {
        if (message.detail.title) item.title = message.detail.title
        if (message.detail.company) item.company = message.detail.company
        await persistQueue()
      }
      // JD 全文只在内存中转，不落库、不上传
      return { ok: true }
    }
    case 'GET_APPLY_TASK': {
      const tabId = sender.tab?.id
      if (!tabId || !activeApply || activeApply.tabId !== tabId) return { task: null }
      const item = state.queue.pending.find((queued) => queued.jobId === activeApply?.jobId)
      const task: ApplyTask = {
        jobId: activeApply.jobId,
        jobUrl: item?.url ?? '',
        title: item?.title ?? '',
        company: item?.company ?? '',
        level: activeApply.level,
        greeting: activeApply.greeting
      }
      return { task }
    }
    case 'APPLY_TASK_DONE':
      await recordApplyResult(message.jobId, message.status, message.failReason, message.skipReason)
      return buildStatus()
    default:
      return null
  }
}

function buildStatus(): PopupStatus {
  const config = state.config
  const limit = config?.dailyLimit ?? 30
  const remaining = Math.max(0, Math.min(limit, state.remainingQuota))
  return {
    paired: Boolean(state.token),
    connected: Boolean(state.token && config),
    apiBase: state.apiBase,
    config: {
      applyLevel: config?.applyLevel ?? 'L1',
      effectiveLevel: effectiveApplyLevel(config, state.l3Enabled),
      threshold: config?.scoreThreshold ?? 0.7,
      dailyLimit: limit,
      batchSize: config?.batchSize ?? 20,
      activeHours: config?.activeHours ?? '09:00-21:00',
      keyword: config?.keyword ?? '',
      cities: config?.cities ?? []
    },
    quota: { remaining, used: Math.max(0, limit - remaining), limit },
    queue: {
      pending: state.queue.pending.length,
      sent: state.queue.sent,
      skipped: state.queue.skipped,
      failed: state.queue.failed,
      activeJobId: state.queue.activeJobId,
      nextRunAt: state.queue.nextRunAt
    },
    paused: state.paused,
    l3Enabled: state.l3Enabled,
    login: state.login,
    lastHeartbeatAt: state.lastHeartbeatAt,
    version: state.latestVersion
      ? {
          versionId: state.latestVersion.versionId,
          title: state.latestVersion.resumeTitle ?? '',
          versionNo: state.latestVersion.versionNo
        }
      : null
  }
}

function buildContentBootstrap(): ContentBootstrap {
  const config = state.config
  return {
    paired: Boolean(state.token),
    threshold: config?.scoreThreshold ?? 0.7,
    batchSize: config?.batchSize ?? 20,
    applyLevel: effectiveApplyLevel(config, state.l3Enabled),
    l3Enabled: state.l3Enabled,
    paused: state.paused
  }
}

/* ---------------- 搜索 URL ---------------- */

function buildSearchUrl(config: NormalizedConfig | null, selectors: SelectorSet): string {
  const base = selectors.search?.base || 'https://www.zhipin.com/web/geek/job'
  if (!config) return base
  const params = new URLSearchParams()
  if (config.keyword) params.set('query', config.keyword)

  const city = config.cities[0]
  if (city) {
    const code = mapCode(selectors.search?.cityCodes, city)
    if (code) params.set('city', code)
  }
  const exp = config.expCodes.map((value) => mapCode(selectors.search?.expCodes, value)).filter(Boolean)
  if (exp.length) params.set('experience', exp.join(','))
  const degree = config.degreeCodes
    .map((value) => mapCode(selectors.search?.degreeCodes, value))
    .filter(Boolean)
  if (degree.length) params.set('degree', degree.join(','))

  const query = params.toString()
  return query ? `${base}?${query}` : base
}

/** 配置里既可能存中文（如“杭州”“本科”），也可能直接存 Boss 数字编码 */
function mapCode(map: Record<string, string> | undefined, value: string): string {
  const text = (value ?? '').trim()
  if (!text) return ''
  if (/^\d+$/.test(text)) return text
  return map?.[text] ?? ''
}

/* ---------------- 工具 ---------------- */

async function persistQueue(): Promise<void> {
  await chrome.storage.local.set({
    [STORAGE_KEYS.queue]: {
      ...state.queue,
      pending: state.queue.pending.map((item) => ({ ...item }))
    }
  })
}

function updateBadge(): void {
  try {
    if (state.paused.value) {
      chrome.action.setBadgeText({ text: '!' })
      chrome.action.setBadgeBackgroundColor({ color: '#dc2626' })
      return
    }
    const count = state.queue.pending.length
    if (count > 0) {
      chrome.action.setBadgeText({ text: count > 99 ? '99+' : String(count) })
      chrome.action.setBadgeBackgroundColor({ color: '#d97706' })
    } else {
      chrome.action.setBadgeText({ text: '' })
    }
  } catch {
    // action 不可用时忽略
  }
}

async function trySend<T>(
  tabId: number,
  message: RuntimeMessage
): Promise<BgResponse<T> | null> {
  try {
    const response = (await chrome.tabs.sendMessage(tabId, message)) as BgResponse<T> | undefined
    return response ?? null
  } catch {
    return null
  }
}

async function sendToTab(tabId: number, message: RuntimeMessage): Promise<void> {
  await trySend(tabId, message)
}

async function broadcastToBossTabs(message: RuntimeMessage): Promise<void> {
  try {
    const tabs = await chrome.tabs.query({ url: 'https://www.zhipin.com/*' })
    for (const tab of tabs) {
      if (tab.id != null) void trySend(tab.id, message)
    }
  } catch {
    // 无可用标签时忽略
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/* ---------------- 事件注册 ---------------- */

chrome.runtime.onMessage.addListener((message: RuntimeMessage, sender, sendResponse) => {
  void handleMessage(message, sender)
    .then((data) => sendResponse({ ok: true, data }))
    .catch((error: unknown) => {
      const text = error instanceof Error ? error.message : '未知错误'
      sendResponse({ ok: false, error: text })
    })
  return true
})

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'jobfit-tick') void tick()
})

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status !== 'complete') return
  if (activeApply?.tabId === tabId) void sendApplyTask(tabId)
})

chrome.tabs.onRemoved.addListener((tabId) => {
  if (activeApply?.tabId === tabId) {
    const jobId = activeApply.jobId
    void recordApplyResult(jobId, 'SKIPPED', undefined, 'TAB_CLOSED')
  }
})

chrome.runtime.onInstalled.addListener(() => {
  initialized = false
  initPromise = null
  void ensureInit()
})

chrome.runtime.onStartup.addListener(() => {
  void ensureInit()
})

async function tick(): Promise<void> {
  await ensureInit()
  if (!state.token) return
  try {
    await api.heartbeat()
    state.lastHeartbeatAt = Date.now()
    await chrome.storage.local.set({ [STORAGE_KEYS.lastHeartbeatAt]: state.lastHeartbeatAt })
  } catch (error) {
    handleApiError(error)
  }
  if (!state.bootstrapAt || Date.now() - state.bootstrapAt > 5 * 60_000) {
    try {
      await refreshBootstrap()
    } catch (error) {
      handleApiError(error)
    }
  }
  checkActiveTimeout()
  await pumpQueue()
}

void ensureInit()
