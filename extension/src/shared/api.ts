import { getApiBase, getDeviceToken } from './storage.js'
import type {
  ApiResult,
  ApplicationReportItem,
  ApplyReportResult,
  BatchMatchItem,
  BootstrapPayload,
  IngestResponse,
  IngestRequest,
  PairResult
} from './types.js'

export class ApiError extends Error {
  readonly code: number

  constructor(code: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.code = code
  }
}

interface RequestOptions {
  /** 配对接口不带设备 token */
  auth?: boolean
  timeoutMs?: number
}

const DEFAULT_TIMEOUT_MS = 15_000

async function request<T>(path: string, init: RequestInit = {}, options: RequestOptions = {}): Promise<T> {
  const base = await getApiBase()
  const headers = new Headers(init.headers)
  headers.set('Content-Type', 'application/json')
  if (options.auth !== false) {
    const token = await getDeviceToken()
    if (token) headers.set('X-Agent-Token', token)
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  let response: Response
  try {
    response = await fetch(`${base}${path}`, { ...init, headers, signal: controller.signal })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ApiError(-1, '请求超时，请确认 JobFit 服务已启动')
    }
    throw new ApiError(-1, '网络连接失败，请确认 JobFit 服务已启动')
  } finally {
    clearTimeout(timer)
  }

  let body: ApiResult<T> | null = null
  try {
    body = (await response.json()) as ApiResult<T>
  } catch {
    body = null
  }
  if (!body || typeof body.code !== 'number') {
    throw new ApiError(response.status || -1, `接口返回异常（HTTP ${response.status}）`)
  }
  if (body.code !== 0) {
    throw new ApiError(body.code, body.message || '请求失败')
  }
  return body.data
}

export const api = {
  /** POST /api/agent/pair —— 用一次性配对码换设备 token（服务端只存 hash） */
  pair(code: string, deviceName: string): Promise<PairResult> {
    return request<PairResult>(
      '/api/agent/pair',
      { method: 'POST', body: JSON.stringify({ code, deviceName }) },
      { auth: false }
    )
  },

  /** GET /api/agent/bootstrap —— 配置 + 简历版本 + 当日额度 + 已有 jdHash */
  bootstrap(): Promise<BootstrapPayload> {
    return request<BootstrapPayload>('/api/agent/bootstrap')
  },

  /** POST /api/jobs/ingest —— 一批岗位卡片，服务端去重 + 排除词过滤 */
  ingest(payload: IngestRequest): Promise<IngestResponse> {
    return request<IngestResponse>(
      '/api/jobs/ingest',
      { method: 'POST', body: JSON.stringify(payload) },
      { timeoutMs: 20_000 }
    )
  },

  /** POST /api/match/batch —— 批量打分（粗筛 + TopN 精算） */
  batchMatch(versionId: number, jobIds: number[]): Promise<BatchMatchItem[]> {
    return request<BatchMatchItem[]>(
      '/api/match/batch',
      { method: 'POST', body: JSON.stringify({ versionId, jobIds }) },
      { timeoutMs: 20_000 }
    )
  },

  /** POST /api/applications/report —— 回报投递结果 */
  reportApplications(items: ApplicationReportItem[]): Promise<ApplyReportResult> {
    return request<ApplyReportResult>('/api/applications/report', {
      method: 'POST',
      body: JSON.stringify({ items })
    })
  },

  /** POST /api/agent/heartbeat —— 更新 last_seen_at */
  heartbeat(): Promise<{ serverTime?: string }> {
    return request<{ serverTime?: string }>(
      '/api/agent/heartbeat',
      { method: 'POST' },
      { timeoutMs: 8_000 }
    )
  }
}
