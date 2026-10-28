/** 投递分级：L1 只标注 / L2 一键确认 / L3 队列自动（默认关闭） */
export type ApplyLevel = 'L1' | 'L2' | 'L3'

export type ApplyStatus = 'SENT' | 'SKIPPED' | 'FAILED'

export type PageType = 'LIST' | 'DETAIL' | 'OTHER'

/** 后端统一响应体：{ code, message, data } */
export interface ApiResult<T> {
  code: number
  message: string
  data: T
}

/* ---------------- 配对 / 配置 ---------------- */

export interface PairResult {
  deviceToken: string
  userId: number
  deviceId: number
}

/** 服务端 agent_config 的原始形态（部分字段可能是数组或逗号字符串，读取后统一归一化） */
export interface AgentConfig {
  cities?: string | string[] | null
  keyword?: string | null
  salaryMin?: number | null
  salaryMax?: number | null
  expCodes?: string | string[] | null
  degreeCodes?: string | string[] | null
  excludeWords?: string | string[] | null
  scoreThreshold?: number | string | null
  applyLevel?: ApplyLevel | string | null
  dailyLimit?: number | null
  batchSize?: number | null
  activeHours?: string | null
  resumeVersionId?: number | null
  greetingTemplate?: string | null
  updatedAt?: string | null
}

export interface NormalizedConfig {
  cities: string[]
  keyword: string
  salaryMin: number | null
  salaryMax: number | null
  expCodes: string[]
  degreeCodes: string[]
  excludeWords: string[]
  /** 0-1 */
  scoreThreshold: number
  applyLevel: ApplyLevel
  dailyLimit: number
  batchSize: number
  /** HH:mm-HH:mm */
  activeHours: string
  resumeVersionId: number | null
  greetingTemplate: string
}

export interface LatestVersion {
  versionId: number
  resumeId: number
  resumeTitle: string
  versionNo: number
  createdAt: string
}

export interface BootstrapPayload {
  config: AgentConfig
  latestVersion: LatestVersion | null
  remainingQuota: number
  jdHashes: string[]
  /** 预留：服务端可下发覆盖 selectors.json 的片段 */
  selectors?: Partial<SelectorSet> | null
}

export interface BootstrapState {
  config: NormalizedConfig
  latestVersion: LatestVersion | null
  remainingQuota: number
  jdHashes: string[]
  fetchedAt: number
}

/* ---------------- 岗位卡片 ---------------- */

export interface JobCard {
  title: string
  company: string
  city: string
  salary: string
  exp: string
  degree: string
  tags: string[]
  jdSummary: string
  jobUrl: string
  jdHash: string
}

export interface IngestRequest {
  batchId: string
  jobs: JobCard[]
}

export interface IngestAccepted {
  jdHash: string
  jobId: number
  dedup: boolean
}

export interface IngestRejected {
  jdHash: string
  reason: string
  word?: string | null
}

export interface IngestResponse {
  accepted: IngestAccepted[]
  rejected: IngestRejected[]
}

export interface BatchMatchItem {
  jobId: number
  /** 0-1，可能为空（算法服务不可用） */
  score: number | null
  stage?: 'COARSE' | 'FINE' | string
  hitSkills?: string[]
  missSkills?: string[]
  rejectReason?: string | null
  fallback?: boolean
}

/** 回传给内容脚本的分数结果 */
export interface ScoreResult {
  jdHash: string
  jobId: number | null
  score: number | null
  stage: string | null
  hitSkills: string[]
  missSkills: string[]
  rejectReason: string | null
}

/* ---------------- 投递 ---------------- */

export interface ApplicationReportItem {
  jobId: number
  applyLevel: ApplyLevel
  status: ApplyStatus
  appliedAt?: string
  skipReason?: string
  failReason?: string
}

export interface ApplyReportResult {
  recorded: number
  remainingQuota: number
}

export interface QueueItem {
  jobId: number
  jdHash: string
  title: string
  company: string
  url: string
  score: number
  stage: string
  addedAt: number
}

export interface QueueState {
  pending: QueueItem[]
  sent: number
  skipped: number
  failed: number
  activeJobId: number | null
  nextRunAt: number | null
}

export interface PauseState {
  value: boolean
  reason: string | null
  at: number | null
}

export interface LoginState {
  onBoss: boolean
  /** null 表示尚未检测 */
  loggedIn: boolean | null
  checkedAt: number | null
}

