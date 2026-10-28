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
  ReportEvidence,
  Resume,
  ResumeBlock,
  ResumeSchema,
  SaveResult,
  SkillHit,
  SubScores,
  UserInfo
} from '@/types'

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

const WEIGHTS: SubScores = { skill: 0.4, sem: 0.25, exp: 0.2, edu: 0.15 }

let currentUser: UserInfo | null = null

/* ------------------------------------------------------------------ */
/* 账号                                                                */
/* ------------------------------------------------------------------ */

const DEMO_USER: UserInfo = {
  id: 1,
  username: 'demo',
  nickname: '张同学',
  role: 'SEEKER',
  intention: '后端开发 · 2026 届'
}

function buildUser(username: string, nickname?: string): UserInfo {
  return {
    ...DEMO_USER,
    username,
    nickname: nickname?.trim() || '张同学'
  }
}

/* ------------------------------------------------------------------ */
/* 简历                                                                */
/* ------------------------------------------------------------------ */

const RESUME_STATE: Resume[] = [
  {
    id: 1,
    title: '张同学 · 后端开发 · 2026 届',
    currentVersion: 3,
    versionCount: 3,
    status: 'PARSED',
    confidence: 0.91,
    fileName: 'resume.pdf',
    updatedAt: '2026-10-28 09:20:14'
  },
  {
    id: 2,
    title: '张同学 · 后端实习 · 投递版',
    currentVersion: 1,
    versionCount: 1,
    status: 'CONFIRMED',
    confidence: 0.88,
    fileName: 'resume-intern.pdf',
    updatedAt: '2026-10-25 20:41:02'
  }
]

const SCHEMA: ResumeSchema = {
  basic: {
    name: '张同学',
    phone: '13800000000',
    email: 'zhangsan@example.com',
    city: '杭州',
    jobIntention: '后端开发工程师',
    yearsOfExp: 0,
    confidence: { name: 0.98, phone: 0.95, email: 0.99, city: 0.93, jobIntention: 0.9 }
  },
  education: [
    {
      school: '××大学',
      major: '计算机科学与技术',
      degree: '本科',
      start: '2022-09',
      end: '2026-06',
      gpa: '3.6/4.0',
      rank: '前 15%',
      confidence: 0.86
    }
  ],
  work: [
    {
      company: '××科技有限公司',
      title: '后端开发实习生',
      start: '2025-07',
      end: '2025-10',
      description:
        '参与订单服务接口开发，负责幂等与重试逻辑；使用 Redis 缓存热点数据，QPS 提升约 3 倍。',
      confidence: 0.78
    }
  ],
  project: [
    {
      name: '校园二手交易平台',
      role: '后端负责人',
      start: '2024-09',
      end: '2025-01',
      stack: ['Spring Boot', 'MySQL', 'Redis'],
      description: '负责商品与订单模块，优化了接口性能。',
      highlights: ['接口平均响应从 320ms 降至 90ms'],
      confidence: 0.72
    }
  ],
  skills: [
    { name: 'Java', raw: 'Java / JavaSE', level: 'PROFICIENT', source: 'SKILL_SECTION' },
    { name: 'Spring Boot', raw: 'Spring Boot', level: 'PROFICIENT', source: 'SKILL_SECTION' },
    { name: 'MySQL', raw: 'MySQL', level: 'PROFICIENT', source: 'SKILL_SECTION' },
    { name: 'Redis', raw: 'Redis', level: 'PROFICIENT', source: 'PROJECT' },
    { name: 'Git', raw: 'Git', level: 'BASIC', source: 'SKILL_SECTION' }
  ],
  awards: [{ name: '校级一等奖学金', date: '2024-10' }],
  meta: {
    parserVersion: '1.0.0',
    docType: 'PDF',
    pageCount: 2,
    lowConfidenceFields: ['education[0].end', 'project[0].role']
  }
}

