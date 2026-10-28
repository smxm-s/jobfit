# JobFit · 智能求职辅助平台 项目文档

> 版本：v1.1（MVP 基线，加入浏览器插件采集与半自动投递）
> 状态：待开发
> 定位：本文档是唯一的开发依据。产品范围、数据结构、算法口径、接口契约均以此为准；与旧版开题报告冲突时，以本文档为准。
>
> v1.1 变更：岗位来源由"服务端岗位库"改为"Web 侧筛选配置 + 浏览器插件在 Boss 直聘采集"；新增批量打分、设备配对、投递回报；"连投"降级为半自动，见 3.1 与 4.2 节。

---

## 1. 项目是什么

**JobFit 把一份普通简历变成"可对比、可解释、可定位"的结构化能力画像；用户在 Web 端配好筛选条件后，浏览器插件在自己的登录态下到 Boss 直聘采集岗位、回传打分，筛出真正值得投的岗位，并支持半自动投递。**

一句话链路：

```
上传简历 → 结构化解析（可人工校正）→ Web 配筛选 → 插件在 Boss 采集 → 批量打分 → 诊断报告 → 半自动投递
```

两条产品原则：

1. **登录态不出本机**。插件复用浏览器里已有的 Boss 登录态，Cookie 与账号凭证不经过服务端；服务端只接收岗位摘要与打分请求。
2. **只存结论，不存全文**。服务端只落库"通过排除词且分数达标"的岗位摘要，JD 全文用完即弃，避免把系统做成爬虫数据库。

### 1.1 解决的真实问题

| 现状 | 问题 |
| --- | --- |
| 模板站（超级简历等） | 只解决"好看"，不解决"对不对" |
| 招聘平台 | 诊断结果面向企业筛选，求职者看不到可操作建议 |
| 关键词工具（Jobscan/Rezi） | 英文语境、只报关键词命中率，说不清差距 |
| 通用大模型润色 | 会编造量化成果、缺乏岗位针对性、不可复现 |

JobFit 的差异点在**可解释**与**可复现**：总分不是一个黑盒数字，而是四个分项，每个分项都能指回简历原文与 JD 原句；任一历史报告都保存了算法版本、权重和输入快照，可以完全复算。

### 1.2 目标用户

在校学生与应届生（单人求职场景），使用 Chrome/Edge 浏览器投递。管理员维护技能词典与评测集。

### 1.3 系统组成

| 组成 | 形态 | 职责 |
| --- | --- | --- |
| Web 平台 | Vue 3 前端 + Spring Boot 业务服务 + Python 算法服务 | 简历解析、筛选配置、批量打分、报告、投递记录 |
| 浏览器插件 | Chrome Extension MV3 | 按配置打开 Boss 列表页、解析卡片、上报 JD、展示分数、执行投递动作 |

---

## 2. 范围

### 2.1 MVP（本期必做）

| 编号 | 能力 | 说明 |
| --- | --- | --- |
| M-01 | 账号 | 注册、登录、求职意向维护 |
| M-02 | 简历上传解析 | PDF / DOCX → 结构化 JSON，异步任务 + 状态轮询 |
| M-03 | 低置信校正 | 置信度低于阈值的字段前端高亮，用户修改后回写并固化版本 |
| M-04 | 简历块管理 | 按区块（教育/工作/项目/技能）查看与编辑，支持多版本 |
| M-05 | 筛选配置 | 城市/关键词/薪资/经验/学历 + 排除词 + 分数阈值 + 投递上限，存服务端 |
| M-06 | 插件采集 | 打开 Boss 列表页、翻页、解析岗位卡片与 JD 摘要、批量上报 |
| M-07 | 批量打分 | 服务端粗筛（技能+排除词+去重）+ TopN 精算，返回分数与命中技能 |
| M-08 | 匹配诊断 | 单岗位四维评分、分项得分、命中/缺失技能、风险提示、证据定位 |
| M-09 | 报告快照 | 保存算法版本、权重、输入摘要，支持历史报告查看与复算 |
| M-10 | 投递记录 | 记录"已投/跳过/失败"及原因，按岗位去重，防止重复投递 |
| M-11 | 简历导出 | 服务端渲染导出 PDF（与预览一致） |

### 2.2 投递能力（分级上线）

| 编号 | 能力 | 默认 | 说明 |
| --- | --- | --- | --- |
| M-12 | L2 一键确认投递 | **开启** | 插件打开详情页并预填打招呼语，用户点发送；人在环，风险低 |
| E-01 | L3 队列自动投递 | **关闭** | 限频队列（随机 40–120 s/条、日上限默认 30、仅 9:00–21:00），遇验证码/风控页立即熔断；作为实验特性演示 |

### 2.3 二期（本期不做，但预留扩展点）

- 证据约束的改写 + 句级 diff + "待确认"标记
- 投递状态看板（笔试/面试/结果流转）
- 评测中心（批量评测、消融实验）
- 企业端脱敏查看
- 多平台采集适配器（实习僧、牛客等），插件侧只换选择器配置

### 2.4 明确不做

- 不做服务端批量爬虫（所有 Boss 页面访问都发生在用户浏览器内）
- 不做企业侧 ATS 系统
- 不做简历模板市场 / 移动端 App / 多租户计费

---

## 3. 角色与核心用例

| 角色 | 权限 |
| --- | --- |
| SEEKER（求职者） | 自己的简历、筛选配置、报告、投递记录 |
| ADMIN | 技能词典、用户管理、日志、评测集 |
| 浏览器插件（设备） | 以设备 token 调用采集与打分接口，仅能读写绑定用户的资源 |

**核心用例 1：上传简历并生成诊断报告**

1. 用户上传 PDF/DOCX（≤ 10 MB）
2. 系统校验格式与大小 → 去重（文件哈希）→ 存入 MinIO → 创建解析任务
3. 算法服务解析 → 结构化 JSON + 每字段置信度 + 原文偏移
4. 前端展示结构化结果，低置信字段高亮
5. 用户修改确认 → 生成简历版本
6. 选择岗位 → 计算匹配 → 返回报告（总分、四项分、命中/缺失、风险、证据）

异常分支：格式不支持 / 超出大小 / 解析失败（提示改用手工录入）/ 加密 PDF（提示去密码）。

**核心用例 2：查看报告中的证据**

点击任一扣分项 → 展示该要求的 JD 原句 + 简历中命中或缺失的段落（含页码与字符区间），未命中时明确标注"简历中未找到对应描述"。

**核心用例 3：配筛选 → 插件采集 → 批量打分 → 投递**

1. 用户在 Web 端"岗位筛选"页配置城市/关键词/薪资/经验/学历、排除词、分数阈值、投递上限，点保存
2. 插件读取配置，按参数拼接 Boss 列表页 URL 并打开
3. 插件解析当前页卡片、滚动加载、翻页，收集岗位摘要
4. 达到一批（默认 20 条）后调用 `POST /api/jobs/ingest`，服务端做去重与排除词过滤
5. 服务端批量打分，返回每条岗位的分数与命中技能
6. 插件在卡片上打分数角标；低于阈值的折叠，达标的置顶
7. 用户选择 L2（逐条确认）或开启 L3（队列自动），插件执行并回报投递结果

异常分支：未登录 Boss（提示先登录，插件不代登录）/ 触发验证码（停止队列并提示）/ 页面结构变化（解析失败率超阈值时降级为仅"打开链接"）/ 超出日投递上限（停止并提示）。

### 3.1 投递分级（重要）

