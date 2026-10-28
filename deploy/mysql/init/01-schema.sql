-- JobFit 初始化脚本（MySQL 8.0）
-- 用法：mysql -h127.0.0.1 -P3307 -uroot -p < 01-schema.sql
-- 说明：如果已经手动建过库和账号，可只执行后半段建表语句。

CREATE DATABASE IF NOT EXISTS jobfit
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_0900_ai_ci;

CREATE USER IF NOT EXISTS 'jobfit'@'%' IDENTIFIED BY 'CHANGE_ME_DB_PASSWORD';
GRANT ALL PRIVILEGES ON jobfit.* TO 'jobfit'@'%';
FLUSH PRIVILEGES;

USE jobfit;

-- 用户
CREATE TABLE IF NOT EXISTS sys_user (
  id            BIGINT PRIMARY KEY AUTO_INCREMENT,
  username      VARCHAR(50)  NOT NULL UNIQUE,
  password_hash VARCHAR(100) NOT NULL,
  nickname      VARCHAR(50),
  email         VARCHAR(100),
  role          VARCHAR(20)  NOT NULL DEFAULT 'SEEKER',
  job_intention VARCHAR(200),
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 简历（逻辑主体）
CREATE TABLE IF NOT EXISTS resume (
  id              BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id         BIGINT NOT NULL,
  title           VARCHAR(100) NOT NULL,
  current_version INT NOT NULL DEFAULT 0,
  file_hash       CHAR(64),
  status          VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_resume_user (user_id)
) ENGINE=InnoDB;

-- 版本快照
CREATE TABLE IF NOT EXISTS resume_version (
  id               BIGINT PRIMARY KEY AUTO_INCREMENT,
  resume_id        BIGINT NOT NULL,
  version_no       INT NOT NULL,
  schema_json      JSON NOT NULL,
  source           VARCHAR(20) NOT NULL,
  parse_confidence DECIMAL(4,3),
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_resume_version (resume_id, version_no)
) ENGINE=InnoDB;

-- 段落级冗余（证据定位）
CREATE TABLE IF NOT EXISTS resume_block (
  id           BIGINT PRIMARY KEY AUTO_INCREMENT,
  version_id   BIGINT NOT NULL,
  block_type   VARCHAR(30) NOT NULL,
  section_idx  INT NOT NULL DEFAULT 0,
  raw_text     TEXT NOT NULL,
  page_no      INT,
  start_offset INT,
  end_offset   INT,
  confidence   DECIMAL(4,3),
  corrected    TINYINT NOT NULL DEFAULT 0,
  embedding    BLOB,
  KEY idx_block_version (version_id, block_type)
) ENGINE=InnoDB;

-- 解析任务
CREATE TABLE IF NOT EXISTS parse_task (
  id         BIGINT PRIMARY KEY AUTO_INCREMENT,
  resume_id  BIGINT NOT NULL,
  file_key   VARCHAR(200) NOT NULL,
  file_name  VARCHAR(200),
  status     VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  error_msg  VARCHAR(500),
  attempts   INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_task_status (status, created_at)
) ENGINE=InnoDB;

-- 岗位（插件采集为主）
CREATE TABLE IF NOT EXISTS job (
  id           BIGINT PRIMARY KEY AUTO_INCREMENT,
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
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_job_user_hash (user_id, jd_hash),
  KEY idx_job_user_time (user_id, collected_at)
) ENGINE=InnoDB;

-- 岗位要求（逐条）
CREATE TABLE IF NOT EXISTS job_requirement (
  id       BIGINT PRIMARY KEY AUTO_INCREMENT,
  job_id   BIGINT NOT NULL,
  req_type VARCHAR(10) NOT NULL,
  category VARCHAR(20) NOT NULL,
  raw_text VARCHAR(500) NOT NULL,
  skill_id BIGINT,
  weight   DECIMAL(4,3) NOT NULL DEFAULT 1.000,
  KEY idx_req_job (job_id)
) ENGINE=InnoDB;

-- 技能词典
CREATE TABLE IF NOT EXISTS skill (
  id        BIGINT PRIMARY KEY AUTO_INCREMENT,
  name      VARCHAR(100) NOT NULL UNIQUE,
  category  VARCHAR(50),
  parent_id BIGINT,
  enabled   TINYINT NOT NULL DEFAULT 1
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS skill_alias (
  id       BIGINT PRIMARY KEY AUTO_INCREMENT,
  skill_id BIGINT NOT NULL,
  alias    VARCHAR(100) NOT NULL,
  source   VARCHAR(20) DEFAULT 'DICT',
  UNIQUE KEY uk_alias (alias)
) ENGINE=InnoDB;

-- 简历侧技能
CREATE TABLE IF NOT EXISTS resume_skill (
  id                BIGINT PRIMARY KEY AUTO_INCREMENT,
  version_id        BIGINT NOT NULL,
  skill_id          BIGINT NOT NULL,
  level             VARCHAR(20),
  raw_text          VARCHAR(100),
  evidence_block_id BIGINT,
  KEY idx_rs_version (version_id)
) ENGINE=InnoDB;

-- 插件配置
CREATE TABLE IF NOT EXISTS agent_config (
  id                BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id           BIGINT NOT NULL UNIQUE,
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
  updated_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 插件设备
CREATE TABLE IF NOT EXISTS agent_device (
  id           BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id      BIGINT NOT NULL,
  device_name  VARCHAR(100),
  token_hash   CHAR(64) NOT NULL UNIQUE,
  last_seen_at DATETIME,
  revoked      TINYINT NOT NULL DEFAULT 0,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_device_user (user_id)
) ENGINE=InnoDB;

-- 投递记录
CREATE TABLE IF NOT EXISTS application (
  id          BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id     BIGINT NOT NULL,
  job_id      BIGINT NOT NULL,
  channel     VARCHAR(20) NOT NULL DEFAULT 'EXTENSION',
  apply_level VARCHAR(5),
  status      VARCHAR(20) NOT NULL,
  skip_reason VARCHAR(200),
  fail_reason VARCHAR(200),
  applied_at  DATETIME,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_app_user_job (user_id, job_id),
  KEY idx_app_status (user_id, status, created_at)
) ENGINE=InnoDB;

-- 匹配报告（快照）
CREATE TABLE IF NOT EXISTS match_report (
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
  input_snapshot    JSON NOT NULL,
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_report_job (job_id, created_at),
  KEY idx_report_version (resume_version_id)
) ENGINE=InnoDB;

-- 证据明细
CREATE TABLE IF NOT EXISTS match_evidence (
  id              BIGINT PRIMARY KEY AUTO_INCREMENT,
  report_id       BIGINT NOT NULL,
  dimension       VARCHAR(20) NOT NULL,
  req_id          BIGINT,
  resume_block_id BIGINT,
  hit             TINYINT NOT NULL,
  score           DECIMAL(5,4),
  note            VARCHAR(500),
  KEY idx_ev_report (report_id, dimension)
) ENGINE=InnoDB;
