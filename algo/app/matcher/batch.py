"""批量打分：规则过滤后的两阶段（粗筛 → TopN 精算），5s 预算内降级。"""

import re
import time
from typing import Dict, List, Optional, Sequence

from ..skills.normalize import normalize_text
from . import compute_match
from .education import score_education
from .semantic import encode_corpus
from .skill_score import hit_skill_names, miss_skill_names, skill_score


def _as_dict(value) -> dict:
    if isinstance(value, dict):
        return value
    if hasattr(value, "model_dump"):
        return value.model_dump()
    return {}


def _card_text(card: dict) -> str:
    parts = [
        str(card.get("title") or ""),
        str(card.get("company") or ""),
        str(card.get("jdSummary") or ""),
        str(card.get("jd_summary") or ""),
    ]
    return " ".join(part for part in parts if part)


def _card_skill_names(card: dict) -> List[str]:
    tags = card.get("tags") or card.get("skills") or card.get("skillTags") or []
    if isinstance(tags, (str, dict)):
        tags = [tags]
    names: List[str] = []
    for tag in tags:
        if isinstance(tag, dict):
            text = str(tag.get("name") or tag.get("skill") or tag.get("tag") or "")
        else:
            text = str(tag)
        for skill in normalize_text(text):
            if skill.name not in names:
                names.append(skill.name)
    for skill in normalize_text(_card_text(card)):
        if skill.name not in names:
            names.append(skill.name)
    return names


def _card_degree(card: dict) -> str:
    return str(
        card.get("degreeReq")
        or card.get("degree_req")
        or card.get("degree")
        or ""
    )


def _card_min_years(card: dict) -> int:
    raw = card.get("expReq") or card.get("exp_req") or card.get("experience")
    if isinstance(raw, (int, float)):
        return int(raw)
    numbers = [int(item) for item in re.findall(r"\d+", str(raw or ""))]
    return min(numbers) if numbers else 0


def _coarse_one(
    resume_schema: dict,
    card: dict,
    df_map: Dict[str, int],
    job_total: int,
):
    names = _card_skill_names(card)
    requirements = [{"skill": name, "reqType": "HARD"} for name in names]
    s_skill, hits, _ = skill_score(
        requirements, resume_schema.get("skills") or [], df_map, job_total
    )
    s_edu, _ = score_education(
        resume_schema, {"education": {"degree": _card_degree(card)}}
    )
    score = round(0.7 * s_skill + 0.3 * s_edu, 4)
    return score, s_skill, s_edu, hits


def _fine_one(
    resume_schema: dict,
    blocks: Sequence[dict],
    job: dict,
    weights: Optional[Dict[str, float]],
    base_options: dict,
) -> dict:
    card = job.get("card") or {}
    names = _card_skill_names(card)
    job_parsed = {
        "title": str(card.get("title") or ""),
        "education": {"degree": _card_degree(card), "majorRelated": []},
        "experience": {"minYears": _card_min_years(card)},
        "skills": [{"skill": name, "raw": name, "reqType": "HARD"} for name in names],
    }
    summary = (
        job.get("jdSummary")
        or card.get("jdSummary")
        or card.get("jd_summary")
        or ""
    )
    options = dict(base_options)
    options["jdText"] = summary
    if summary:
        options["semanticTexts"] = [summary]
    return compute_match(
        resume_schema=resume_schema,
        blocks=blocks,
        job_parsed=job_parsed,
        job_requirements=job_parsed["skills"],
        weights=weights,
        options=options,
    )


def run_batch(
    resume_schema: Optional[dict],
    blocks: Optional[Sequence[dict]],
    jobs: Sequence,
    weights: Optional[Dict[str, float]] = None,
    top_n: int = 10,
    options: Optional[dict] = None,
    budget_seconds: float = 5.0,
) -> List[dict]:
    schema = resume_schema or {}
    block_list = list(blocks or [])
    opts = options or {}
    df_map = opts.get("dfMap") or opts.get("df_map") or {}
    job_total = int(opts.get("jobTotal") or opts.get("job_total") or 0)
    threshold = float(opts.get("coarseThreshold") or opts.get("coarse_threshold") or 0.6)
    started = time.monotonic()

    coarse_items: List[dict] = []
    for job in jobs or []:
        job_dict = _as_dict(job)
        card = _as_dict(job_dict.get("card"))
        score, s_skill, s_edu, hits = _coarse_one(schema, card, df_map, job_total)
        coarse_items.append(
            {
                "job": job_dict,
                "jobId": job_dict.get("jobId"),
                "score": score,
                "sSkill": s_skill,
                "sEdu": s_edu,
                "hits": hits,
            }
        )

    coarse_items.sort(key=lambda item: item["score"], reverse=True)
    limit = min(10, max(0, int(top_n or 0)))
    eligible = [item for item in coarse_items if item["score"] >= threshold][:limit]
    eligible_ids = {id(item) for item in eligible}

    deadline = started + max(0.0, budget_seconds)
    resume_texts = [
        str(block.get("raw_text") or "")
        for block in block_list
        if str(block.get("raw_text") or "").strip()
    ]
    base_options = dict(opts)
    resume_vectors = None
    if eligible_ids and opts.get("useEmbedding", True):
        resume_vectors = encode_corpus(resume_texts)
    if resume_vectors is not None:
        base_options["_resumeVectors"] = resume_vectors

    results: List[dict] = []
    for item in coarse_items:
        hits = item["hits"]
        if id(item) in eligible_ids and time.monotonic() < deadline:
            fine = _fine_one(schema, block_list, item["job"], weights, base_options)
            results.append(
                {
                    "jobId": item["jobId"],
                    "score": fine["total"],
                    "stage": "FINE",
                    "sSkill": fine["sSkill"],
                    "sSem": fine["sSem"],
                    "sExp": fine["sExp"],
                    "sEdu": fine["sEdu"],
                    "hitSkills": fine.get("hitSkills", []),
                    "missSkills": fine.get("missSkills", []),
                    "rejectReason": None,
                }
            )
        else:
            results.append(
                {
                    "jobId": item["jobId"],
                    "score": item["score"],
                    "stage": "COARSE",
                    "sSkill": item["sSkill"],
                    "sSem": 0.0,
                    "sExp": 0.0,
                    "sEdu": item["sEdu"],
                    "hitSkills": hit_skill_names(hits),
                    "missSkills": miss_skill_names(hits),
                    "rejectReason": None,
                }
            )

    results.sort(key=lambda item: item["score"], reverse=True)
    return results