| 级别 | 行为 | 默认 | 说明 |
| --- | --- | --- | --- |
| L1 | 只采集、只标注分数，不动作 | 开启 | 无账号风险 |
| L2 | 打开详情页 + 预填打招呼语，用户点发送 | 开启 | 人在环，风险低 |
| L3 | 队列自动发送 | **默认关闭** | 限频 + 熔断；仅作实验特性演示 |

---

## 4. 总体架构

```
       用户浏览器（本机）
 ┌───────────────────────────────────────────────┐
 │  Web 页面（Vue3）      浏览器插件（MV3）         │
 │        │                     │                 │
 │        │           Boss 页面（用户登录态）        │
 │        │                     │  Cookie 只在本机  │
 └────────┼─────────────────────┼─────────────────┘
          │ HTTPS               │ HTTPS（仅 JD 摘要/分数/投递结果）
          ▼                     ▼
 ┌──────────────────────────────────────────────┐
 │  Nginx（静态资源 + 反向代理 + 插件分发）          │
 └──────────────────┬───────────────────────────┘
                    │
        ┌───────────▼────────────┐        ┌──────────────────┐
        │ 业务服务                  │ REST   │ 算法服务            │
        │ Spring Boot 3 (Java 17)  │ ─────▶ │ Python + FastAPI  │
        └──┬────┬────┬───────────┘        │ (解析/归一/打分)    │
           │    │    │                     └──────────────────┘
           │    │    └──── MinIO（简历原件/导出）
           │    └───────── Redis（会话/缓存/任务/限频计数）
           └────────────── MySQL 8（业务 + 向量 BLOB）
```

**服务边界**

- 业务服务（Java）：账号、权限、简历、筛选配置、采集入库、批量打分编排、报告落库、投递记录。**唯一对外提供 API 的服务。**
- 算法服务（Python）：无状态计算，只接受内部调用，不直连业务库。
- 浏览器插件（TS）：唯一接触 Boss 页面的组件。**不落库、不代登录、不上传 Cookie**，只做"解析页面 → 上报 → 展示结果 → 执行动作"。

**三条硬约束**

1. 算法服务不写数据库，输入输出都是 JSON，保证可单测、可替换模型。
2. 报告落库时必须带 `algo_version + weights_json + input_snapshot`，否则不允许入库。
3. 插件与 Boss 之间的所有请求发生在用户浏览器内，服务端永不代理 Boss 请求，也不保存任何 Cookie。

### 4.1 插件端架构（新增）

```
popup（状态面板）
   ├─ 当前队列：待投 / 已投 / 失败
   ├─ 开关：L1 / L2 / L3、立即暂停
   └─ Boss 登录状态检测（只读，不代登录）

background.service_worker（调度中枢）
   ├─ 拉取配置（GET /api/agent/config）
   ├─ 任务队列 + 限频器（随机间隔、日上限、时段窗口）
   ├─ 批量上报（POST /api/jobs/ingest，20 条/批）
   ├─ 批量打分（POST /api/match/batch）
   └─ 熔断器（验证码/风控页/连续失败 → 暂停 + 通知）

content script（zhipin.com 页面内）
   ├─ 列表页：解析卡片 → {title, company, city, salary, exp, degree, tags, jobUrl, jdSummary}
   ├─ 列表页：注入分数角标、低于阈值折叠
   ├─ 详情页：取 JD 全文（仅在需要精算时）
   └─ 投递：点击"立即沟通"→ 填打招呼语 →（L2 等用户确认 / L3 自动）

storage.local
   ├─ deviceToken（配对换取，不含密码）
   ├─ 采集去重缓存（jdHash 最近 N 条）
   └─ 队列状态快照

选择器全部来自 selectors.json（可远程下发覆盖），解析失败只降级不硬崩。
```

### 4.2 投递为什么只做到"半自动"

| 约束 | 后果 | 设计应对 |
| --- | --- | --- |
| Boss 条款禁止自动化操作 | 全自动存在合规争议 | 默认 L2，L3 需显式开启，并在界面标注风险 |
| 高频请求触发验证码/风控 | 可能临时限制或封号 | 随机间隔 + 日上限 + 时段窗口 + 熔断即停，不重试 |
| 行为轨迹可被识别 | 连续机械点击特征明显 | 单条间隔抖动、每 N 条插入随机停留、失败不连点 |

### 4.3 与旧开题报告的技术调整（重要）

| 项 | 原方案 | 现方案 | 原因 |
| --- | --- | --- | --- |
| 向量检索 | MySQL + pgvector | **向量存 MySQL（BLOB），在算法服务进程内用 numpy 计算余弦** | pgvector 是 PostgreSQL 扩展，原方案等于同时维护两套数据库，与"避免引入独立向量库"自相矛盾；MVP 规模（≤ 5k 岗位）内存计算完全够用 |
| 异步任务 | RabbitMQ | **`parse_task` 表 + Redis 状态 + Spring 线程池消费** | 少一个中间件，链路可观测；接口层保持"提交任务 + 轮询"不变，二期可直接换 MQ |
| 岗位来源 | 服务端岗位库（手工录入/CSV） | **Web 配筛选 + 插件在 Boss 采集**（保留 CSV 导入作为离线数据与评测集入口） | 服务端爬取有合规与反爬双重问题；插件天然复用用户登录态，Cookie 不出本机 |
| 岗位存储 | 全量 JD 入库 | **只存达标岗位摘要，JD 全文用完即弃** | 避免做成爬虫数据库，也规避 JD 全文版权问题 |
| 投递 | 投递记录看板（手工标记） | **插件回报投递结果 + L1/L2/L3 分级** | 记录可自动产生，且能防止重复投递 |
| 改写的定位 | MVP 内 | 移到二期 | MVP 先保证"解析—匹配—报告"这条链路真的可信 |
| 评测样本 | 100 份 / 50 组（两处口径不一） | **50 份简历、50 条岗位、100 组人工配对** | 统一口径；插件采集的数据只做"线上体验验证"，不混入评测集 |

---

## 5. 技术选型

| 层 | 选型 | 说明 |
| --- | --- | --- |
| 前端 | Vue 3 + TypeScript + Vite + Element Plus + Pinia | 表单密集 + 报告可视化 |
| 浏览器插件 | Chrome Extension Manifest V3 + TypeScript + Vite（`@crxjs/vite-plugin`） | 只针对 Chromium 内核（Chrome / Edge），不做 Firefox |
| 业务后端 | Spring Boot 3 + Java 17 + MyBatis-Plus + Sa-Token | 权限、事务、任务编排 |
| 算法服务 | Python 3.11 + FastAPI + PyMuPDF + python-docx + numpy | 文档与向量生态 |
| 业务库 | MySQL 8.0（utf8mb4） | 事务与结构化数据 |
| 缓存 | Redis 7 | 会话、任务状态、**投递限频计数** |
| 对象存储 | MinIO | 简历原件、导出 PDF |
| 部署 | Docker Compose + Nginx | 单机一键起；插件包由 Nginx 静态分发 |
| 嵌入模型 | `BAAI/bge-small-zh-v1.5`（sentence-transformers，本地加载） | 512 维，CPU 可跑 |
| 大模型 | OpenAI 兼容接口 / Ollama，**MVP 默认关闭** | 只用于解析兜底与打招呼语生成，开关控制 |

> 依赖原则：MVP 只引入"跑不起来就演示不了"的组件。RabbitMQ、pgvector、向量数据库、独立 OCR 全部不进 MVP；插件不引入任何 UI 框架，用原生 DOM + 原生 CSS，保持包体小、审核风险低。

---

## 6. 数据模型

### 6.1 实体关系

