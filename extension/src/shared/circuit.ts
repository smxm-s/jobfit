export type CircuitReason =
  | 'CAPTCHA'
  | 'CONSECUTIVE_FAILURES'
  | 'QUOTA'
  | 'LOGIN_REQUIRED'
  | 'MANUAL'

export interface CircuitSnapshot {
  open: boolean
  reason: CircuitReason | null
  consecutiveFailures: number
  openedAt: number | null
}

/**
 * 熔断器：检测到验证码立即打开；连续失败达到阈值也打开。
 * 打开后必须手动 reset（popup 的“继续”），不做自动重试。
 */
export class CircuitBreaker {
  private failures = 0
  private open = false
  private reason: CircuitReason | null = null
  private openedAt: number | null = null

  constructor(private readonly failureThreshold = 2) {}

  get isOpen(): boolean {
    return this.open
  }

  get consecutiveFailures(): number {
    return this.failures
  }

  recordSuccess(): void {
    this.failures = 0
  }

  /** 返回 true 表示本次调用触发了熔断 */
  recordFailure(reason: CircuitReason = 'CONSECUTIVE_FAILURES'): boolean {
    if (this.open) return true
    this.failures += 1
    if (this.failures >= this.failureThreshold) {
      this.trip(reason)
      return true
    }
    return false
  }

  trip(reason: CircuitReason): void {
    this.open = true
    this.reason = reason
    this.openedAt = Date.now()
  }

  reset(): void {
    this.open = false
    this.reason = null
    this.openedAt = null
    this.failures = 0
  }

  snapshot(): CircuitSnapshot {
    return {
      open: this.open,
      reason: this.reason,
      consecutiveFailures: this.failures,
      openedAt: this.openedAt
    }
  }
}
