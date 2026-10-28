import type {
  AgentConfig,
  ApplyLevel,
  LoginState,
  NormalizedConfig,
  PauseState,
  QueueState,
  StoredShape
} from './types.js'

export const STORAGE_KEYS = {
  deviceToken: 'deviceToken',
  deviceId: 'deviceId',
  userId: 'userId',
  apiBase: 'apiBase',
  bootstrap: 'bootstrap',
  remoteSelectors: 'remoteSelectors',
  queue: 'queue',
  paused: 'paused',
  l3Enabled: 'l3Enabled',
  seenHashes: 'seenHashes',
  appliedJobIds: 'appliedJobIds',
  login: 'login',
  lastHeartbeatAt: 'lastHeartbeatAt'
} as const

/** 自建平台地址；后续换域名时同时改 manifest.host_permissions */
export const DEFAULT_API_BASE = 'http://localhost:5173'

export const DEFAULT_PAUSE: PauseState = { value: false, reason: null, at: null }

export const DEFAULT_QUEUE: QueueState = {
  pending: [],
  sent: 0,
  skipped: 0,
  failed: 0,
  activeJobId: null,
  nextRunAt: null
}

export const DEFAULT_LOGIN: LoginState = { onBoss: true, loggedIn: null, checkedAt: null }

/**
 * L3 默认关闭的唯一默认值。
 * popup 里的开关初始为关闭；背景调度只有在「服务端 applyLevel=L3」且「本地开关已显式打开」时才执行 L3。
 */
export const L3_DEFAULT_ENABLED = false

export const MAX_SEEN_HASHES = 1000

export async function readStorage<K extends keyof StoredShape>(
  key: K
): Promise<StoredShape[K] | undefined> {
  const result = await chrome.storage.local.get(key)
  return result[key] as StoredShape[K] | undefined
}

export async function writeStorage(patch: Partial<StoredShape>): Promise<void> {
  await chrome.storage.local.set(patch)
}

export async function removeStorage(keys: string[]): Promise<void> {
  await chrome.storage.local.remove(keys)
}

export async function getDeviceToken(): Promise<string> {
  return (await readStorage(STORAGE_KEYS.deviceToken)) ?? ''
}

export async function getApiBase(): Promise<string> {
  const value = await readStorage(STORAGE_KEYS.apiBase)
  return (value || DEFAULT_API_BASE).replace(/\/+$/, '')
}

export async function clearDevice(): Promise<void> {
  await removeStorage([
    STORAGE_KEYS.deviceToken,
    STORAGE_KEYS.deviceId,
    STORAGE_KEYS.userId,
    STORAGE_KEYS.bootstrap
  ])
}

export function splitList(value: string | string[] | null | undefined): string[] {
  if (value == null) return []
  const parts = Array.isArray(value) ? value.flatMap((item) => String(item).split(/[,，]/)) : String(value).split(/[,，]/)
  const seen = new Set<string>()
  const list: string[] = []
  for (const part of parts) {
    const text = part.trim()
    if (!text || seen.has(text)) continue
    seen.add(text)
    list.push(text)
  }
  return list
}

export function normalizeConfig(raw: AgentConfig | null | undefined): NormalizedConfig {
  const config = raw ?? {}
  const threshold = Number(config.scoreThreshold)
  const dailyLimit = Number(config.dailyLimit)
  const batchSize = Number(config.batchSize)
  const level = config.applyLevel === 'L2' || config.applyLevel === 'L3' ? config.applyLevel : 'L1'
  return {
    cities: splitList(config.cities),
    keyword: (config.keyword ?? '').trim(),
    salaryMin: numberOrNull(config.salaryMin),
    salaryMax: numberOrNull(config.salaryMax),
    expCodes: splitList(config.expCodes),
    degreeCodes: splitList(config.degreeCodes),
    excludeWords: splitList(config.excludeWords),
    scoreThreshold: Number.isFinite(threshold) ? clamp(threshold, 0, 1) : 0.7,
    applyLevel: level,
    dailyLimit: Number.isFinite(dailyLimit) ? clamp(Math.round(dailyLimit), 1, 1000) : 30,
    batchSize: Number.isFinite(batchSize) ? clamp(Math.round(batchSize), 1, 100) : 20,
    activeHours: (config.activeHours ?? '').trim() || '09:00-21:00',
    resumeVersionId: numberOrNull(config.resumeVersionId),
    greetingTemplate: (config.greetingTemplate ?? '').trim()
  }
}

/** 服务端要求 L3 且本地开关打开才执行；否则 L3 降级为 L2，避免“默认自动投递”。 */
export function effectiveApplyLevel(config: NormalizedConfig | null, l3Enabled: boolean): ApplyLevel {
  if (!config) return 'L1'
  if (config.applyLevel === 'L3') return l3Enabled ? 'L3' : 'L2'
  return config.applyLevel
}

/** 已配对设备（浏览器重启/背景页唤醒后恢复状态） */
export async function readDevice(): Promise<{ token: string; deviceId: number | null; userId: number | null }> {
  const result = await chrome.storage.local.get([
    STORAGE_KEYS.deviceToken,
    STORAGE_KEYS.deviceId,
    STORAGE_KEYS.userId
  ])
  return {
    token: (result[STORAGE_KEYS.deviceToken] as string | undefined) ?? '',
    deviceId: (result[STORAGE_KEYS.deviceId] as number | undefined) ?? null,
    userId: (result[STORAGE_KEYS.userId] as number | undefined) ?? null
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function numberOrNull(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}