```
sys_user 1─n resume 1─n resume_version 1─n resume_block
                            │ 1─n resume_skill n─1 skill 1─n skill_alias
resume 1─n parse_task
sys_user 1─1 agent_config         （筛选配置，按用户）
sys_user 1─n agent_device         （插件配对设备）
job 1─n job_requirement n─1 skill
sys_user 1─n application n─1 job  （投递记录）
resume_version n─n job  ──(match_report)── 1─n match_evidence
```

### 6.2 DDL 草案

```sql
-- 用户
CREATE TABLE sys_user (
  id            BIGINT PRIMARY KEY AUTO_INCREMENT,
  username      VARCHAR(50)  NOT NULL UNIQUE,
  password_hash VARCHAR(100) NOT NULL,
  nickname      VARCHAR(50),
  email         VARCHAR(100),
  role          VARCHAR(20)  NOT NULL DEFAULT 'SEEKER',  -- SEEKER / ADMIN
  job_intention VARCHAR(200),                            -- 求职意向，参与教育/经历分
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 简历（逻辑主体）
CREATE TABLE resume (
  id              BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id         BIGINT NOT NULL,
  title           VARCHAR(100) NOT NULL,
  current_version INT NOT NULL DEFAULT 0,
  file_hash       CHAR(64),                              -- 去重
  status          VARCHAR(20) NOT NULL DEFAULT 'DRAFT',   -- DRAFT / PARSED / CONFIRMED
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_resume_user (user_id)
);

-- 版本快照（每次校正/编辑产生新版本，旧版本保留）
CREATE TABLE resume_version (
  id               BIGINT PRIMARY KEY AUTO_INCREMENT,
  resume_id        BIGINT NOT NULL,
  version_no       INT NOT NULL,
  schema_json      JSON NOT NULL,          -- 结构化简历，见第 7 节
  source           VARCHAR(20) NOT NULL,   -- UPLOAD / MANUAL / CORRECTION
  parse_confidence DECIMAL(4,3),           -- 整体置信度
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_resume_version (resume_id, version_no)
);

-- 段落级冗余，用于"证据—原文"精确对应
CREATE TABLE resume_block (
  id           BIGINT PRIMARY KEY AUTO_INCREMENT,
  version_id   BIGINT NOT NULL,
  block_type   VARCHAR(30) NOT NULL,   -- BASIC/EDUCATION/WORK/PROJECT/SKILL/AWARD
  section_idx  INT NOT NULL DEFAULT 0, -- 同类型下第几段/第几条
  raw_text     TEXT NOT NULL,
  page_no      INT,
  start_offset INT,                    -- 相对简历全文的字符偏移
  end_offset   INT,
  confidence   DECIMAL(4,3),
  corrected    TINYINT NOT NULL DEFAULT 0,
  embedding    BLOB,                   -- float32 序列，512 维
  KEY idx_block_version (version_id, block_type)
);

-- 解析任务
CREATE TABLE parse_task (
  id         BIGINT PRIMARY KEY AUTO_INCREMENT,
  resume_id  BIGINT NOT NULL,
  file_key   VARCHAR(200) NOT NULL,   -- MinIO object key
  file_name  VARCHAR(200),
  status     VARCHAR(20) NOT NULL DEFAULT 'PENDING', -- PENDING/RUNNING/SUCCESS/FAILED
  error_msg  VARCHAR(500),
  attempts   INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_task_status (status, created_at)
);

-- 岗位（插件采集为主，CSV 导入作为离线/评测入口）
CREATE TABLE job (
  id               BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id          BIGINT NOT NULL,       -- 归属用户，插件采集的岗位按用户隔离
  title            VARCHAR(100) NOT NULL,
  company          VARCHAR(100),
  city             VARCHAR(50),
  salary_range     VARCHAR(50),
  exp_req          VARCHAR(50),           -- 经验要求原文，如"3-5年"
  degree_req       VARCHAR(50),           -- 学历要求原文
  tags             VARCHAR(500),          -- 卡片标签，逗号分隔
  jd_summary       TEXT,                  -- 卡片摘要，不存 JD 全文
  job_url          VARCHAR(500) NOT NULL,
  source           VARCHAR(20) NOT NULL,  -- EXTENSION / CSV / MANUAL
  jd_hash          CHAR(64) NOT NULL,     -- 去重：title+company+jobUrl 的 sha256
  status           VARCHAR(20) NOT NULL DEFAULT 'ACTIVE', -- ACTIVE / ARCHIVED
  collected_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_job_user_hash (user_id, jd_hash),
  KEY idx_job_user_score (user_id, collected_at)
);

-- 岗位要求（逐条，带硬性/加分标记，是打分与证据的最小单元）
-- MVP 只在"单岗位精算"时生成，JD 全文来自详情页，用完可清理
CREATE TABLE job_requirement (
  id        BIGINT PRIMARY KEY AUTO_INCREMENT,
  job_id    BIGINT NOT NULL,
  req_type  VARCHAR(10) NOT NULL,    -- HARD / NICE
  category  VARCHAR(20) NOT NULL,    -- SKILL / EDUCATION / EXPERIENCE / OTHER
  raw_text  VARCHAR(500) NOT NULL,   -- JD 原句
  skill_id  BIGINT,
  weight    DECIMAL(4,3) NOT NULL DEFAULT 1.000,
  KEY idx_req_job (job_id)
);

-- 插件筛选配置（按用户，一处配置多设备复用）
CREATE TABLE agent_config (
  id              BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id         BIGINT NOT NULL UNIQUE,
  cities          VARCHAR(200),        -- 逗号分隔城市编码
  keyword         VARCHAR(200),
  salary_min      INT,                 -- 单位 k/月
  salary_max      INT,
  exp_codes       VARCHAR(100),        -- Boss 经验编码
  degree_codes    VARCHAR(100),        -- Boss 学历编码
  exclude_words   VARCHAR(1000),       -- 逗号分隔，服务端过滤
  score_threshold DECIMAL(4,3) NOT NULL DEFAULT 0.700,
  apply_level     VARCHAR(5)  NOT NULL DEFAULT 'L1',   -- L1 / L2 / L3
  daily_limit     INT NOT NULL DEFAULT 30,
  batch_size      INT NOT NULL DEFAULT 20,
  active_hours    VARCHAR(20) DEFAULT '09:00-21:00',
  resume_version_id BIGINT,            -- 打分所用简历版本
  greeting_template VARCHAR(500),      -- 打招呼语模板，支持 {job}{company}
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 插件设备（配对后持有长期 token）
CREATE TABLE agent_device (
  id           BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id      BIGINT NOT NULL,
  device_name  VARCHAR(100),
  token_hash   CHAR(64) NOT NULL UNIQUE,   -- 只存 hash
  last_seen_at DATETIME,
  revoked      TINYINT NOT NULL DEFAULT 0,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_device_user (user_id)
);

-- 投递记录（插件回报）
CREATE TABLE application (
  id           BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id      BIGINT NOT NULL,
  job_id       BIGINT NOT NULL,
  channel      VARCHAR(20) NOT NULL DEFAULT 'EXTENSION', -- EXTENSION / MANUAL
  apply_level  VARCHAR(5),                 -- L1 / L2 / L3
  status       VARCHAR(20) NOT NULL,       -- SENT / SKIPPED / FAILED
  skip_reason  VARCHAR(200),               -- LOW_SCORE / EXCLUDED / DUPLICATE / NO_GREETING
  fail_reason  VARCHAR(200),               -- CAPTCHA / RISK_PAGE / SELECTOR_MISS
  applied_at   DATETIME,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_app_user_job (user_id, job_id),
  KEY idx_app_status (user_id, status, created_at)
);

-- 技能词典
CREATE TABLE skill (
  id        BIGINT PRIMARY KEY AUTO_INCREMENT,
  name      VARCHAR(100) NOT NULL UNIQUE,  -- 标准名
  category  VARCHAR(50),                   -- 语言/框架/数据库/工具/软技能
  parent_id BIGINT,                        -- 上下位关系
  enabled   TINYINT NOT NULL DEFAULT 1
);

CREATE TABLE skill_alias (
  id       BIGINT PRIMARY KEY AUTO_INCREMENT,
  skill_id BIGINT NOT NULL,
  alias    VARCHAR(100) NOT NULL,
  source   VARCHAR(20) DEFAULT 'DICT',  -- DICT / USER
  UNIQUE KEY uk_alias (alias)
);

-- 简历侧技能（从某一版本抽取，带证据）
CREATE TABLE resume_skill (
  id               BIGINT PRIMARY KEY AUTO_INCREMENT,
  version_id       BIGINT NOT NULL,
  skill_id         BIGINT NOT NULL,
  level            VARCHAR(20),   -- BASIC / PROFICIENT / EXPERT
  raw_text         VARCHAR(100),
  evidence_block_id BIGINT,
  KEY idx_rs_version (version_id)
);

-- 匹配报告（快照）
CREATE TABLE match_report (
  id                BIGINT PRIMARY KEY AUTO_INCREMENT,
  resume_version_id BIGINT NOT NULL,
  job_id            BIGINT NOT NULL,
  total_score       DECIMAL(5,4) NOT NULL,
  s_skill           DECIMAL(5,4),
  s_sem             DECIMAL(5,4),
  s_exp             DECIMAL(5,4),
  s_edu             DECIMAL(5,4),
  weights_json      JSON NOT NULL,
  algo_version      VARCHAR(30) NOT NULL,
  input_snapshot    JSON NOT NULL,  -- 简历版本号 + 岗位版本 + 词典版本 + 模型名
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_report_job (job_id, created_at),
  KEY idx_report_version (resume_version_id)
);

-- 证据明细（每个分项可拆解到行）
CREATE TABLE match_evidence (
  id              BIGINT PRIMARY KEY AUTO_INCREMENT,
  report_id       BIGINT NOT NULL,
  dimension       VARCHAR(20) NOT NULL,  -- SKILL/SEM/EXP/EDU
  req_id          BIGINT,
  resume_block_id BIGINT,
  hit             TINYINT NOT NULL,      -- 1 命中 / 0 缺失
  score           DECIMAL(5,4),
  note            VARCHAR(500),          -- 如"仅命中下位技能 Vue"
  KEY idx_ev_report (report_id, dimension)
);
```

