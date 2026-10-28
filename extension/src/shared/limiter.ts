/**
 * 投递限频与时间窗口。全部是纯函数，方便单测。
 */

export const L3_MIN_INTERVAL_MS = 40_000
export const L3_MAX_INTERVAL_MS = 120_000

/** L2 预填后等待用户点发送的超时（超时按 SKIPPED 处理） */
export const L2_CONFIRM_TIMEOUT_MS = 60_000

/** 打开详情页后等待内容脚本回报的总超时 */
export const APPLY_TASK_TIMEOUT_MS = 180_000

export const DEFAULT_ACTIVE_HOURS = '09:00-21:00'

export function randomInt(min: number, max: number, rand: () => number = Math.random): number {
  const low = Math.min(min, max)
  const high = Math.max(min, max)
  return Math.round(low + rand() * (high - low))
}

/** L3 两条投递之间的随机间隔：40–120 秒 */
export function nextApplyDelay(rand: () => number = Math.random): number {
  return randomInt(L3_MIN_INTERVAL_MS, L3_MAX_INTERVAL_MS, rand)
}

export interface ActiveWindow {
  startMinutes: number
  endMinutes: number
}

/** "09:00-21:00" → 起止分钟数；格式不合法返回 null（视为不限制） */
export function parseActiveHours(range: string): ActiveWindow | null {
  const match = /^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/.exec((range ?? '').trim())
  if (!match) return null
  const startMinutes = Number(match[1]) * 60 + Number(match[2])
  const endMinutes = Number(match[3]) * 60 + Number(match[4])
  if (startMinutes < 0 || startMinutes > 24 * 60 || endMinutes < 0 || endMinutes > 24 * 60) {
    return null
  }
  return { startMinutes, endMinutes }
}

export function isWithinActiveHours(range: string, now: Date = new Date()): boolean {
  const window = parseActiveHours(range)
  if (!window) return true
  const minutes = now.getHours() * 60 + now.getMinutes()
  if (window.startMinutes === window.endMinutes) return true
  if (window.startMinutes < window.endMinutes) {
    return minutes >= window.startMinutes && minutes < window.endMinutes
  }
  // 跨天窗口，如 21:00-06:00
  return minutes >= window.startMinutes || minutes < window.endMinutes
}

export function hasQuota(remaining: number): boolean {
  return Number.isFinite(remaining) && remaining > 0
}

/** 只有分数达到阈值、且未被服务端拒绝的岗位才进入投递队列 */
export function isQualified(
  score: number | null | undefined,
  threshold: number,
  rejectReason?: string | null
): boolean {
  if (rejectReason) return false
  if (score == null || !Number.isFinite(score)) return false
  return score >= threshold
}

/** 本地时间 yyyy-MM-dd HH:mm:ss，与后端 appliedAt 约定一致 */
export function formatDateTime(date: Date = new Date()): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  )
}
