"""S_exp = 0.5·时间重叠度 + 0.3·行业/岗位相似度 + 0.2·职责动词匹配度。"""

import re
from difflib import SequenceMatcher
from typing import Dict, Sequence, Tuple

from ..parser.fields import duty_verbs, total_experience_years


def _ratio(left: str, right: str) -> float:
    if not left or not right:
        return 0.0
    return SequenceMatcher(None, left, right).ratio()


def _bigrams(text: str) -> set:
    lowered = (text or "").lower()
    hans = re.findall(r"[\u4e00-\u9fff]", lowered)
    tokens = {hans[index] + hans[index + 1] for index in range(len(hans) - 1)}
    tokens.update(re.findall(r"[a-zA-Z0-9+#.]+", lowered))
    return tokens


def _jaccard(left: str, right: str) -> float:
    left_set = _bigrams(left)
    right_set = _bigrams(right)
    if not left_set or not right_set:
        return 0.0
    return len(left_set & right_set) / len(left_set | right_set)


def _resume_text(resume_schema: dict) -> str:
    parts = []
    for item in resume_schema.get("work", []) or []:
        parts.append(str(item.get("company", "")))
        parts.append(str(item.get("title", "")))
        parts.append(str(item.get("description", "")))
    for item in resume_schema.get("project", []) or []:
        parts.append(str(item.get("name", "")))
        parts.append(str(item.get("role", "")))
        parts.append(str(item.get("description", "")))
        parts.extend(str(highlight) for highlight in item.get("highlights", []) or [])
        parts.extend(str(skill) for skill in item.get("stack", []) or [])
    return "\n".join(part for part in parts if part)


def _resume_titles(resume_schema: dict) -> list:
    titles = []
    for item in resume_schema.get("work", []) or []:
        if item.get("title"):
            titles.append(str(item["title"]))
    for item in resume_schema.get("project", []) or []:
        if item.get("role"):
            titles.append(str(item["role"]))
    return titles


def score_experience(
    resume_schema: dict,
    job_parsed: dict,
    jd_text: str = "",
) -> Tuple[float, Dict]:
    job = job_parsed or {}
    experience = job.get("experience") or {}
    required_years = int(experience.get("minYears") or 0)
    job_title = str(job.get("title") or "")
    job_text = jd_text or str(job.get("description") or "")

    resume_years = total_experience_years(resume_schema.get("work", []) or [])
    if required_years <= 0:
        time_score = 1.0
    else:
        time_score = min(1.0, resume_years / float(required_years))

    role_similarity = max(
        [_ratio(title, job_title) for title in _resume_titles(resume_schema)] or [0.0]
    )
    industry_similarity = _jaccard(_resume_text(resume_schema), job_text) if job_text.strip() else 0.5
    similarity = max(role_similarity, industry_similarity)

    resume_text = _resume_text(resume_schema)
    jd_verbs = set(duty_verbs(job_text))
    resume_verbs = set(duty_verbs(resume_text))
    verb_score = (len(jd_verbs & resume_verbs) / len(jd_verbs)) if jd_verbs else 0.5

    total = 0.5 * time_score + 0.3 * similarity + 0.2 * verb_score
    detail = {
        "resumeYears": resume_years,
        "requiredYears": required_years,
        "gapYears": round(max(0.0, required_years - resume_years), 1),
        "timeScore": round(time_score, 4),
        "similarity": round(similarity, 4),
        "verbScore": round(verb_score, 4),
    }
    return round(total, 4), detail
