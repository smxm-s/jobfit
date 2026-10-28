"""S_skill：技能加权覆盖率（8.4 口径）。"""

import math
from dataclasses import dataclass
from typing import Dict, List, Optional, Sequence, Tuple

from ..skills.dict import get_dict
from ..skills.normalize import normalize

LEVEL_WEIGHT = {"BASIC": 0.85, "PROFICIENT": 1.0, "EXPERT": 1.0}
_LEVEL_RANK = {"": 0, "BASIC": 1, "PROFICIENT": 2, "EXPERT": 3}


@dataclass
class SkillHit:
    name: str
    req_type: str
    weight: float
    h: float
    matched_by: str = ""

    @property
    def hit(self) -> bool:
        return self.h > 0


def _requirement(item) -> Tuple[str, str]:
    if isinstance(item, str):
        return item, "HARD"
    name = str(item.get("skill") or item.get("name") or item.get("raw") or "")
    req_type = str(item.get("reqType") or item.get("req_type") or "HARD").upper()
    if req_type not in ("HARD", "NICE"):
        req_type = "HARD"
    return name, req_type


def _resume_skill_map(resume_skills: Sequence) -> Dict[str, str]:
    result: Dict[str, str] = {}
    for item in resume_skills or []:
        if isinstance(item, str):
            name = item
            level = ""
        else:
            name = str(item.get("name") or item.get("skill") or "")
            level = str(item.get("level") or "").upper()
        norm = normalize(name)
        if norm.method == "UNKNOWN" or not norm.name:
            continue
        previous = result.get(norm.name)
        if previous is None or _LEVEL_RANK.get(level, 0) > _LEVEL_RANK.get(previous, 0):
            result[norm.name] = level
    return result


def skill_score(
    requirements: Sequence,
    resume_skills: Sequence,
    df_map: Optional[Dict[str, int]] = None,
    job_total: int = 0,
) -> Tuple[float, List[SkillHit], bool]:
    """返回 (S_skill, 逐条命明细, idfFallback)。"""
    if not requirements:
        return 1.0, [], True

    idf_fallback = job_total < 50 or not df_map
    resume_map = _resume_skill_map(resume_skills)
    skill_dict = get_dict()

    total_weight = 0.0
    weighted_hit = 0.0
    hits: List[SkillHit] = []

    for item in requirements:
        raw_name, req_type = _requirement(item)
        norm = normalize(raw_name)
        if norm.method == "UNKNOWN" or not norm.name:
            # 未识别技能不参与分母，但保留一条缺失明细，满足 HARD 必出证据
            hits.append(SkillHit(name=raw_name, req_type=req_type, weight=0.0, h=0.0))
            continue

        if idf_fallback or not df_map:
            weight = 1.0
        else:
            df = int(df_map.get(norm.name, df_map.get(raw_name, 0)) or 0)
            weight = math.log((job_total + 1) / (df + 1)) + 1
        if req_type == "HARD":
            weight *= 1.5

        best_h = 0.0
        matched_by = ""
        if norm.name in resume_map:
            best_h = LEVEL_WEIGHT.get(resume_map[norm.name], 1.0)
            matched_by = norm.name
        else:
            for resume_name, level in resume_map.items():
                if skill_dict.is_descendant(resume_name, norm.name):
                    candidate = 0.6 * LEVEL_WEIGHT.get(level, 1.0)
                    if candidate > best_h:
                        best_h = candidate
                        matched_by = resume_name

        total_weight += weight
        weighted_hit += weight * best_h
        hits.append(
            SkillHit(
                name=norm.name,
                req_type=req_type,
                weight=round(weight, 4),
                h=round(best_h, 4),
                matched_by=matched_by,
            )
        )

    if total_weight <= 0:
        return 1.0, hits, idf_fallback
    return round(weighted_hit / total_weight, 4), hits, idf_fallback


def hit_skill_names(hits: Sequence[SkillHit]) -> List[str]:
    names: List[str] = []
    for hit in hits:
        if hit.hit and hit.name not in names:
            names.append(hit.name)
    return names


def miss_skill_names(hits: Sequence[SkillHit]) -> List[str]:
    names: List[str] = []
    for hit in hits:
        if not hit.hit and hit.name not in names:
            names.append(hit.name)
    return names