### 6.3 字段约定

- 时间统一 `DATETIME`，时区 `Asia/Shanghai`。
- 分数为 0–1 的 `DECIMAL(5,4)`，展示时乘以 100。
- 版本不可原地修改：任何编辑都产生新的 `resume_version`，`resume.current_version` 指向最新。
- 删除为软删除的场景：岗位（`status='ARCHIVED'`）；简历版本永不删除。
- **岗位去重键**：`uk_job_user_hash (user_id, jd_hash)`。`jd_hash = sha256(title + company + job_url)`；同一岗位再次采集只更新 `collected_at`，不新增行。
- **投递去重键**：`uk_app_user_job (user_id, job_id)`，保证同一岗位永不重复投递。
- **JD 全文不入库**：`job` 只存 `jd_summary`；详情页 JD 全文仅在精算请求中传输，落库为 `job_requirement` 的逐条要求。
- **限频计数放 Redis**：`apply:{userId}:{yyyyMMdd}` 当日已投数，TTL 至次日 0 点；数据库只记最终结果。
- **设备 token**：`agent_device.token_hash` 只存 sha256，明文仅在配对响应中返回一次。

---

## 7. 简历结构化 Schema

`resume_version.schema_json` 固定为下列结构，算法服务与前端共用同一份约定（前端类型定义、后端 POJO、Python dict 必须一一对应）。

```json
{
  "basic": {
    "name": "张三",
    "phone": "13800000000",
    "email": "zhangsan@example.com",
    "city": "杭州",
    "jobIntention": "后端开发工程师",
    "yearsOfExp": 0,
    "confidence": { "name": 0.98, "phone": 0.95, "email": 0.99 }
  },
  "education": [
    {
      "school": "××大学",
      "major": "计算机科学与技术",
      "degree": "本科",
      "start": "2022-09",
      "end": "2026-06",
      "gpa": "3.6/4.0",
      "rank": "前 15%",
      "confidence": 0.86
    }
  ],
  "work": [
    {
      "company": "××科技有限公司",
      "title": "后端开发实习生",
      "start": "2025-07",
      "end": "2025-10",
      "description": "参与订单服务的接口开发…",
      "confidence": 0.78
    }
  ],
  "project": [
    {
      "name": "校园二手交易平台",
      "role": "后端负责人",
      "start": "2024-09",
      "end": "2025-01",
      "stack": ["Spring Boot", "MySQL", "Redis"],
      "description": "负责商品与订单模块…",
      "highlights": ["接口平均响应从 320ms 降至 90ms"],
      "confidence": 0.72
    }
  ],
  "skills": [
    { "name": "Java", "raw": "Java / JavaSE", "level": "PROFICIENT", "source": "SKILL_SECTION" }
  ],
  "awards": [
    { "name": "校级一等奖学金", "date": "2024-10" }
  ],
  "meta": {
    "parserVersion": "1.0.0",
    "docType": "PDF",
    "pageCount": 2,
    "lowConfidenceFields": ["project[0].role", "work[0].end"]
  }
}
```

**置信度规则（统一口径，三处共用同一常量）**

| 来源 | 置信度 |
| --- | --- |
| 规则精确命中（正则/词典/固定版式） | 0.95 |
| 分类模型或相似度匹配 | 模型概率值 × 0.9 |
| 大模型兜底抽取 | ≤ 0.75 |
| 用户手工确认 | 1.00 |

低于 `0.85` 的字段进入 `lowConfidenceFields`，前端高亮。

---

## 8. 算法设计

### 8.1 解析流水线（算法服务 `POST /internal/parse`）

```
文件字节流
  → ① 文本与坐标抽取
  → ② 版面分块（单栏/双栏）
  → ③ 阅读顺序重排
  → ④ 段落分类（区块归属）
  → ⑤ 字段抽取（含技能归一）
  → ⑥ 置信度计算 + 低置信标记
  → 输出 { schema, blocks[] }
```

**① 抽取**

- PDF：PyMuPDF `page.get_text("dict")`，逐 span 记录 `text / bbox / size / font / bold`；扫描件（文本长度 < 50）直接返回 `E_SCANNED_PDF`，不做 OCR。
- DOCX：`python-docx` 读段落与表格；表格按行列还原二维结构，避免单元格被拉平。

**② 版面分块**

- 取全部 span 的 `x0` 做一维聚类（间隙 > 页面宽度 15% 视为两栏），判定单栏/双栏。
- 字号 Top 3 且加粗的行视为标题候选；与区块关键词匹配后确定标题层级。
- 表格区域单独成块，保留行列结构。

**③ 阅读顺序重排**

栏内按 `y0` 升序，栏间按栏序号；跨栏标题（y 方向位于栏顶且宽度超过单栏）单独置于两栏之前。

**④ 段落分类**

先走关键词表（教育背景/教育经历、工作经历/实习经历、项目经历、专业技能/技能清单、获奖荣誉、自我评价），未命中时用 TF-IDF + 线性分类器兜底，仍不确定归入 `OTHER`。

**⑤ 字段抽取**

