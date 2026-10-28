import type {
  AgentConfig,
  AgentDevice,
  Application,
  Dashboard,
  Job,
  JobQuery,
  LoginResult,
  MatchReport,
  PageResult,
  PairCode,
  ParseDetail,
  RecentReport,
  Resume,
  ResumeBlock,
  ResumeSchema,
  SaveResult,
  SubScores,
  UserInfo
} from '@/types'
import { request, tokenStorage } from './http'
import { mockApi } from './mock'

export interface JobFitApi {
  login(payload: { username: string; password: string }): Promise<LoginResult>
  register(payload: {
    username: string
    password: string
    nickname?: string
  }): Promise<LoginResult>
  getMe(): Promise<UserInfo>
  getDashboard(): Promise<Dashboard>
  listResumes(): Promise<Resume[]>
  getParseDetail(resumeId: number): Promise<ParseDetail>
  saveResumeSchema(versionId: number, schema: ResumeSchema): Promise<SaveResult>
  getAgentConfig(): Promise<AgentConfig>
  saveAgentConfig(config: AgentConfig): Promise<AgentConfig>
  createPairCode(): Promise<PairCode>
  listDevices(): Promise<AgentDevice[]>
  revokeDevice(id: number): Promise<void>
  listJobs(query?: JobQuery): Promise<PageResult<Job>>
  listApplications(): Promise<Application[]>
  getReport(reportId: number): Promise<MatchReport>
  matchJob(jobId: number, versionId?: number): Promise<{ reportId: number }>
}

interface LatestVersion {
  versionId: number
  versionNo: number
  schema: ResumeSchema
  blocks?: ResumeBlock[]
}

interface LoginPayload {
  token: string
  user?: UserInfo
}

function toList<T>(value: PageResult<T> | T[] | null | undefined): T[] {
  if (!value) return []
  return Array.isArray(value) ? value : value.list ?? []
}

function toTotal<T>(value: PageResult<T> | T[] | null | undefined, list: T[]): number {
  if (!value) return list.length
  return Array.isArray(value) ? value.length : value.total ?? list.length
}

function todayPrefix(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

function normalizeRecent(raw: RecentReport, index: number): RecentReport {
  return {
    reportId: raw.reportId ?? index,
    jobId: raw.jobId ?? 0,
    title: raw.title || '未命名岗位',
    company: raw.company || '—',
    city: raw.city || '—',
    score: raw.score ?? 0,
    topGap: raw.topGap || '—',
    createdAt: raw.createdAt || '—',
    subScores: raw.subScores
  }
}

interface RawJob {
  id: number
  title?: string
  company?: string
  city?: string
  salary?: string
  salaryRange?: string
  exp?: string
  expReq?: string
  degree?: string
  degreeReq?: string
  tags?: string | string[]
  jdSummary?: string
  jobUrl?: string
  score?: number
  latestScore?: number | null
  stage?: string
  status?: string
  appliedFlag?: number
  hitSkills?: string[]
  missSkills?: string[]
  reportId?: number
  collectedAt?: string
}

/** 后端岗位字段与前端视图字段做一次映射，兼容 salaryRange/expReq 等命名 */
function normalizeJob(raw: RawJob): Job {
  const tags = Array.isArray(raw.tags)
    ? raw.tags
    : raw.tags
      ? String(raw.tags)
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean)
      : []
  const status: Job['status'] = raw.appliedFlag
    ? 'APPLIED'
    : raw.status === 'SKIPPED'
      ? 'SKIPPED'
      : 'PENDING'
  return {
    id: raw.id,
    reportId: raw.reportId ?? 0,
    title: raw.title ?? '—',
    company: raw.company ?? '—',
    city: raw.city ?? '—',
    salary: raw.salary ?? raw.salaryRange ?? '—',
    exp: raw.exp ?? raw.expReq ?? '—',
    degree: raw.degree ?? raw.degreeReq ?? '—',
    tags,
    jdSummary: raw.jdSummary ?? '',
    jobUrl: raw.jobUrl ?? '',
    score: Number(raw.score ?? raw.latestScore ?? 0),
    stage: raw.stage === 'FINE' ? 'FINE' : 'COARSE',
    status,
    hitSkills: raw.hitSkills ?? tags,
    missSkills: raw.missSkills ?? [],
    collectedAt: raw.collectedAt ?? ''
  }
}