export interface ApplyTask {
  jobId: number
  jobUrl: string
  title: string
  company: string
  level: ApplyLevel
  greeting: string
}

export interface DetailPayload {
  jobUrl: string
  title: string
  company: string
  salary: string
  city: string
  tags: string[]
  jdText: string
  jdLength: number
}

/* ---------------- 选择器配置 ---------------- */

export interface ListSelectors {
  container: string[]
  card: string[]
  link: string[]
  title: string[]
  company: string[]
  city: string[]
  salary: string[]
  exp: string[]
  degree: string[]
  tags: string[]
  jdSummary: string[]
  footer: string[]
  nextPage: string[]
  emptyHint: string[]
}

export interface LoginSelectors {
  loggedIn: string[]
  loginEntry: string[]
  loginDialog: string[]
}

export interface CaptchaSelectors {
  container: string[]
  textHints: string[]
}

export interface DetailSelectors {
  jd: string[]
  title: string[]
  company: string[]
  salary: string[]
  city: string[]
  tags: string[]
  applyButton: string[]
  alreadyApplied: string[]
  chatDialog: string[]
  greetingInput: string[]
  sendButton: string[]
  sentHint: string[]
}

export interface SearchConfig {
  base: string
  cityCodes: Record<string, string>
  expCodes: Record<string, string>
  degreeCodes: Record<string, string>
}

export interface SelectorSet {
  version?: number
  list: ListSelectors
  login: LoginSelectors
  captcha: CaptchaSelectors
  detail: DetailSelectors
  search: SearchConfig
}

/* ---------------- 存储 ---------------- */

export interface StoredShape {
  deviceToken: string
  deviceId: number | null
  userId: number | null
  apiBase: string
  bootstrap: BootstrapState | null
  remoteSelectors: Partial<SelectorSet> | null
  queue: QueueState
  paused: PauseState
  l3Enabled: boolean
  seenHashes: string[]
  appliedJobIds: number[]
  login: LoginState
  lastHeartbeatAt: number | null
}

/* ---------------- 消息 ---------------- */

export interface BgResponse<T = unknown> {
  ok: boolean
  data?: T
  error?: string
}

export interface ContentBootstrap {
  paired: boolean
  threshold: number
  batchSize: number
  applyLevel: ApplyLevel
  l3Enabled: boolean
  paused: PauseState
}

export interface PopupStatus {
  paired: boolean
  connected: boolean
  apiBase: string
  config: {
    applyLevel: ApplyLevel
    effectiveLevel: ApplyLevel
    threshold: number
    dailyLimit: number
    batchSize: number
    activeHours: string
    keyword: string
    cities: string[]
  }
  quota: {
    remaining: number
    used: number
    limit: number
  }
  queue: {
    pending: number
    sent: number
    skipped: number
    failed: number
    activeJobId: number | null
    nextRunAt: number | null
  }
  paused: PauseState
  l3Enabled: boolean
  login: LoginState
  lastHeartbeatAt: number | null
  version: {
    versionId: number
    title: string
    versionNo: number
  } | null
}

export type RuntimeMessage =
  | { type: 'GET_STATUS' }
  | { type: 'PAIR'; code: string; deviceName?: string }
  | { type: 'REFRESH_BOOTSTRAP' }
  | { type: 'SET_PAUSED'; paused: boolean }
  | { type: 'SET_L3'; enabled: boolean }
  | { type: 'OPEN_LIST_PAGE' }
  | { type: 'OPEN_WEB' }
  | { type: 'CONTENT_READY'; pageType: PageType }
  | { type: 'COLLECT_JOBS'; jobs: JobCard[] }
  | { type: 'LOGIN_STATE'; loggedIn: boolean }
  | { type: 'CAPTCHA_DETECTED'; where: PageType | 'APPLY' }
  | { type: 'DEGRADED'; reason: string }
  | { type: 'DETAIL_READY'; detail: DetailPayload }
  | { type: 'GET_APPLY_TASK' }
  | {
      type: 'APPLY_TASK_DONE'
      jobId: number
      status: ApplyStatus
      failReason?: string
      skipReason?: string
    }
  | { type: 'SCORE_UPDATE'; items: ScoreResult[]; threshold: number }
  | { type: 'PAUSE_STATE'; paused: PauseState }
  | { type: 'SELECTORS_UPDATED' }
  | { type: 'APPLY_TASK'; task: ApplyTask }
  | { type: 'NOTICE'; message: string }