- 时间区间：`\d{4}[.\-/年]\d{1,2}[月]?\s*[-—~至]\s*(\d{4}[.\-/年]\d{1,2}[月]?|至今|现在)`
- 手机号：`1[3-9]\d{9}`；邮箱标准正则。
- 学校/公司/专业：词典匹配 + 后缀规则（"大学/学院/中学"、"有限公司/科技/集团"）。
- 学历：本科/硕士/博士/专科映射。
- 技能：走 8.2 的技能归一流程。
- 仅当某区块完全无法归类时调用大模型（受开关控制），返回结果强制置信度 ≤ 0.75。

**⑥ 输出约束**

返回的 `blocks` 必须与 `schema_json` 中的条目通过 `section_idx` 一一对应，保证报告能定位到原文。

### 8.2 技能标准化

技能归一的质量直接决定 `S_skill` 和证据的可读性，流程固定为四级降级：

```
原文片段
 → ① 精确匹配（标准名）
 → ② 别名匹配（skill_alias：中英文混写、缩写、常见误写）
 → ③ 模糊匹配（编辑距离 ≤ 2 或向量相似度 ≥ 0.88）
 → ④ 未命中：记为 UNKNOWN，不参与打分，进入"待补充词典"队列
```

**词典维护**

- `skill` 表维护标准名、类别、`parent_id`（如 `Spring Cloud → 微服务框架`、`Vue → 前端框架`）。
- 词典通过 `POST /api/admin/skills/reload` 热加载；每次变更递增 `dict_version`，写入报告快照。
- 初始词典规模：≥ 300 个标准技能、≥ 600 条别名，覆盖后端/前端/数据/算法/测试五个方向。

**熟练度抽取**

| 原文表述 | level |
| --- | --- |
| 了解 / 接触过 / 初步 | BASIC |
| 熟悉 / 掌握 / 熟练使用 | PROFICIENT |
| 精通 / 深入理解 / 源码级 | EXPERT |

若原文无表述，按使用该技能的项目数推断：≥ 3 个项目记 `PROFICIENT`，否则 `BASIC`。熟练度只影响展示与 `h_i` 的加权（`BASIC` 记 0.85），不改变"是否命中"。

### 8.3 JD 解析

输出解析对象与 `job_requirement` 行（JD 解析结果只保留逐条要求，不再整体存 `job` 表）：

```json
{
  "title": "Java 后端开发工程师",
  "education": { "degree": "本科", "majorRelated": ["计算机"] },
  "experience": { "minYears": 1 },
  "skills": [
    { "raw": "熟悉 Spring Boot", "skill": "Spring Boot", "reqType": "HARD" },
    { "raw": "了解 Docker 者优先", "skill": "Docker", "reqType": "NICE" }
  ]
}
```

分类规则：含"必须/要求/至少/需具备"为 `HARD`；含"优先/加分/了解者优先/更佳"为 `NICE`。两者都未命中时，技能类默认 `HARD`，其他默认 `NICE`。

**两种输入粒度**

| 来源 | 字段 | 用途 |
| --- | --- | --- |
| 列表页卡片 | `title/company/city/salary/exp_req/degree_req/tags/jd_summary` | 批量粗筛，够用；`jd_summary` 通常只有 1–2 句 |
| 详情页 | 完整 JD 文本 | 单岗位精算与诊断报告，抽 `job_requirement` 逐条要求 |

粗筛阶段**不调用** JD 解析，只用卡片上已有的结构化字段；只有进入 TopN 或用户点开详情时才解析全文 JD。

### 8.4 匹配打分（算法服务 `POST /internal/match`）

总分：

```
S = 0.40·S_skill + 0.25·S_sem + 0.20·S_exp + 0.15·S_edu
```

**S_skill（技能加权覆盖率）**

```
S_skill = Σ(w_i · h_i) / Σ(w_i)
w_i = idf(skill_i) = ln((N+1) / (df_i+1)) + 1      # N=岗位总数，df=含该技能的岗位数
h_i = 1.0（完全命中） | 0.6（仅命中下位技能） | 0（缺失）
```

`HARD` 技能的 `w_i` 乘以 1.5 的系数后再归一化。

> 口径说明：`N` 取当前用户已采集的岗位数（岗位按用户隔离），`df_i` 取该用户岗位中包含技能 i 的条数。当 `N < 50` 时 IDF 不稳定，退化取 `w_i = 1`，并在报告快照中标记 `idfFallback: true`。

**S_sem（语义分）**

- 简历全部 `resume_block` 与岗位职责句分别取 bge-small-zh 向量；
- 每个岗位要求句取简历块中最高余弦相似度，再对全部要求句取均值；
- 无嵌入模型时降级为 BM25 关键词分，`algo_version` 标记为 `1.0.0-bm25`。

**S_exp（经历分）**

```
S_exp = 0.5·时间重叠度 + 0.3·行业/岗位相似度 + 0.2·职责动词匹配度
```

时间重叠度 = 简历经历与岗位要求年限的覆盖比例（无要求时按 1 计）。

**S_edu（教育分）**

| 情形 | 分 |
| --- | --- |
| 学历达标且专业相关 | 1.0 |
| 学历达标、专业不相关 | 0.7 |
| 学历低于要求一级 | 0.4 |
| 学历低于要求两级及以上 | 0.1 |
| 岗位无学历要求 | 0.8（中性） |

**证据生成规则**

- 每个 `HARD` 技能必产出一条 `match_evidence`（命中或缺失）。
- 每个造成扣分超过 0.05 的因素，必须带 `note` 与 `resume_block_id`（缺失时为空）。
- 报告页展示顺序：先缺失的 `HARD` 技能 → 分数最低的分项 → 其余。

**风险提示规则（可增补）**

- 硬性技能缺失 ≥ 3 项 → "与该岗位的核心要求存在明显差距"
- 工作年限差 ≥ 2 年 → "年限不匹配，建议关注实习/初级岗位"
- 简历项目描述平均长度 < 80 字 → "项目描述过于笼统，建议补充职责与成果"

### 8.5 批量打分（算法服务 `POST /internal/match/batch`）

列表页一次 30–60 条，逐条跑完 8.4 的四维不现实。批量打分固定为两阶段：

```
一批岗位卡片（≤ 50 条）
  → ① 规则过滤（服务端，不进算法服务）
       去重：jd_hash 已存在 → DUPLICATE
       排除词：title/company/jd_summary 命中任一 → EXCLUDED
       硬门槛：城市/薪资/经验/学历不匹配 → MISMATCH
  → ② 粗筛打分（毫秒级）
       score_coarse = 0.7·S_skill(仅卡片标签/摘要) + 0.3·S_edu(卡片学历字段)
  → ③ 取 TopN（N = min(10, 阈值以上数量)）进入精算
       精算复用 8.4，S_sem 用 jd_summary 而非全文；无 JD 全文时经验分按卡片年限估算
  → 返回 [{jdHash, score, stage: COARSE|FINE, hitSkills[], missSkills[], rejectReason}]
```

约束：

- 卡片摘要通常只有一两句，`S_sem` 的置信度低于详情页精算，返回时标记 `stage`，UI 用不同颜色区分"粗筛分"与"精算分"。
- 简历块向量在版本创建时预计算并缓存；同一次批量请求内复用，不重复编码。
- 批量接口整体超时 5 s，超时降级为只返回粗筛结果。
- 结果不落 `match_report`（只有用户点开某个岗位才落报告），避免产生大量无用快照。

### 8.6 可复现要求

每次匹配必须记录：`algo_version`、`weights_json`、岗位 `jd_hash`（或详情页 JD 的哈希）、简历版本号、技能词典版本、嵌入模型名。任一历史报告可凭这些信息复算并得到相同分数。

---

## 9. 接口设计

### 9.1 约定

