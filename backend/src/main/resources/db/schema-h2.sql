-- JobFit 开发环境建表脚本（H2，MODE=MySQL）
-- 字段与 deploy/mysql/init/01-schema.sql 保持一致，仅做类型适配：
-- MySQL 的 JSON 在 H2 中用 TEXT；去掉 ON UPDATE CURRENT_TIMESTAMP（由业务代码维护 updated_at）。

CREATE TABLE IF NOT EXISTS sys_user (
  id            BIGINT AUTO_INCREMENT PRIMARY KEY,
  username      VARCHAR(50)  NOT NULL,
  password_hash VARCHAR(100) NOT NULL,
  nickname      VARCHAR(50),
  email         VARCHAR(100),
  role          VARCHAR(20)  NOT NULL DEFAULT 'SEEKER',
  job_intention VARCHAR(200),
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS uk_sys_user_username ON sys_user(username);

CREATE TABLE IF NOT EXISTS resume (
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id         BIGINT NOT NULL,
  title           VARCHAR(100) NOT NULL,
  current_version INT NOT NULL DEFAULT 0,
  file_hash       CHAR(64),
  status          VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_resume_user ON resume(user_id);

CREATE TABLE IF NOT EXISTS resume_version (
  id               BIGINT AUTO_INCREMENT PRIMARY KEY,
  resume_id        BIGINT NOT NULL,
  version_no       INT NOT NULL,
  schema_json      TEXT NOT NULL,
  source           VARCHAR(20) NOT NULL,
  parse_confidence DECIMAL(4,3),
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS uk_resume_version ON resume_version(resume_id, version_no);

CREATE TABLE IF NOT EXISTS resume_block (
  id           BIGINT AUTO_INCREMENT PRIMARY KEY,
  version_id   BIGINT NOT NULL,
  block_type   VARCHAR(30) NOT NULL,
  section_idx  INT NOT NULL DEFAULT 0,
  raw_text     TEXT NOT NULL,
  page_no      INT,
  start_offset INT,
  end_offset   INT,
  confidence   DECIMAL(4,3),
  corrected    TINYINT NOT NULL DEFAULT 0,
  embedding    BLOB
);
CREATE INDEX IF NOT EXISTS idx_block_version ON resume_block(version_id, block_type);

CREATE TABLE IF NOT EXISTS parse_task (
  id         BIGINT AUTO_INCREMENT PRIMARY KEY,
  resume_id  BIGINT NOT NULL,
  file_key   VARCHAR(200) NOT NULL,
  file_name  VARCHAR(200),
  status     VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  error_msg  VARCHAR(500),
  attempts   INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_task_status ON parse_task(status, created_at);

CREATE TABLE IF NOT EXISTS job (
  id           BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id      BIGINT NOT NULL,
  title        VARCHAR(100) NOT NULL,
  company      VARCHAR(100),
  city         VARCHAR(50),
  salary_range VARCHAR(50),
  exp_req      VARCHAR(50),
  degree_req   VARCHAR(50),
  tags         VARCHAR(500),
  jd_summary   TEXT,
  job_url      VARCHAR(500) NOT NULL,
  source       VARCHAR(20) NOT NULL,
  jd_hash      CHAR(64) NOT NULL,
  status       VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  collected_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS uk_job_user_hash ON job(user_id, jd_hash);
CREATE INDEX IF NOT EXISTS idx_job_user_time ON job(user_id, collected_at);

CREATE TABLE IF NOT EXISTS job_requirement (
  id       BIGINT AUTO_INCREMENT PRIMARY KEY,
  job_id   BIGINT NOT NULL,
  req_type VARCHAR(10) NOT NULL,
  category VARCHAR(20) NOT NULL,
  raw_text VARCHAR(500) NOT NULL,
  skill_id BIGINT,
  weight   DECIMAL(4,3) NOT NULL DEFAULT 1.000
);
CREATE INDEX IF NOT EXISTS idx_req_job ON job_requirement(job_id);

CREATE TABLE IF NOT EXISTS skill (
  id        BIGINT AUTO_INCREMENT PRIMARY KEY,
  name      VARCHAR(100) NOT NULL,
  category  VARCHAR(50),
  parent_id BIGINT,
  enabled   TINYINT NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX IF NOT EXISTS uk_skill_name ON skill(name);

CREATE TABLE IF NOT EXISTS skill_alias (
  id       BIGINT AUTO_INCREMENT PRIMARY KEY,
  skill_id BIGINT NOT NULL,
  alias    VARCHAR(100) NOT NULL,
  source   VARCHAR(20) DEFAULT 'DICT'
);
CREATE UNIQUE INDEX IF NOT EXISTS uk_alias ON skill_alias(alias);

CREATE TABLE IF NOT EXISTS resume_skill (
  id                BIGINT AUTO_INCREMENT PRIMARY KEY,
  version_id        BIGINT NOT NULL,
  skill_id          BIGINT NOT NULL,
  level             VARCHAR(20),
  raw_text          VARCHAR(100),
  evidence_block_id BIGINT
);
CREATE INDEX IF NOT EXISTS idx_rs_version ON resume_skill(version_id);

CREATE TABLE IF NOT EXISTS agent_config (
  id                BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id           BIGINT NOT NULL,
  cities            VARCHAR(200),
  keyword           VARCHAR(200),
  salary_min        INT,
  salary_max        INT,
  exp_codes         VARCHAR(100),
  degree_codes      VARCHAR(100),
  exclude_words     VARCHAR(1000),
  score_threshold   DECIMAL(4,3) NOT NULL DEFAULT 0.700,
  apply_level       VARCHAR(5) NOT NULL DEFAULT 'L1',
  daily_limit       INT NOT NULL DEFAULT 30,
  batch_size        INT NOT NULL DEFAULT 20,
  active_hours      VARCHAR(20) DEFAULT '09:00-21:00',
  resume_version_id BIGINT,
  greeting_template VARCHAR(500),
  updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS uk_agent_config_user ON agent_config(user_id);

CREATE TABLE IF NOT EXISTS agent_device (
  id           BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id      BIGINT NOT NULL,
  device_name  VARCHAR(100),
  token_hash   CHAR(64) NOT NULL,
  last_seen_at DATETIME,
  revoked      TINYINT NOT NULL DEFAULT 0,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS uk_device_token ON agent_device(token_hash);
CREATE INDEX IF NOT EXISTS idx_device_user ON agent_device(user_id);

CREATE TABLE IF NOT EXISTS application (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id     BIGINT NOT NULL,
  job_id      BIGINT NOT NULL,
  channel     VARCHAR(20) NOT NULL DEFAULT 'EXTENSION',
  apply_level VARCHAR(5),
  status      VARCHAR(20) NOT NULL,
  skip_reason VARCHAR(200),
  fail_reason VARCHAR(200),
  applied_at  DATETIME,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS uk_app_user_job ON application(user_id, job_id);
CREATE INDEX IF NOT EXISTS idx_app_status ON application(user_id, status, created_at);

CREATE TABLE IF NOT EXISTS match_report (
  id                BIGINT AUTO_INCREMENT PRIMARY KEY,
  resume_version_id BIGINT NOT NULL,
  job_id            BIGINT NOT NULL,
  total_score       DECIMAL(5,4) NOT NULL,
  s_skill           DECIMAL(5,4),
  s_sem             DECIMAL(5,4),
  s_exp             DECIMAL(5,4),
  s_edu             DECIMAL(5,4),
  weights_json      TEXT NOT NULL,
  algo_version      VARCHAR(30) NOT NULL,
  input_snapshot    TEXT NOT NULL,
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_report_job ON match_report(job_id, created_at);
CREATE INDEX IF NOT EXISTS idx_report_version ON match_report(resume_version_id);

CREATE TABLE IF NOT EXISTS match_evidence (
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  report_id       BIGINT NOT NULL,
  dimension       VARCHAR(20) NOT NULL,
  req_id          BIGINT,
  resume_block_id BIGINT,
  hit             TINYINT NOT NULL,
  score           DECIMAL(5,4),
  note            VARCHAR(500)
);
CREATE INDEX IF NOT EXISTS idx_ev_report ON match_evidence(report_id, dimension);
