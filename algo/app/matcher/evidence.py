"""证据与风险提示生成。"""

from typing import Any, Dict, List, Sequence

DIMENSION_LABELS = {
    "skill": "技能覆盖率",
    "sem": "语义匹配度",
    "exp": "经历匹配度",
    "edu": "教育匹配度",
}


def _find_block_id(blocks: Sequence[dict], names: Sequence[str]) -> Any:
    for block in blocks or []:
        text = str(block.get("raw_text") or "")
        lowered = text.lower()
        for name in names:
            if name and str(name).lower() in lowered:
                for key in ("id", "blockId", "block_id"):
                    if block.get(key) is not None:
                        return block[key]
                return None
    return None


def build_evidences(
    skill_hits: Sequence,
    dimensions: Dict[str, dict],
    weights: Dict[str, float],
    blocks: Sequence[dict],
) -> List[dict]:
    hard_hits = [hit for hit in skill_hits if hit.req_type == "HARD"]
    missing = sorted(
        [hit for hit in hard_hits if not hit.hit], key=lambda hit: hit.weight, reverse=True
    )
    matched = [hit for hit in hard_hits if hit.hit]

    evidences: List[dict] = []
    for hit in missing:
        evidences.append(
            {
                "type": "SKILL",
                "skill": hit.name,
                "reqType": hit.req_type,
                "hit": False,
                "score": hit.h,
                "weight": hit.weight,
                "resumeBlockId": _find_block_id(blocks, [hit.name]),
                "note": "简历未体现该硬性技能",
            }
        )

    # 扣分超过 0.05 的分项必须具备 note
    for key, info in sorted(dimensions.items(), key=lambda pair: pair[1]["score"]):
        score = float(info.get("score", 0.0))
        loss = float(weights.get(key, 0.0)) * (1.0 - score)
        if loss <= 0.05:
            continue
        if key == "skill" and missing:
            continue
        label = DIMENSION_LABELS.get(key, key)
        evidences.append(
            {
                "type": "DIMENSION",
                "dimension": key,
                "score": round(score, 4),
                "weight": round(float(weights.get(key, 0.0)), 4),
                "resumeBlockId": None,
                "note": f"{label}偏低，扣分 {loss:.3f}",
            }
        )

    for hit in matched:
        matched_by = hit.matched_by or hit.name
        note = (
            f"命中下位技能：{matched_by}"
            if matched_by and matched_by != hit.name
            else "已命中"
        )
        evidences.append(
            {
                "type": "SKILL",
                "skill": hit.name,
                "reqType": hit.req_type,
                "hit": True,
                "score": hit.h,
                "weight": hit.weight,
                "resumeBlockId": _find_block_id(blocks, [hit.name, matched_by]),
                "note": note,
            }
        )
    return evidences


def build_risks(
    skill_hits: Sequence,
    resume_schema: dict,
    job_parsed: dict,
    experience_detail: Dict,
) -> List[dict]:
    risks: List[dict] = []
    hard_missing = [
        hit for hit in skill_hits if hit.req_type == "HARD" and not hit.hit
    ]
    if len(hard_missing) >= 3:
        risks.append(
            {
                "code": "HARD_SKILL_GAP",
                "level": "HIGH",
                "message": "与该岗位的核心要求存在明显差距",
            }
        )

    gap_years = float(experience_detail.get("gapYears", 0.0) or 0.0)
    if gap_years >= 2:
        risks.append(
            {
                "code": "EXPERIENCE_GAP",
                "level": "MEDIUM",
                "message": "年限不匹配，建议关注实习/初级岗位",
            }
        )

    projects = resume_schema.get("project", []) or []
    descriptions = [str(item.get("description", "") or "") for item in projects]
    if descriptions:
        average = sum(len(text) for text in descriptions) / len(descriptions)
        if average < 80:
            risks.append(
                {
                    "code": "PROJECT_DESCRIPTION_THIN",
                    "level": "LOW",
                    "message": "项目描述过于笼统，建议补充职责与成果",
                }
            )
    return risks