- 统一前缀 `/api`，返回体：`{ "code": 0, "message": "ok", "data": ... }`，业务失败 `code != 0`，HTTP 状态仍按语义返回。
- 鉴权分两套：
  - **Web 端**：`Authorization: Bearer <token>`（Sa-Token），面向 Vue 前端。
  - **插件端**：`X-Agent-Token: <deviceToken>`，只能访问 `/api/agent/*`、`/api/jobs/ingest`、`/api/match/batch`、`/api/applications/*`，且只能操作 token 绑定用户的资源。
- 分页：`?page=1&size=20`，返回 `{ list, total, page, size }`。
- 时间格式：`yyyy-MM-dd HH:mm:ss`。

### 9.2 Web 端接口（Sa-Token）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/auth/register` | 注册 |
| POST | `/api/auth/login` | 登录，返回 token |
| GET | `/api/me` | 当前用户 + 求职意向 |
| PUT | `/api/me/intention` | 更新求职意向 |
| POST | `/api/resumes` | 创建简历（标题） |
| GET | `/api/resumes` | 我的简历列表 |
| POST | `/api/resumes/{id}/upload` | 上传文件（multipart），返回 `taskId` |
| GET | `/api/tasks/{taskId}` | 查询解析任务状态与进度 |
| GET | `/api/resumes/{id}/versions/latest` | 最新版本（schema + blocks） |
| PUT | `/api/versions/{versionId}/blocks/{blockId}` | 校正单个区块，生成新版本 |
| PUT | `/api/versions/{versionId}/schema` | 整体保存（手工编辑） |
| GET | `/api/resumes/{id}/versions` | 版本列表 |
| POST | `/api/versions/{id}/export` | 导出 PDF，返回下载地址 |
| GET | `/api/agent/config` | 读取筛选配置 |
| PUT | `/api/agent/config` | 保存筛选配置（字段见 `agent_config` 表） |
| POST | `/api/agent/pair-code` | 生成一次性配对码（10 分钟有效），供插件配对 |
| GET | `/api/agent/devices` | 已配对设备列表 |
| DELETE | `/api/agent/devices/{id}` | 解绑设备（同时撤销 token） |
| GET | `/api/jobs` | 已采集岗位列表（keyword、city、minScore、applied） |
| GET | `/api/jobs/{id}` | 岗位详情（含 `job_requirement` 与分数） |
| POST | `/api/jobs/{id}/match` | 单岗位精算，落 `match_report`，返回 `reportId` |
| GET | `/api/reports/{id}` | 报告详情（总分、分项、证据、风险） |
| GET | `/api/reports` | 我的报告列表 |
| GET | `/api/applications` | 投递记录（status、日期范围） |
| POST | `/api/admin/jobs/import` | CSV 批量导入（离线/评测数据入口） |
| GET/POST/PUT | `/api/admin/skills` | 技能词典维护 |
| POST | `/api/admin/skills/reload` | 词典热加载 |

### 9.3 插件端接口（`X-Agent-Token`）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/agent/pair` | 用配对码换设备 token（返回明文一次，服务端只存 hash） |
| GET | `/api/agent/bootstrap` | 一次拉齐：配置 + 简历版本摘要 + 当日剩余投递额度 + 去重哈希集 |
| POST | `/api/jobs/ingest` | 上报一批岗位卡片，返回去重/排除结果与已入库 id |
| POST | `/api/match/batch` | 批量打分（粗筛 + TopN 精算），见 8.5 |
| POST | `/api/applications/report` | 回报投递结果（SENT / SKIPPED / FAILED） |
| POST | `/api/agent/heartbeat` | 心跳，服务端据此更新 `last_seen_at` 与下发开关变更 |

**配对流程**

```http
1) Web：POST /api/agent/pair-code          → { "code": "7K3D-9QX2", "expireIn": 600 }
2) 插件：POST /api/agent/pair { "code": "7K3D-9QX2", "deviceName": "Chrome-Win" }
        → { "deviceToken": "agt_9f2c...", "userId": 12 }
3) 插件：此后所有请求带 X-Agent-Token，token 存 storage.local
```

**采集上报**

```http
POST /api/jobs/ingest
X-Agent-Token: agt_9f2c...
{
  "batchId": "b-20261028-01",
  "jobs": [
    {
      "title": "Java 后端开发工程师",
      "company": "××科技",
      "city": "杭州",
      "salary": "15-25K",
      "exp": "3-5年",
      "degree": "本科",
      "tags": ["Java", "Spring Boot", "MySQL"],
      "jdSummary": "负责交易链路后端服务…",
      "jobUrl": "https://www.zhipin.com/job_detail/xxxx.html",
      "jdHash": "a1b2c3..."
    }
  ]
}

→ 200
{
  "code": 0,
  "data": {
    "accepted": [ { "jdHash": "a1b2c3...", "jobId": 501, "dedup": false } ],
    "rejected": [ { "jdHash": "d4e5f6...", "reason": "EXCLUDED", "word": "外包" } ]
  }
}
```

**批量打分**

```http
POST /api/match/batch
X-Agent-Token: agt_9f2c...
{ "versionId": 31, "jobIds": [501, 502, 503] }

→ 200
{
  "code": 0,
  "data": [
    { "jobId": 501, "score": 0.78, "stage": "FINE",
      "hitSkills": ["Java", "Spring Boot"], "missSkills": ["Kafka"], "rejectReason": null },
    { "jobId": 502, "score": 0.41, "stage": "COARSE",
      "hitSkills": ["Java"], "missSkills": ["Go"], "rejectReason": null }
  ]
}
```

**投递回报**

```http
POST /api/applications/report
X-Agent-Token: agt_9f2c...
{
  "items": [
    { "jobId": 501, "applyLevel": "L2", "status": "SENT", "appliedAt": "2026-10-28 10:32:11" },
    { "jobId": 503, "applyLevel": "L3", "status": "FAILED", "failReason": "CAPTCHA" }
  ]
}

→ 200 { "code": 0, "data": { "recorded": 2, "remainingQuota": 27 } }
```

### 9.4 Web 端请求示例

```http
POST /api/resumes/12/upload
Content-Type: multipart/form-data

file=@resume.pdf

→ 200 { "code": 0, "data": { "taskId": 88 } }
```

```http
POST /api/jobs/5/match
{ "versionId": 31 }

→ 200 { "code": 0, "data": { "reportId": 204 } }
```

```json
// GET /api/reports/204 精简示例
{
  "code": 0,
  "data": {
    "totalScore": 0.72,
    "subScores": { "skill": 0.68, "sem": 0.81, "exp": 0.75, "edu": 0.70 },
    "weights": { "skill": 0.4, "sem": 0.25, "exp": 0.2, "edu": 0.15 },
    "algoVersion": "1.0.0",
    "skills": {
      "hit": [
        { "skill": "Java", "level": "PROFICIENT", "evidenceBlockId": 412 },
        { "skill": "Spring Boot", "level": "PROFICIENT", "evidenceBlockId": 418 }
      ],
      "missed": [
        { "skill": "Kafka", "reqType": "HARD", "jdSentence": "熟悉 Kafka 等消息中间件…" }
      ],
      "partial": [
        { "skill": "Spring Cloud", "note": "仅命中下位技能 Spring Boot" }
      ]
    },
    "risks": [
      "硬性技能缺失 2 项：Kafka、Kubernetes",
      "项目经历平均描述长度 62 字，偏笼统"
    ]
  }
}
```

### 9.5 算法服务内部接口

