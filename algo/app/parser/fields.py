"""字段抽取：时间区间、联系方式、学校/公司/学历、技能与熟练度。"""

import re
from datetime import date
from typing import Dict, List, Optional, Sequence, Tuple

from ..skills.normalize import NormalizedSkill, normalize_text

# 8.1 规定的时间区间正则
TIME_RANGE_RE = re.compile(
    r"(\d{4})[.\-/年](\d{1,2})[月]?\s*[-—~至]\s*((\d{4})[.\-/年](\d{1,2})[月]?|至今|现在)"
)
SINGLE_DATE_RE = re.compile(r"(\d{4})[.\-/年](\d{1,2})[月]?")
PHONE_RE = re.compile(r"(?<!\d)(1[3-9]\d{9})(?!\d)")
EMAIL_RE = re.compile(r"([\w.+-]+@[\w-]+(?:\.[\w-]+)+)")
SCHOOL_RE = re.compile(r"([\u4e00-\u9fa5A-Za-z（）()·]{2,30}?(?:大学|学院|学校|中学))")
COMPANY_RE = re.compile(
    r"([\u4e00-\u9fa5A-Za-z0-9（）()·]{2,40}?(?:股份有限公司|有限责任公司|有限公司|集团|科技|公司|研究院|事务所|工作室))"
)
MAJOR_RE = re.compile(r"([\u4e00-\u9fa5A-Za-z]{2,12})专业")
MAJOR_LABEL_RE = re.compile(r"(?:专业|主修)[:：\s]*([\u4e00-\u9fa5A-Za-z]{2,15})")
MAJOR_WORDS = [
    "计算机科学与技术", "软件工程", "信息安全", "人工智能", "数据科学与大数据技术",
    "电子信息工程", "通信工程", "自动化", "数学与应用数学", "统计学",
    "信息管理与信息系统", "网络工程", "物联网工程",
]
GPA_RE = re.compile(
    r"(?:GPA|绩点)[:：]?\s*([0-9]{1,3}(?:\.[0-9]{1,2})?(?:\s*/\s*[0-9]{1,3}(?:\.[0-9]{1,2})?)?)",
    re.IGNORECASE,
)
RANK_RE = re.compile(r"(?:排名|名次|位列)[:：]?\s*([^\s，,；;]{1,12})|((?:前|Top)\s*\d{1,3}%?)", re.IGNORECASE)
ROLE_RE = re.compile(
    r"[\u4e00-\u9fa5]{0,6}(?:实习生|工程师|开发|经理|主管|专员|架构师|负责人|分析师|研究员|设计师|测试员|测试|运营)"
)
NAME_RE = re.compile(r"姓名[:：\s]*([\u4e00-\u9fa5·]{2,6})")
CITY_RE = re.compile(
    r"(?:现居|居住地|所在城市|城市|所在地)[:：\s]+([\u4e00-\u9fa5]{2,12})|(?:现居|居住地)[:：]?\s*([\u4e00-\u9fa5]{2,10})"
)
INTENTION_RE = re.compile(r"(?:求职意向|意向岗位|目标岗位|期望职位|应聘职位)[:：\s]*([^\s|，,;；]{2,30})")

DEGREE_PATTERNS = [
    ("博士", re.compile(r"博士")),
    ("硕士", re.compile(r"硕士|研究生")),
    ("本科", re.compile(r"本科|学士")),
    ("专科", re.compile(r"大专|专科|高职")),
]

LEVEL_PATTERNS = [
    ("EXPERT", re.compile(r"精通|深入理解|源码级")),
    ("PROFICIENT", re.compile(r"熟悉|掌握|熟练")),
    ("BASIC", re.compile(r"了解|接触过|初步")),
]

DUTY_VERBS = [
    "负责", "参与", "开发", "设计", "实现", "优化", "重构", "搭建", "部署", "维护",
    "测试", "分析", "调研", "推动", "主导", "编写", "管理", "监控", "排查", "定位",
    "接入", "对接", "迭代", "上线",
]

HIGHLIGHT_RE = re.compile(r"提升|优化|降低|减少|增长|提高|从.{1,20}到|%|毫秒|ms|QPS", re.IGNORECASE)


def clean_line(text: str) -> str:
    content = (text or "").strip()
    content = re.sub(r"^[\s•·▪◦●○■□◆◇\-–—*]+", "", content)
    content = re.sub(r"^\d{1,2}[.、)）]\s*", "", content)
    content = re.sub(r"^[（(]\d{1,2}[)）]\s*", "", content)
    return content.strip()


def parse_period(text: str) -> Tuple[Optional[str], Optional[str]]:
    match = TIME_RANGE_RE.search(text or "")
    if not match:
        return None, None
    start = f"{match.group(1)}-{int(match.group(2)):02d}"
    raw_end = match.group(3)
    if raw_end in ("至今", "现在"):
        end = "至今"
    else:
        end = f"{match.group(4)}-{int(match.group(5)):02d}"
    return start, end


def normalize_date(text: str) -> Optional[str]:
    match = SINGLE_DATE_RE.search(text or "")
    if not match:
        return None
    return f"{match.group(1)}-{int(match.group(2)):02d}"


def _ym_index(value: Optional[str]) -> Optional[int]:
    if not value:
        return None
    match = re.match(r"(\d{4})[-/.](\d{1,2})", str(value))
    if not match:
        return None
    return int(match.group(1)) * 12 + int(match.group(2))