const BLOCKS: ResumeBlock[] = [
  {
    id: 401,
    blockType: 'BASIC',
    sectionIdx: 0,
    rawText: '张同学 · 后端开发 · 2026 届\n杭州 · 13800000000 · zhangsan@example.com',
    pageNo: 1,
    confidence: 0.96
  },
  {
    id: 402,
    blockType: 'EDUCATION',
    sectionIdx: 0,
    rawText: '××大学　计算机科学与技术　本科　2022.09 — 2026.06',
    pageNo: 1,
    confidence: 0.86,
    highlight: 'warn'
  },
  {
    id: 403,
    blockType: 'EDUCATION',
    sectionIdx: 1,
    rawText: 'GPA 3.6/4.0　专业排名前 15%',
    pageNo: 1,
    confidence: 0.94
  },
  {
    id: 404,
    blockType: 'WORK',
    sectionIdx: 0,
    rawText:
      '××科技有限公司　后端开发实习生　2025.07 — 2025.10\n参与订单服务接口开发，负责幂等与重试逻辑；\n使用 Redis 缓存热点数据，QPS 提升约 3 倍。',
    pageNo: 2,
    confidence: 0.89
  },
  {
    id: 405,
    blockType: 'PROJECT',
    sectionIdx: 0,
    rawText:
      '校园二手交易平台　后端负责人　2024.09 — 2025.01\n技术栈：Spring Boot、MySQL、Redis；\n负责商品与订单模块，优化了接口性能。',
    pageNo: 2,
    confidence: 0.72,
    highlight: 'bad'
  },
  {
    id: 406,
    blockType: 'SKILL',
    sectionIdx: 0,
    rawText: 'Java / Spring Boot / MySQL / Redis / Git',
    pageNo: 2,
    confidence: 0.95
  },
  {
    id: 407,
    blockType: 'AWARD',
    sectionIdx: 0,
    rawText: '校级一等奖学金　2024.10',
    pageNo: 2,
    confidence: 0.92
  }
]

/* ------------------------------------------------------------------ */
/* 筛选配置 / 设备                                                     */
/* ------------------------------------------------------------------ */

let configState: AgentConfig = {
  cities: ['杭州', '上海'],
  keyword: 'Java 后端',
  salaryMin: 15,
  salaryMax: 30,
  expCodes: ['应届', '1-3年'],
  degreeCodes: ['本科'],
  excludeWords: ['外包', '驻场', '销售', '培训'],
  scoreThreshold: 0.7,
  applyLevel: 'L2',
  dailyLimit: 30,
  batchSize: 20,
  activeHours: '09:00-21:00',
  resumeVersionId: 3,
  greetingTemplate:
    '您好，我是 2026 届计算机专业毕业生，做过 {job} 相关的后端项目，熟悉 Java / Spring Boot / MySQL，希望有机会进一步沟通。'
}

let devices: AgentDevice[] = [
  {
    id: 1,
    deviceName: 'Chrome · Windows',
    lastSeenAt: '2026-10-28 10:18:00',
    revoked: false
  }
]

function randomPairCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const pick = () =>
    Array.from({ length: 4 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('')
  return `${pick()}-${pick()}`
}

let pairCode: PairCode = { code: '7K3D-9QX2', expireIn: 600 }

/* ------------------------------------------------------------------ */
/* 岗位                                                                */
/* ------------------------------------------------------------------ */

interface JobSeed {
  title: string
  company: string
  city: string
  salary: string
  exp: string
  degree: string
  score: number
  status: Job['status']
  hit: string[]
  miss: string[]
  jd: string
}

const JOB_SEEDS: JobSeed[] = [
  {
    title: 'Java 后端开发工程师',
    company: '××科技有限公司',
    city: '杭州',
    salary: '15-25K',
    exp: '3-5年',
    degree: '本科',
    score: 0.72,
    status: 'PENDING',
    hit: ['Java', 'Spring Boot', 'MySQL', 'Redis'],
    miss: ['Kafka', 'Kubernetes'],
    jd: '负责交易链路后端服务的设计与开发，熟悉 Spring Cloud 微服务体系。'
  },
  {
    title: '后端开发工程师（校招）',
    company: '××网络科技',
    city: '杭州',
    salary: '12-18K',
    exp: '应届',
    degree: '本科',
    score: 0.81,
    status: 'PENDING',
    hit: ['Java', 'MySQL', 'Redis'],
    miss: [],
    jd: '参与核心业务服务端开发，要求熟悉 Java、MySQL，了解 Redis 缓存设计。'
  },
  {
    title: '服务端研发工程师',
    company: '××云计算',
    city: '上海',
    salary: '18-30K',
    exp: '1-3年',
    degree: '本科',
    score: 0.66,
    status: 'PENDING',
    hit: ['Java', 'Spring Cloud'],
    miss: ['Kafka', 'K8s'],
    jd: '参与云平台服务端研发，熟悉 Spring Cloud 微服务与消息中间件。'
  },
  {
    title: 'Java 开发（交易方向）',
    company: '××电商',
    city: '杭州',
    salary: '20-35K',
    exp: '3-5年',
    degree: '本科',
    score: 0.58,
    status: 'SKIPPED',
    hit: ['Java', 'MySQL'],
    miss: ['Kafka', 'K8s', 'Dubbo'],
    jd: '负责交易系统核心链路开发，要求熟悉分布式服务框架与消息中间件。'
  },
  {
    title: '后端工程师',
    company: '××数据',
    city: '上海',
    salary: '16-24K',
    exp: '1-3年',
    degree: '硕士',
    score: 0.47,
    status: 'SKIPPED',
    hit: ['Java'],
    miss: ['Flink'],
    jd: '负责实时数据链路开发，熟悉 Java 与流式计算引擎。'
  },
  {
    title: 'Golang 后端开发',
    company: '××科技',
    city: '杭州',
    salary: '18-28K',
    exp: '1-3年',
    degree: '本科',
    score: 0.39,
    status: 'SKIPPED',
    hit: [],
    miss: ['Go', 'gRPC'],
    jd: '负责基础服务开发，要求熟练掌握 Go 与 gRPC。'
  },
  {
    title: 'Java 实习生',
    company: '××信息',
    city: '杭州',
    salary: '4-6K',
    exp: '应届',
    degree: '本科',
    score: 0.83,
    status: 'APPLIED',
    hit: ['Java', 'Spring Boot'],
    miss: [],
    jd: '协助完成后端模块开发，熟悉 Java / Spring Boot 即可。'
  },
  {
    title: '中间件研发工程师',
    company: '××基础架构',
    city: '上海',
    salary: '25-40K',
    exp: '3-5年',
    degree: '本科',
    score: 0.61,
    status: 'PENDING',
    hit: ['Java', 'Redis'],
    miss: ['Kafka', 'RocketMQ'],
    jd: '参与消息中间件研发，熟悉 Kafka / RocketMQ 者优先。'
  }
]

const JOBS: Job[] = JOB_SEEDS.map((seed, index) => ({
  id: index + 1,
  reportId: 201 + index,
  title: seed.title,
  company: seed.company,
  city: seed.city,
  salary: seed.salary,
  exp: seed.exp,
  degree: seed.degree,
  tags: seed.hit,
  jdSummary: seed.jd,
  jobUrl: `https://www.zhipin.com/job_detail/demo-${index + 1}.html`,
  score: seed.score,
  stage: seed.score >= 0.7 ? 'FINE' : 'COARSE',
  status: seed.status,
  hitSkills: seed.hit,
  missSkills: seed.miss,
  collectedAt: `2026-10-28 09:${String(10 + index).padStart(2, '0')}:00`
}))

const JOB_INDEX = new Map(JOBS.map((job) => [job.id, job]))

const APPLICATIONS: Application[] = [
  {
    id: 1,
    jobId: 7,
    jobTitle: 'Java 实习生',
    company: '××信息',
    city: '杭州',
    applyLevel: 'L2',
    channel: 'EXTENSION',
    status: 'SENT',
    appliedAt: '2026-10-28 10:32:11'
  },
  {
    id: 2,
    jobId: 2,
    jobTitle: '后端开发工程师（校招）',
    company: '××网络科技',
    city: '杭州',
    applyLevel: 'L2',
    channel: 'EXTENSION',
    status: 'SENT',
    appliedAt: '2026-10-28 09:58:02'
  },
  {
    id: 3,
    jobId: 5,
    jobTitle: '后端工程师',
    company: '××数据',
    city: '上海',
    applyLevel: 'L3',
    channel: 'EXTENSION',
    status: 'FAILED',
    failReason: 'CAPTCHA',
    appliedAt: '2026-10-28 09:41:37'
  },
  {
    id: 4,
    jobId: 4,
    jobTitle: 'Java 开发（交易方向）',
    company: '××电商',
    city: '杭州',
    applyLevel: 'L1',
    channel: 'EXTENSION',
    status: 'SKIPPED',
    skipReason: 'EXCLUDED',
    appliedAt: '2026-10-27 21:10:05'
  },
  {
    id: 5,
    jobId: 6,
    jobTitle: 'Golang 后端开发',
    company: '××科技',
    city: '杭州',
    applyLevel: 'L1',
    channel: 'EXTENSION',
    status: 'SKIPPED',
    skipReason: 'LOW_SCORE',
    appliedAt: '2026-10-27 20:52:41'
  },
  {
    id: 6,
    jobId: 3,
    jobTitle: '服务端研发工程师',
    company: '××云计算',
    city: '上海',
    applyLevel: 'L2',
    channel: 'EXTENSION',
    status: 'SENT',
    appliedAt: '2026-10-27 16:22:08'
  }
]

/* ------------------------------------------------------------------ */
/* 证据与报告                                                          */
/* ------------------------------------------------------------------ */

const EVIDENCE_LIBRARY: Record<string, ReportEvidence> = {
  Java: {
    title: 'Java',
    req: '熟练掌握 Java，理解 JVM 内存模型与并发编程。',
    blocks: [
      { page: 1, text: '专业技能：Java / Spring Boot / MySQL / Redis / Git', confidence: 0.95 },
      {
        page: 2,
        text: '实习：参与订单服务接口开发，负责幂等与重试逻辑（Java + Spring Boot）。',
        confidence: 0.91
      }
    ],
    note: '技能词典精确命中，熟练度按“项目中使用 3 次以上”判为熟练。'
  },
  'Spring Boot': {
    title: 'Spring Boot',
    req: '熟悉 Spring Boot，能独立完成服务端模块开发。',
    blocks: [
      { page: 2, text: '项目：校园二手交易平台，技术栈 Spring Boot、MySQL、Redis。', confidence: 0.93 }
    ],
    note: '完全命中，h=1.0。'
  },
  MySQL: {
    title: 'MySQL',
    req: '熟悉 MySQL，具备索引与慢查询优化经验。',
    blocks: [
      {
        page: 2,
        text: '使用 Redis 缓存热点数据，QPS 提升约 3 倍；MySQL 负责订单与商品表。',
        confidence: 0.88
      }
    ],
    note: '命中，但未见“索引优化”直接证据，语义分略低。'
  },
  Redis: {
    title: 'Redis',
    req: '熟悉 Redis 缓存设计与热点数据处理。',
    blocks: [{ page: 2, text: '使用 Redis 缓存热点数据，QPS 提升约 3 倍。', confidence: 0.9 }],
    note: '完全命中。'
  },
  'Spring Cloud': {
    title: 'Spring Cloud（部分命中）',
    req: '熟悉 Spring Cloud 微服务体系。',
    blocks: [
      {
        page: 2,
        text: '技术栈中出现 Spring Boot，未出现 Spring Cloud 组件（Eureka / Gateway / Nacos）。',
        confidence: 0.72
      }
    ],
    note: '仅命中下位技能，h=0.6，按 60% 计入。'
  },
  Kafka: {
    title: 'Kafka（缺失）',
    req: '熟悉 Kafka 等消息中间件，有高并发场景经验者优先。',
    blocks: [],
    note: '简历全文未出现 Kafka / 消息队列 / MQ 相关表述，判定为硬性缺失。'
  },
  Kubernetes: {
    title: 'Kubernetes（缺失）',
    req: '了解 Kubernetes 容器化部署，能参与 CI/CD。',
    blocks: [],
    note: '简历未出现容器、Docker、K8s 相关表述。'
  }
}

EVIDENCE_LIBRARY.K8s = { ...EVIDENCE_LIBRARY.Kubernetes, title: 'Kubernetes（缺失）' }

function evidenceFor(skill: string, hit: boolean, job: Job): ReportEvidence {
  const found = EVIDENCE_LIBRARY[skill]
  if (found) {
    return found
  }
  if (!hit) {
    return {
      title: `${skill}（缺失）`,
      req: `熟悉 ${skill}，有相关项目经验。`,
      blocks: [],
      note: `简历全文未出现 ${skill} 相关表述，判定为硬性缺失。`
    }
  }
  return {
    title: skill,
    req: `熟悉 ${skill}，有相关项目经验。`,
    blocks: [
      {
        page: 2,
        text: `项目：校园二手交易平台，技术栈 Spring Boot、MySQL、Redis；岗位「${job.title}」要求 ${skill}。`,
        confidence: 0.86
      }
    ],
    note: '命中，h=1.0。'
  }
}

function clampScore(value: number): number {
  return Math.max(0.2, Math.min(0.98, Number(value.toFixed(2))))
}

function subScoresOf(job: Job): SubScores {
  return {
    skill: clampScore(job.score - 0.04),
    sem: clampScore(job.score + 0.09),
    exp: clampScore(job.score + 0.03),
    edu: clampScore(job.score - 0.02)
  }
}

function buildReport(job: Job): MatchReport {
  const evidences: Record<string, ReportEvidence> = {}

  const hit: SkillHit[] = job.hitSkills.map((skill) => {
    evidences[skill] = evidenceFor(skill, true, job)
    return { skill, level: 'PROFICIENT' }
  })

  const partial: SkillHit[] =
    job.id === 1
      ? [
          {
            skill: 'Spring Cloud',
            note: '仅命中下位技能 Spring Boot'
          }
        ]
      : []

  if (job.id === 1) {
    evidences['Spring Cloud'] = EVIDENCE_LIBRARY['Spring Cloud']
  }

  const missed: SkillHit[] = job.missSkills.map((skill) => {
    const evidence = evidenceFor(skill, false, job)
    evidences[skill] = evidence
    return { skill, reqType: 'HARD', jdSentence: evidence.req }
  })

  const requirements =
    job.id === 1
      ? [
          '负责交易链路后端服务的设计与开发，熟悉 Spring Cloud 微服务体系。',
          '熟悉 Kafka 等消息中间件，有高并发场景经验者优先。',
          '了解 Kubernetes 容器化部署，能参与 CI/CD 流程建设。'
        ]
      : [
          job.jdSummary,
          ...job.missSkills.map((skill) => `熟悉 ${skill}，有相关项目经验者优先。`)
        ]

  const risks =
    job.id === 1
      ? [
          '硬性技能缺失 2 项：Kafka、Kubernetes，占总权重的 22%。',
          '岗位要求 3-5 年经验，简历最长实习 4 个月，年限差 2 年以上。',
          '项目描述平均 62 字，偏笼统，建议补充职责与量化结果。'
        ]
      : [
          ...(job.missSkills.length
            ? [`硬性技能缺失 ${job.missSkills.length} 项：${job.missSkills.join('、')}。`]
            : []),
          ...(job.exp.includes('3-5')
            ? ['岗位要求 3-5 年经验，简历最长实习 4 个月，年限差 2 年以上。']
            : []),
          '项目描述平均 62 字，偏笼统，建议补充职责与量化结果。'
        ]

  return {
    id: job.reportId,
    jobId: job.id,
    job: clone(job),
    totalScore: job.score,
    subScores: subScoresOf(job),
    weights: { ...WEIGHTS },
    algoVersion: '1.0.0',
    dictVersion: 'd-20261026',
    resumeVersion: 'v3',
    idfFallback: false,
    skills: { hit, partial, missed },
    risks,
    requirements,
    details: {
      skillCoverage: `${Math.round(job.score * 17.6)} / 17.6`,
      bestSemanticBlock: '项目经历 · 订单模块',
      expOverlap: job.exp.includes('3-5') ? '0.35' : '0.72',
      eduVerdict: job.degree === '硕士' ? '学历低于要求一级' : '达标 · 专业相关'
    },
    evidences
  }
}

/* ------------------------------------------------------------------ */
/* 工作台                                                              */
/* ------------------------------------------------------------------ */

function buildDashboard(): Dashboard {
  const resume = RESUME_STATE[0]
  const recentReports = JOBS.slice(0, 5).map((job) => ({
    reportId: job.reportId,
    jobId: job.id,
    title: job.title,
    company: job.company,
    city: job.city,
    score: job.score,
    topGap: job.missSkills[0] ?? '无硬性缺失',
    createdAt: '今天',
    subScores: subScoresOf(job)
  }))

  return {
    stats: {
      resumeVersions: resume.currentVersion,
      resumeTitle: resume.title,
      parseConfidence: resume.confidence,
      totalJobs: 128,
      weeklyCollected: 126,
      weeklyTrend: 38,
      qualified: 23,
      threshold: configState.scoreThreshold,
      applied: 18,
      appliedToday: 3,
      remainingQuota: 27,
      dailyLimit: configState.dailyLimit
    },
    recentReports,
    plugin: {
      connected: devices.some((device) => !device.revoked),
      device: devices.find((device) => !device.revoked)?.deviceName ?? '未绑定设备',
      quotaUsed: 3,
      quotaTotal: configState.dailyLimit,
      applyLevel: configState.applyLevel,
      queueState: '空闲',
      lastSeenAt: '2026-10-28 10:18:00'
    },
    capability: [
      { label: '后端框架', score: 0.86 },
      { label: '数据存储', score: 0.74 },
      { label: '中间件', score: 0.48 },
      { label: '工程化', score: 0.61 }
    ]
  }
}

/* ------------------------------------------------------------------ */
/* 导出 mock API                                                       */
/* ------------------------------------------------------------------ */

export const mockApi = {
  async login(payload: { username: string; password: string }): Promise<LoginResult> {
    void payload.password
    currentUser = buildUser(payload.username)
    return { token: `mock-token-${Date.now()}`, user: currentUser }
  },

  async register(payload: {
    username: string
    password: string
    nickname?: string
  }): Promise<LoginResult> {
    void payload.password
    currentUser = buildUser(payload.username, payload.nickname)
    return { token: `mock-token-${Date.now()}`, user: currentUser }
  },

  async getMe(): Promise<UserInfo> {
    if (!currentUser) {
      currentUser = clone(DEMO_USER)
    }
    return currentUser
  },

  async getDashboard(): Promise<Dashboard> {
    return buildDashboard()
  },

  async listResumes(): Promise<Resume[]> {
    return clone(RESUME_STATE)
  },

  async getParseDetail(resumeId: number): Promise<ParseDetail> {
    const resume = RESUME_STATE.find((item) => item.id === resumeId) ?? RESUME_STATE[0]
    return {
      resume: clone(resume),
      versionId: 31,
      versionNo: resume.currentVersion,
      schema: clone(SCHEMA),
      blocks: clone(BLOCKS)
    }
  },

  async saveResumeSchema(versionId: number, schema: ResumeSchema): Promise<SaveResult> {
    void versionId
    const resume = RESUME_STATE[0]
    resume.currentVersion += 1
    resume.versionCount += 1
    resume.status = 'CONFIRMED'
    resume.updatedAt = '2026-10-28 10:45:00'
    schema.meta.lowConfidenceFields = []
    return { versionId: versionId + 1, versionNo: resume.currentVersion }
  },

  async getAgentConfig(): Promise<AgentConfig> {
    return clone(configState)
  },

  async saveAgentConfig(config: AgentConfig): Promise<AgentConfig> {
    configState = clone(config)
    return clone(configState)
  },

  async createPairCode(): Promise<PairCode> {
    pairCode = { code: randomPairCode(), expireIn: 600 }
    return { ...pairCode }
  },

  async listDevices(): Promise<AgentDevice[]> {
    return clone(devices)
  },

  async revokeDevice(id: number): Promise<void> {
    devices = devices.map((device) => (device.id === id ? { ...device, revoked: true } : device))
  },

  async listJobs(query: JobQuery = {}): Promise<PageResult<Job>> {
    let list = clone(JOBS)

    if (query.keyword) {
      const keyword = query.keyword.trim().toLowerCase()
      list = list.filter(
        (job) =>
          job.title.toLowerCase().includes(keyword) ||
          job.company.toLowerCase().includes(keyword) ||
          job.hitSkills.some((skill) => skill.toLowerCase().includes(keyword))
      )
    }
    if (query.city) {
      list = list.filter((job) => job.city === query.city)
    }
    if (query.status) {
      list = list.filter((job) => job.status === query.status)
    }
    if (typeof query.minScore === 'number') {
      const minScore = query.minScore
      list = list.filter((job) => job.score >= minScore)
    }

    list.sort((a, b) => b.score - a.score)

    return {
      list,
      total: 128,
      page: query.page ?? 1,
      size: query.size ?? list.length
    }
  },

  async listApplications(): Promise<Application[]> {
    return clone(APPLICATIONS)
  },

  async getReport(reportId: number): Promise<MatchReport> {
    const job = JOBS.find((item) => item.reportId === reportId)
    if (!job) {
      throw new Error('报告不存在')
    }
    return buildReport(job)
  },

  async matchJob(jobId: number): Promise<{ reportId: number }> {
    const job = JOB_INDEX.get(jobId)
    if (!job) {
      throw new Error('岗位不存在或已下线')
    }
    return { reportId: job.reportId }
  }
}