| 方法 | 路径 | 入参 | 出参 |
| --- | --- | --- | --- |
| GET | `/health` | - | `{status, modelLoaded}` |
| POST | `/internal/parse` | `{fileKey, docType}` | `{schema, blocks[], confidence}` |
| POST | `/internal/jd-parse` | `{jdText}` | `{parsed, requirements[]}` |
| POST | `/internal/match` | `{resumeSchema, blocks, jobParsed, jobRequirements, options}` | `{total, sSkill, sSem, sExp, sEdu, evidences[], risks[]}` |
| POST | `/internal/match/batch` | `{resumeSchema, blocks, jobs[{jobId, card, jdSummary?}], weights, topN}` | `[{jobId, score, stage, sSkill, sSem, sExp, sEdu, hitSkills[], missSkills[]}]` |
| POST | `/internal/embed` | `{texts[]}` | `{vectors[][], model}` |

算法服务不鉴权，但只监听内网端口，由业务服务访问。

### 9.6 错误码

| code | 含义 |
| --- | --- |
| 0 | 成功 |
| 1001 | 参数校验失败 |
| 1002 | 未登录 / token 失效 |
| 1003 | 无权限 |
| 2001 | 文件格式不支持 |
| 2002 | 文件超过大小限制 |
| 2003 | 解析失败（可重试） |
| 2004 | 加密 PDF / 扫描件无法解析 |
| 3001 | 岗位不存在或已下线 |
| 3002 | 岗位不属于当前用户 |
| 4001 | 算法服务不可用 |
| 4002 | 批量打分超时（已降级为粗筛结果） |
| 6001 | 配对码无效或已过期 |
| 6002 | 设备 token 无效或已撤销 |
| 6003 | 当日投递额度已用尽 |
| 6004 | 当前时段不在允许投递窗口内 |
| 5000 | 服务器内部错误 |

---

## 10. 关键流程时序

**解析**

```
前端 → 业务服务: 上传文件
业务服务 → MinIO: 存原件（key = hash）
业务服务 → MySQL: 插入 parse_task(PENDING)，同简历同 hash 直接复用
业务服务 → 线程池: 提交任务
线程池 → 算法服务: POST /internal/parse
算法服务 → 线程池: schema + blocks
线程池 → MySQL: 写 resume_version / resume_block，任务置 SUCCESS
前端(轮询 /api/tasks/{id}) → 获取 versionId → 展示校正页
用户校正 → 业务服务: 生成新版本（source=CORRECTION）
```

**采集 + 批量打分**

```
Web  → 业务服务: PUT /api/agent/config（保存筛选）
插件 → 业务服务: GET /api/agent/bootstrap（配置 + 额度 + 已有哈希集）
插件 → Boss  : 打开列表页（URL 带城市/经验/学历参数）
插件        : 滚动解析卡片，凑满 batchSize（默认 20）
插件 → 业务服务: POST /api/jobs/ingest
业务服务     : 计算 jd_hash → 查重 → 排除词过滤 → 硬门槛过滤
业务服务 → 算法服务: POST /internal/match/batch（TopN 精算）
业务服务 → 插件: [{jobId, score, stage, hitSkills, missSkills}]
插件        : 注入分数角标；低于阈值折叠，达标置顶
```

**投递（L2 / L3）**

```
插件: 取队列中 score ≥ 阈值 且 未投递 的岗位
插件 → Boss: 打开详情页 → 校验登录态/无验证码
插件: 按模板填充打招呼语
  ├─ L2: 等待用户点击"发送"（超时 60 s 则跳过）
  └─ L3: 随机等待 40–120 s 后点击发送
插件 → 业务服务: POST /api/applications/report（SENT / SKIPPED / FAILED）
业务服务: 写 application，更新 Redis 当日额度
熔断: 检测到验证码/风控页/连续 2 次失败 → 立即暂停队列 + 通知
```

失败策略：算法服务超时（> 15 s）返回 4001，任务可重试；重试 3 次仍失败则置 FAILED 并提示。批量打分超时 5 s 返回 4002，插件按粗筛结果继续，不阻塞队列。

---

## 11. 前端页面

| 路由 | 页面 | 要点 |
| --- | --- | --- |
| `/login`、`/register` | 账号 | - |
| `/` | 工作台 | 最近简历、今日投递数、插件连接状态、快捷入口 |
| `/resumes` | 简历列表 | 上传入口、版本数 |
| `/resumes/:id/parse` | 解析结果校正 | 左原稿（PDF 预览）右结构化表单；低置信红框；保存生成新版本 |
| `/resumes/:id/edit` | 分区块编辑 | 教育/工作/项目/技能四块，实时预览 |
| `/agent` | **岗位筛选配置** | 城市/关键词/薪资/经验/学历 + 排除词（Tag 输入）+ 分数阈值滑杆 + 投递等级与上限 + 打招呼语模板 + 配对码与设备管理 |
| `/jobs` | 已采集岗位 | 按分数排序、筛选、状态（待投/已投/跳过）、批量操作 |
| `/jobs/:id` | 岗位详情 | 卡片信息 + JD 全文（点开时抓取）+ 要求分组（硬性/加分）+ 分数与证据 |
| `/reports/:id` | 诊断报告 | 总分环形图 + 分项条形图 + 技能命中/缺失表 + 风险列表 + 证据抽屉 |
| `/applications` | 投递记录 | 时间线、状态、失败原因、按日统计 |
| `/admin/skills` | 后台 | 技能词典维护、评测集管理 |

插件侧交互（popup）：连接状态、当日额度、队列进度、暂停/继续、跳转筛选配置页。

交互硬要求：核心流程 ≤ 5 步；报告页所有结论都有文字说明，不依赖颜色单独传达信息。

---

## 12. 工程结构

```
bs/
├─ doc/
│  ├─ PROJECT.md                     # 本文档
│  └─ 开题报告_...docx                # 历史材料，仅存档
├─ backend/                          # Spring Boot
│  ├─ pom.xml
│  └─ src/main/
│     ├─ java/com/jobfit/
│     │  ├─ common/     (Result, 异常, 拦截器, 常量)
│     │  ├─ auth/       (登录、Sa-Token、设备 token 拦截器)
│     │  ├─ resume/     (controller/service/mapper/entity/dto)
│     │  ├─ job/        (采集入库、去重、排除词、CSV 导入)
│     │  ├─ match/      (单岗精算、批量打分编排)
│     │  ├─ agent/      (配置、配对、设备、心跳)
│     │  ├─ apply/      (投递记录、额度控制)
│     │  ├─ task/       (任务表、线程池、轮询)
│     │  ├─ storage/    (MinIO 封装)
│     │  └─ client/     (AlgoClient：调 Python 服务)
│     └─ resources/
│        ├─ application.yml
│        ├─ db/schema.sql
│        └─ db/data.sql
├─ algo/                             # Python FastAPI
│  ├─ requirements.txt
│  ├─ main.py
│  ├─ parser/     (pdf_extractor, docx_extractor, layout, section, fields)
│  ├─ skills/     (normalize, dictionary)
│  ├─ matcher/    (skill_score, semantic, experience, education, batch, evidence)
│  ├─ embedding/  (bge 封装 + numpy 余弦)
│  ├─ resources/  (skill_dict.json, section_keywords.json)
│  └─ tests/
├─ frontend/                         # Vue 3
│  ├─ package.json
│  └─ src/{api,router,stores,views,components,types}
├─ extension/                        # Chrome MV3 插件
│  ├─ package.json
│  ├─ manifest.json
│  ├─ vite.config.ts
│  ├─ selectors.json                 # 页面选择器（可远程覆盖）
│  └─ src/
│     ├─ background/  (queue, limiter, circuit-breaker, api)
│     ├─ content/     (list-parser, detail-parser, badge, apply)
│     ├─ popup/       (状态面板)
│     └─ shared/      (types, storage, hash)
├─ deploy/
│  ├─ docker-compose.yml             # mysql / redis / minio / backend / algo / nginx
│  └─ nginx.conf
└─ data/
   ├─ samples/                       # 样例简历、样例 JD
   └─ eval/                          # 评测集（50 简历 / 50 岗位 / 100 配对）
```

