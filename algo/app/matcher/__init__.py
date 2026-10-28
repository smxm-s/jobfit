"""匹配打分总入口：严格按 8.4 的四维加权口径。"""

from typing import Dict, List, Optional, Sequence

from ..skills.dict import get_dict
from .education import score_education
from .evidence import build_evidences, build_risks
from .experience import score_experience
from .semantic import semantic_score
from .skill_score import hit_skill_names, miss_skill_names, skill_score

ALGO_VERSION = "1.0.0"
DEFAULT_WEIGHTS = {"skill": 0.40, "sem": 0.25, "exp": 0.20, "edu": 0.15}
_WEIGHT_ALIASES = {
    "skill": "skill",
    "sskill": "skill",
    "sem": "sem",
    "ssem": "sem",
    "exp": "exp",
    "sexp": "exp",
    "edu": "edu",
    "sedu": "edu",
}


def normalize_weights(weights: Optional[Dict[str, float]]) -> Dict[str, float]:
    merged = dict(DEFAULT_WEIGHTS)
    if weights:
        for key, value in weights.items():
            target = _WEIGHT_ALIASES.get(str(key).lower())
            if target is None:
                continue
            try:
                merged[target] = float(value)
            except (TypeError, ValueError):
                continue
    total = sum(merged.values())
    if total <= 0:
        return dict(DEFAULT_WEIGHTS)
    return {key: round(value / total, 4) for key, value in merged.items()}


def _requirements(job_requirements, job_parsed: dict) -> List[dict]:
    raw = job_requirements if job_requirements else (job_parsed or {}).get("skills") or []
    result: List[dict] = []
    for item in raw:
        if isinstance(item, str):
            result.append({"skill": item, "reqType": "HARD", "raw": item})
        elif isinstance(item, dict):
            name = item.get("skill") or item.get("name") or item.get("raw") or ""
            if not name:
                continue
            result.append(
                {
                    "skill": str(name),
                    "reqType": str(item.get("reqType") or item.get("req_type") or "HARD").upper(),
                    "raw": str(item.get("raw") or name),
                }
            )
    return result


def compute_match(
    resume_schema: Optional[dict] = None,
    blocks: Optional[Sequence[dict]] = None,
    job_parsed: Optional[dict] = None,
    job_requirements: Optional[Sequence[dict]] = None,
    weights: Optional[Dict[str, float]] = None,
    options: Optional[dict] = None,
) -> dict:
    schema = resume_schema or {}
    block_list = list(blocks or [])
    job = job_parsed or {}
    opts = options or {}

    requirements = _requirements(job_requirements, job)
    df_map = opts.get("dfMap") or opts.get("df_map") or {}
    job_total = int(opts.get("jobTotal") or opts.get("job_total") or 0)
    s_skill, skill_hits, idf_fallback = skill_score(
        requirements, schema.get("skills") or [], df_map, job_total
    )

    resume_texts = [
        str(block.get("raw_text") or "")
        for block in block_list
        if str(block.get("raw_text") or "").strip()
    ]
    requirement_texts = opts.get("semanticTexts") or opts.get("semantic_texts") or []
    if not requirement_texts:
        requirement_texts = [
            str(item.get("raw") or item.get("skill") or "") for item in requirements
        ]
    if not requirement_texts:
        requirement_texts = [str(job.get("title") or "")]
    s_sem, model_tag = semantic_score(
        resume_texts,
        requirement_texts,
        use_embedding=bool(opts.get("useEmbedding", True)),
        resume_vectors=opts.get("_resumeVectors"),
    )

    jd_text = opts.get("jdText") or opts.get("jd_text") or job.get("description") or ""
    s_exp, exp_detail = score_experience(schema, job, str(jd_text))
    s_edu, edu_note = score_education(schema, job)

    normalized_weights = normalize_weights(weights)
    total = (
        normalized_weights["skill"] * s_skill
        + normalized_weights["sem"] * s_sem
        + normalized_weights["exp"] * s_exp
        + normalized_weights["edu"] * s_edu
    )

    dimensions = {
        "skill": {"score": s_skill},
        "sem": {"score": s_sem},
        "exp": {"score": s_exp},
        "edu": {"score": s_edu},
    }
    evidences = build_evidences(skill_hits, dimensions, normalized_weights, block_list)
    has_edu_note = any(item.get("dimension") == "edu" for item in evidences)
    if edu_note and not has_edu_note:
        evidences.append(
            {
                "type": "DIMENSION",
                "dimension": "edu",
                "score": round(s_edu, 4),
                "weight": normalized_weights["edu"],
                "resumeBlockId": None,
                "note": edu_note,
            }
        )
    risks = build_risks(skill_hits, schema, job, exp_detail)

    algo_version = ALGO_VERSION + ("-bm25" if model_tag == "bm25" else "")
    return {
        "total": round(total, 4),
        "sSkill": round(s_skill, 4),
        "sSem": round(s_sem, 4),
        "sExp": round(s_exp, 4),
        "sEdu": round(s_edu, 4),
        "evidences": evidences,
        "risks": risks,
        "algoVersion": algo_version,
        "weights": normalized_weights,
        "idfFallback": idf_fallback,
        "dictVersion": get_dict().version,
        "modelName": model_tag,
        "hitSkills": hit_skill_names(skill_hits),
        "missSkills": miss_skill_names(skill_hits),
        "resumeYears": exp_detail.get("resumeYears", 0.0),
        "requiredYears": exp_detail.get("requiredYears", 0),
    }


__all__ = ["ALGO_VERSION", "DEFAULT_WEIGHTS", "compute_match", "normalize_weights"]