const realApi: JobFitApi = {
  async login(payload) {
    const data = await request<LoginPayload>({
      url: '/auth/login',
      method: 'post',
      data: payload
    })
    const token = data.token
    // 先落 token，再用 /me 兜底，避免兜底请求缺鉴权头
    if (data.user === undefined) tokenStorage.set(token)
    const user = data.user ?? (await request<UserInfo>({ url: '/me' }))
    return { token, user }
  },

  async register(payload) {
    const data = await request<LoginPayload>({
      url: '/auth/register',
      method: 'post',
      data: payload
    })
    const token = data.token
    if (data.user === undefined) tokenStorage.set(token)
    const user = data.user ?? (await request<UserInfo>({ url: '/me' }))
    return { token, user }
  },

  getMe() {
    return request<UserInfo>({ url: '/me' })
  },

  async getDashboard() {
    const [resumes, jobsValue, reportsValue, config, devices, applicationsValue] = await Promise.all([
      request<Resume[]>({ url: '/resumes' }),
      request<PageResult<Job>>({ url: '/jobs', params: { page: 1, size: 200 } }),
      request<PageResult<RecentReport> | RecentReport[]>({
        url: '/reports',
        params: { page: 1, size: 5 }
      }),
      request<AgentConfig>({ url: '/agent/config' }),
      request<AgentDevice[]>({ url: '/agent/devices' }),
      request<PageResult<Application> | Application[]>({
        url: '/applications',
        params: { page: 1, size: 100 }
      })
    ])

    const jobs = toList(jobsValue)
    const applications = toList(applicationsValue)
    const reports = toList(reportsValue).slice(0, 5).map(normalizeRecent)
    const resume = resumes[0]
    const threshold = config.scoreThreshold ?? 0.7
    const today = todayPrefix()
    const sentToday = applications.filter(
      (item) => item.status === 'SENT' && (item.appliedAt ?? '').startsWith(today)
    )
    const activeDevice = devices.find((device) => !device.revoked)

    let capability: Dashboard['capability'] = []
    if (reports.length && reports[0].subScores) {
      const avg = (key: keyof SubScores) =>
        Number(
          (
            reports.reduce((sum, item) => sum + (item.subScores?.[key] ?? 0), 0) / reports.length
          ).toFixed(2)
        )
      capability = [
        { label: '技能覆盖率', score: avg('skill') },
        { label: '语义匹配', score: avg('sem') },
        { label: '经历匹配', score: avg('exp') },
        { label: '教育匹配', score: avg('edu') }
      ]
    }

    return {
      stats: {
        resumeVersions: resume?.currentVersion ?? 0,
        resumeTitle: resume?.title ?? '尚未上传简历',
        parseConfidence: resume?.confidence ?? 0,
        totalJobs: toTotal(jobsValue, jobs),
        weeklyCollected: jobs.length,
        weeklyTrend: 0,
        qualified: jobs.filter((job) => job.score >= threshold).length,
        threshold,
        applied: applications.length,
        appliedToday: sentToday.length,
        remainingQuota: Math.max(0, config.dailyLimit - sentToday.length),
        dailyLimit: config.dailyLimit
      },
      recentReports: reports,
      plugin: {
        connected: Boolean(activeDevice),
        device: activeDevice?.deviceName ?? '未绑定设备',
        quotaUsed: sentToday.length,
        quotaTotal: config.dailyLimit,
        applyLevel: config.applyLevel,
        queueState: '—',
        lastSeenAt: activeDevice?.lastSeenAt ?? '—'
      },
      capability
    }
  },

  listResumes() {
    return request<Resume[]>({ url: '/resumes' })
  },

  async getParseDetail(resumeId) {
    const [resumes, latest] = await Promise.all([
      request<Resume[]>({ url: '/resumes' }),
      request<LatestVersion>({ url: `/resumes/${resumeId}/versions/latest` })
    ])
    const resume = resumes.find((item) => item.id === resumeId)
    if (!resume) {
      throw new Error('简历不存在或已删除')
    }
    return {
      resume,
      versionId: latest.versionId,
      versionNo: latest.versionNo,
      schema: latest.schema,
      blocks: latest.blocks ?? []
    }
  },

  saveResumeSchema(versionId, schema) {
    return request<SaveResult>({
      url: `/versions/${versionId}/schema`,
      method: 'put',
      data: { schema }
    })
  },

  getAgentConfig() {
    return request<AgentConfig>({ url: '/agent/config' })
  },

  saveAgentConfig(config) {
    return request<AgentConfig>({
      url: '/agent/config',
      method: 'put',
      data: config
    })
  },

  createPairCode() {
    return request<PairCode>({ url: '/agent/pair-code', method: 'post' })
  },

  listDevices() {
    return request<AgentDevice[]>({ url: '/agent/devices' })
  },

  async revokeDevice(id) {
    await request<void>({ url: `/agent/devices/${id}`, method: 'delete' })
  },

  async listJobs(query = {}) {
    const page = await request<PageResult<RawJob>>({
      url: '/jobs',
      params: {
        keyword: query.keyword || undefined,
        city: query.city || undefined,
        status: query.status || undefined,
        minScore: query.minScore,
        page: query.page ?? 1,
        size: query.size ?? 20
      }
    })
    return {
      list: (page.list ?? []).map(normalizeJob),
      total: page.total ?? 0,
      page: page.page ?? 1,
      size: page.size ?? 20
    }
  },

  async listApplications() {
    const value = await request<PageResult<Application> | Application[]>({
      url: '/applications',
      params: { page: 1, size: 100 }
    })
    return toList(value)
  },

  getReport(reportId) {
    return request<MatchReport>({ url: `/reports/${reportId}` })
  },

  matchJob(jobId, versionId) {
    return request<{ reportId: number }>({
      url: `/jobs/${jobId}/match`,
      method: 'post',
      data: { versionId }
    })
  }
}

export const isMockMode = import.meta.env.VITE_USE_MOCK === 'true'

export const api: JobFitApi = isMockMode ? mockApi : realApi
