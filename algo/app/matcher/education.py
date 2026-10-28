"""S_edu：学历达标情况与专业相关性查表。"""

from typing import List, Optional, Sequence, Tuple

DEGREE_RANK = {"专科": 1, "本科": 2, "硕士": 3, "博士": 4}

MAJOR_KEYWORDS = [
    "计算机", "软件", "信息安全", "人工智能", "数据", "电子", "通信",
    "自动化", "数学", "统计", "信息管理", "网络工程",
]


def _degree_rank(value: str) -> int:
    text = str(value or "")
    for degree, rank in DEGREE_RANK.items():
        if degree in text:
            return rank
    if "研究生" in text:
        return DEGREE_RANK["硕士"]
    if "大专" in text or "高职" in text:
        return DEGREE_RANK["专科"]
    if "学士" in text:
        return DEGREE_RANK["本科"]
    return 0


def _major_related(majors: Sequence[str], related: Sequence[str]) -> bool:
    if not related:
        return True
    major_text = " ".join(str(item) for item in majors)
    if not major_text:
        return False
    related_text = " ".join(str(item) for item in related)
    for keyword in related:
        keyword = str(keyword)
        if keyword and keyword in major_text:
            return True
    # 专业名与要求词同属计算机大类时视为相关
    return any(word in major_text and word in related_text for word in MAJOR_KEYWORDS)


def score_education(resume_schema: dict, job_parsed: dict) -> Tuple[float, str]:
    job = job_parsed or {}
    education = job.get("education") or {}
    required_degree = str(education.get("degree") or job.get("degreeReq") or "")
    required_rank = _degree_rank(required_degree)
    if required_rank == 0:
        return 0.8, ""

    entries: List[dict] = list(resume_schema.get("education", []) or [])
    resume_rank = 0
    majors: List[str] = []
    for entry in entries:
        resume_rank = max(resume_rank, _degree_rank(str(entry.get("degree", ""))))
        if entry.get("major"):
            majors.append(str(entry["major"]))

    gap = required_rank - resume_rank
    if gap >= 2:
        return 0.1, "学历低于岗位要求两级及以上"
    if gap == 1:
        return 0.4, "学历低于岗位要求一级"

    related = _major_related(majors, education.get("majorRelated") or [])
    if related:
        return 1.0, ""
    return 0.7, "学历达标但专业不相关"