**环境变量（backend）**：`MYSQL_HOST/PORT/DB/USER/PASSWORD`、`REDIS_HOST`、`MINIO_ENDPOINT/ACCESS_KEY/SECRET_KEY/BUCKET`、`ALGO_BASE_URL`、`MATCH_WEIGHTS`、`LLM_ENABLED`、`AGENT_TOKEN_TTL_DAYS`、`APPLY_DAILY_LIMIT_DEFAULT`。

**插件权限（manifest）**：`host_permissions` 只声明 `https://www.zhipin.com/*` 与本系统域名；不申请 `cookies` 权限（读取登录态只通过页面 DOM 判断"是否已登录"），不申请 `webRequest`、`tabs`（用 `chrome.tabs.create` 打开固定 URL 即可）。

---

## 13. 开发里程碑

| 里程碑 | 交付内容 | 完成判定 |
| --- | --- | --- |
| **M0 骨架** | 目录、Docker Compose、MySQL schema、登录与鉴权、前后端联通 | 本地一条命令起服务，能注册登录并访问受保护接口 |
| **M1 解析** | 上传、任务表 + 轮询、Python 解析服务（PDF/DOCX）、结构化输出、区块与偏移、校正页 | 上传 10 份真实简历，字段可展示、可修改、可生成新版本 |
| **M2 筛选与采集** | `/agent` 配置页、配对与设备管理、MV3 插件骨架、列表页解析、`/jobs/ingest` 去重与排除词 | 插件能按配置打开 Boss 列表并稳定采集 ≥ 30 条真实岗位，重复采集不产生重复行 |
| **M3 打分与报告** | 批量打分（粗筛 + TopN 精算）、单岗精算、证据与风险、报告快照、插件分数角标 | 一页 30 条岗位 5 s 内返回分数；20 组配对可点击证据；同输入复算一致 |
| **M4 投递** | L1 标注、L2 一键确认、L3 限频队列与熔断、`application` 记录与额度 | L2 跑通 20 条真实投递；L3 在小样本下触发限额与熔断且不重试 |
| **M5 收尾** | PDF 导出、评测跑通、README 与部署/安装说明、演示数据 | 冷机器按文档部署成功，插件安装可用，评测脚本产出指标表 |

---

## 14. 验收指标与测试

### 14.1 指标（自行构建评测集）

**数据集口径（统一）**：50 份真实中文简历、50 条真实 JD、100 组人工配对（每份简历配 2 个岗位），人工标注匹配等级 1–5 分与字段真值。评测集通过 CSV 导入，**不使用插件实时采集的数据**（插件拿到的是个性化推荐结果，存在采样偏差）。

| 指标 | 目标 | 测量方式 |
| --- | --- | --- |
| 字段抽取 F1 | ≥ 0.85 | 50 份简历逐字段比对 |
| 匹配一致性 | Spearman ≥ 0.70 | 100 组配对，算法分 vs 人工分 |
| 学历/年限识别准确率 | ≥ 0.90 | 人工核对 |
| 技能归一准确率 | ≥ 0.85 | 抽样 200 条 |
| 单份解析时延 | ≤ 10 s（≤ 3 页） | 20 次取 P95 |
| 单次匹配时延 | ≤ 2 s | 同上 |
| 批量打分时延 | 30 条 ≤ 5 s | 10 次取 P95 |
| 报告复算一致性 | 100% | 同一输入重跑分数完全相同 |

### 14.2 插件侧指标（工程指标，单独统计）

| 指标 | 目标 | 测量方式 |
| --- | --- | --- |
| 卡片解析成功率 | ≥ 95% | 连续 10 页、每页 30 条，统计字段完整率 |
| 采集去重准确率 | 100% | 同一列表重复采集两遍，`job` 行数不增加 |
| 排除词命中准确率 | 100% | 构造 20 条含排除词的样例，全部被拒 |
| 批量上报成功率 | ≥ 99% | 100 批上报，失败自动重试后成功 |
| L2 投递成功率 | ≥ 90% | 20 条真实投递 |
| 熔断时效 | 1 次失败即停 | 注入模拟验证码页，队列立即暂停 |

### 14.3 测试

- 算法服务：pytest 覆盖解析正则、技能归一、打分公式、批量打分、边界（空简历、无要求岗位）。
- 业务服务：关键接口的 MockMvc 测试，鉴权与越权用例必测（**设备 token 越权访问他人岗位必须返回 3002/1003**）。
- 插件：`selectors.json` 用本地离线的 HTML 快照做解析单测，不依赖线上页面；限频器与熔断器纯函数化，可直接单测。
- 联调：M3 完成后用真实数据跑完整链路，记录失败样本作为优化清单。

---

## 15. 风险与降级

| 风险 | 影响 | 应对 |
| --- | --- | --- |
| 中文简历版式复杂，规则解析效果差 | 字段 F1 不达标 | 优先保"教育/工作/项目/技能"四块；提供人工校正闭环；必要时对双栏改用坐标聚类 + 人工兜底 |
| bge 模型体积与下载 | 部署卡住 | 提供 BM25 降级开关（`algo_version` 区分）；模型文件预置到镜像 |
| **Boss 页面结构变更** | 插件解析全挂 | 选择器集中在 `selectors.json`，支持远程下发覆盖；解析失败率超 30% 时降级为"只打开链接 + 手工记录" |
| **高频操作触发风控/封号** | 账号不可用 | 默认 L1；L2 需人工点击；L3 默认关闭并限频；熔断即停不重试；界面明确风险提示 |
| **自动化操作合规争议** | 产品表述风险 | 定位为"个人求职辅助"，不做批量代投、不对第三方提供服务；文档与论文说明边界 |
| 插件采集数据有采样偏差 | 评测结论失真 | 评测只用 CSV 导入的固定评测集，插件数据只做体验验证 |
| Java/Python 双服务联调成本 | 进度受阻 | M0 就把 HTTP 客户端与超时重试打通，算法服务可独立单测 |
| 扫描件/图片简历 | 解析失败 | 明确返回 2004，前端提示改用手工录入，不做 OCR |
| 个人信息合规 | 数据风险 | 原件加密存储、导出加水印、设备 token 可随时撤销、管理员操作留日志 |
| 浏览器关闭导致队列中断 | 投递不连续 | 队列状态落 `storage.local`，重启恢复；不追求后台常驻 |

---

## 16. 名词表

| 术语 | 含义 |
| --- | --- |
| JD | Job Description，岗位描述 |
| 简历块（block） | 简历中一段可独立引用的原文，带页码与字符偏移 |
| 证据（evidence） | 支撑某个分项得分的"JD 原句 + 简历原文"对 |
| 快照（snapshot） | 报告生成时的输入与配置副本，用于复算 |
| HARD / NICE | JD 中的硬性要求 / 加分项 |
| 低置信字段 | 置信度 < 0.85、需要用户确认的字段 |
| 配对码 | Web 端生成的一次性字符串，插件用它换取设备 token |
| 设备 token | 插件持有的长期凭证，服务端只存 hash，可撤销 |
| 粗筛 / 精算 | 批量打分两阶段：卡片字段快速估算 / 完整四维打分 |
| L1 / L2 / L3 | 投递分级：只标注 / 一键确认 / 队列自动 |
| 熔断 | 检测到验证码、风控页或连续失败时立即暂停队列 |