def _today_index() -> int:
    today = date.today()
    return today.year * 12 + today.month


def months_between(start: Optional[str], end: Optional[str]) -> int:
    start_index = _ym_index(start)
    if start_index is None:
        return 0
    if end in ("至今", "现在", None, ""):
        end_index = _today_index()
    else:
        end_index = _ym_index(end)
    if end_index is None:
        return 0
    return max(0, end_index - start_index)


def total_experience_years(work_items: Sequence[dict]) -> float:
    """按月份区间并集计算工作年限，避免多段经历重叠重复计数。"""
    intervals: List[Tuple[int, int]] = []
    for item in work_items:
        start_index = _ym_index(item.get("start"))
        end_raw = item.get("end")
        end_index = _today_index() if end_raw in ("至今", "现在", None, "") else _ym_index(end_raw)
        if start_index is None or end_index is None or end_index <= start_index:
            continue
        intervals.append((start_index, end_index))
    if not intervals:
        return 0.0
    intervals.sort()
    merged: List[List[int]] = [list(intervals[0])]
    for start_index, end_index in intervals[1:]:
        if start_index <= merged[-1][1]:
            merged[-1][1] = max(merged[-1][1], end_index)
        else:
            merged.append([start_index, end_index])
    months = sum(item[1] - item[0] for item in merged)
    return round(months / 12.0, 1)


def extract_phone(text: str) -> str:
    match = PHONE_RE.search(text or "")
    return match.group(1) if match else ""


def extract_email(text: str) -> str:
    match = EMAIL_RE.search(text or "")
    return match.group(1) if match else ""


def extract_degree(text: str) -> str:
    for degree, pattern in DEGREE_PATTERNS:
        if pattern.search(text or ""):
            return degree
    return ""


def extract_major(text: str) -> str:
    content = text or ""
    match = MAJOR_RE.search(content)
    if match:
        return match.group(1)
    match = MAJOR_LABEL_RE.search(content)
    if match:
        return match.group(1)
    for word in MAJOR_WORDS:
        if word in content:
            return word
    return ""


def extract_school(text: str) -> str:
    match = SCHOOL_RE.search(text or "")
    if not match:
        return ""
    return re.sub(r"^(毕业于|就读于|学校[:：])", "", match.group(1)).strip()


def extract_company(text: str) -> str:
    match = COMPANY_RE.search(text or "")
    if not match:
        return ""
    return re.sub(r"^(就职于|任职于|公司[:：])", "", match.group(1)).strip()


def is_school(text: str) -> bool:
    return bool(SCHOOL_RE.search(text or ""))


def is_company(text: str) -> bool:
    return bool(COMPANY_RE.search(text or ""))


def extract_role(text: str) -> str:
    match = ROLE_RE.search(text or "")
    return match.group(0).strip() if match else ""


def extract_gpa(text: str) -> str:
    match = GPA_RE.search(text or "")
    return re.sub(r"\s+", "", match.group(1)) if match else ""


def extract_rank(text: str) -> str:
    match = RANK_RE.search(text or "")
    if not match:
        return ""
    return (match.group(1) or match.group(2) or "").strip()


def extract_level(text: str) -> Optional[str]:
    for level, pattern in LEVEL_PATTERNS:
        if pattern.search(text or ""):
            return level
    return None


def infer_level(project_count: int) -> str:
    return "PROFICIENT" if project_count >= 3 else "BASIC"


def extract_name_from_lines(lines: Sequence[str]) -> Tuple[str, float]:
    for line in list(lines)[:8]:
        content = clean_line(line)
        match = NAME_RE.search(content)
        if match:
            return match.group(1), 0.95
    bad_words = re.compile(
        r"简历|求职|个人|电话|手机|邮箱|意向|年龄|性别|城市|现居|技能|教育|工作|项目|获奖|评价|经历"
    )
    for line in list(lines)[:5]:
        content = clean_line(line)
        if (
            re.fullmatch(r"[\u4e00-\u9fa5·]{2,4}", content)
            and not bad_words.search(content)
        ):
            return content, 0.75
    return "", 0.0


def extract_city(text: str) -> str:
    match = CITY_RE.search(text or "")
    if not match:
        return ""
    return (match.group(1) or match.group(2) or "").strip()


def extract_job_intention(text: str) -> str:
    match = INTENTION_RE.search(text or "")
    return match.group(1).strip() if match else ""


def extract_award(line: str) -> Optional[dict]:
    content = clean_line(line)
    if not content or not re.search(r"奖|荣誉|称号|证书|优秀", content):
        return None
    _, end = parse_period(content)
    award_date = end if end and end != "至今" else normalize_date(content)
    name = TIME_RANGE_RE.sub("", content)
    name = SINGLE_DATE_RE.sub("", name).strip(" -—:：|")
    if not name:
        return None
    return {"name": name[:60], "date": award_date}


def extract_skills(text: str) -> List[NormalizedSkill]:
    return normalize_text(text)


def split_clauses(text: str) -> List[str]:
    return [part.strip() for part in re.split(r"[。\n；;，,]+", text or "") if part.strip()]


def duty_verbs(text: str) -> List[str]:
    return [verb for verb in DUTY_VERBS if verb in (text or "")]


def is_highlight(line: str) -> bool:
    return bool(HIGHLIGHT_RE.search(line or ""))
