export type ApplyLevel = 'L1' | 'L2' | 'L3'

export type JobStatus = 'PENDING' | 'APPLIED' | 'SKIPPED'

export interface ApiResult<T> {
  code: number
  message: string
  data: T
}

export interface PageResult<T> {
  list: T[]
  total: number
  page: number
  size: number
}

/* ---------- 账号 ---------- */

export interface UserInfo {
  id: number
  username: string
  nickname: string
  role: string
  intention: string
}

export interface LoginResult {
  token: string
  user: UserInfo
}

/* ---------- 工作台 ---------- */

export interface SubScores {
  skill: number
  sem: number
  exp: number
  edu: number
}

export interface DashboardStats {
  resumeVersions: number
  resumeTitle: string
  parseConfidence: number
  totalJobs: number
  weeklyCollected: number
  weeklyTrend: number
  qualified: number
  threshold: number
  applied: number
  appliedToday: number
  remainingQuota: number
  dailyLimit: number
}

export interface RecentReport {
  reportId: number
  jobId: number
  title: string
  company: string
  city: string
  score: number
  topGap: string
  createdAt: string
  subScores?: SubScores
}

export interface PluginStatus {
  connected: boolean
  device: string
  quotaUsed: number
  quotaTotal: number
  applyLevel: ApplyLevel
  queueState: string
  lastSeenAt: string
}

export interface CapabilityItem {
  label: string
  score: number
}

export interface Dashboard {
  stats: DashboardStats
  recentReports: RecentReport[]
  plugin: PluginStatus
  capability: CapabilityItem[]
}

/* ---------- 简历 ---------- */

export interface Resume {
  id: number
  title: string
  currentVersion: number
  versionCount: number
  status: 'DRAFT' | 'PARSED' | 'CONFIRMED'
  confidence: number
  fileName: string
  updatedAt: string
}

export interface ResumeBasic {
  name: string
  phone: string
  email: string
  city: string
  jobIntention: string
  yearsOfExp: number
  confidence: Record<string, number>
}

export interface EducationItem {
  school: string
  major: string
  degree: string
  start: string
  end: string
  gpa?: string
  rank?: string
  confidence: number
}

export interface WorkItem {
  company: string
  title: string
  start: string
  end: string
  description: string
  confidence: number
}

export interface ProjectItem {
  name: string
  role: string
  start: string
  end: string
  stack: string[]
  description: string
  highlights: string[]
  confidence: number
}

export interface ResumeSkill {
  name: string
  raw: string
  level: 'BASIC' | 'PROFICIENT' | 'EXPERT'
  source: string
}

export interface AwardItem {
  name: string
  date: string
}

export interface ResumeMeta {
  parserVersion: string
  docType: string
  pageCount: number
  lowConfidenceFields: string[]
}

export interface ResumeSchema {
  basic: ResumeBasic
  education: EducationItem[]
  work: WorkItem[]
  project: ProjectItem[]
  skills: ResumeSkill[]
  awards: AwardItem[]
  meta: ResumeMeta
}

export type BlockType = 'BASIC' | 'EDUCATION' | 'WORK' | 'PROJECT' | 'SKILL' | 'AWARD' | 'OTHER'

export interface ResumeBlock {
  id: number
  blockType: BlockType
  sectionIdx: number
  rawText: string
  pageNo: number
  confidence: number
  corrected?: boolean
  /** 仅供前端展示的原文高亮（后端可不返回） */
  highlight?: 'warn' | 'bad'
}

export interface ParseDetail {
  resume: Resume
  versionId: number
  versionNo: number
  schema: ResumeSchema
  blocks: ResumeBlock[]
}

export interface SaveResult {
  versionId: number
  versionNo: number
}

/* ---------- 筛选配置 / 设备 ---------- */

export interface AgentConfig {
  cities: string[]
  keyword: string
  salaryMin: number
  salaryMax: number
  expCodes: string[]
  degreeCodes: string[]
  excludeWords: string[]
  scoreThreshold: number
  applyLevel: ApplyLevel
  dailyLimit: number
  batchSize: number
  activeHours: string
  resumeVersionId?: number
  greetingTemplate: string
}

export interface PairCode {
  code: string
  expireIn: number
}

export interface AgentDevice {
  id: number
  deviceName: string
  lastSeenAt: string
  revoked: boolean
}

/* ---------- 岗位 ---------- */

export interface Job {
  id: number
  reportId: number
  title: string
  company: string
  city: string
  salary: string
  exp: string
  degree: string
  tags: string[]
  jdSummary: string
  jobUrl: string
  score: number
  stage: 'COARSE' | 'FINE'
  status: JobStatus
  hitSkills: string[]
  missSkills: string[]
  collectedAt: string
}

export interface JobQuery {
  keyword?: string
  city?: string
  status?: JobStatus | ''
  minScore?: number
  page?: number
  size?: number
}

/* ---------- 诊断报告 ---------- */

export interface SkillHit {
  skill: string
  level?: string
  evidenceBlockId?: number
  note?: string
  reqType?: 'HARD' | 'NICE'
  jdSentence?: string
}

export interface EvidenceBlock {
  page: number
  text: string
  confidence: number
}

export interface ReportEvidence {
  title: string
  req: string
  blocks: EvidenceBlock[]
  note: string
}

export interface MatchReport {
  id: number
  jobId: number
  job: Job
  totalScore: number
  subScores: SubScores
  weights: SubScores
  algoVersion: string
  dictVersion: string
  resumeVersion: string
  idfFallback: boolean
  skills: {
    hit: SkillHit[]
    partial: SkillHit[]
    missed: SkillHit[]
  }
  risks: string[]
  requirements: string[]
  details: {
    skillCoverage: string
    bestSemanticBlock: string
    expOverlap: string
    eduVerdict: string
  }
  evidences: Record<string, ReportEvidence>
}

/* ---------- 投递记录 ---------- */

export interface Application {
  id: number
  jobId: number
  jobTitle: string
  company: string
  city: string
  applyLevel: ApplyLevel
  channel: string
  status: 'SENT' | 'SKIPPED' | 'FAILED'
  skipReason?: string
  failReason?: string
  appliedAt: string
}
