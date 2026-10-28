"""技能归一：精确 → 别名 → 模糊（编辑距离/相似度）→ UNKNOWN。"""

import difflib
import re
from dataclasses import dataclass
from typing import List

from .dict import get_dict, key_of

TOKEN_SPLIT_RE = re.compile(r"[、,，;；/|()（）\[\]【】<>《》\s]+")
ASCII_RE = re.compile(r"^[\x00-\x7f]+$")


@dataclass
class NormalizedSkill:
    name: str
    raw: str
    method: str  # EXACT / ALIAS / FUZZY / UNKNOWN
    confidence: float
    category: str = ""


def _levenshtein(a: str, b: str, limit: int) -> int:
    """带上限的编辑距离，超过 limit 直接返回 limit+1。"""
    if abs(len(a) - len(b)) > limit:
        return limit + 1
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        row_min = i
        for j, cb in enumerate(b, 1):
            cost = 0 if ca == cb else 1
            val = min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
            cur.append(val)
            row_min = min(row_min, val)
        if row_min > limit:
            return limit + 1
        prev = cur
    return prev[-1]


def normalize(raw: str) -> NormalizedSkill:
    """单片段归一。"""
    text = (raw or "").strip()
    if not text:
        return NormalizedSkill(name="", raw="", method="UNKNOWN", confidence=0.0)
    skill_dict = get_dict()
    k = key_of(text)
    if not k:
        return NormalizedSkill(name=text, raw=text, method="UNKNOWN", confidence=0.0)

    item = skill_dict.by_key.get(k)
    if item is not None:
        return NormalizedSkill(
            name=str(item.get("name")),
            raw=text,
            method="EXACT",
            confidence=0.95,
            category=str(item.get("category", "")),
        )

    alias_name = skill_dict.alias_to_name.get(k)
    if alias_name:
        item = skill_dict.get(alias_name) or {}
        return NormalizedSkill(
            name=alias_name,
            raw=text,
            method="ALIAS",
            confidence=0.95,
            category=str(item.get("category", "")),
        )

    # 模糊：编辑距离 <= 2 或字符相似度 >= 0.88
    best_name = ""
    best_ratio = 0.0
    if len(k) >= 3:
        for candidate_key, candidate_item in skill_dict.by_key.items():
            if abs(len(candidate_key) - len(k)) > 2:
                continue
            ratio = difflib.SequenceMatcher(None, k, candidate_key).ratio()
            if ratio < 0.8:
                continue
            if _levenshtein(k, candidate_key, 2) <= 2 or ratio >= 0.88:
                if ratio > best_ratio:
                    best_ratio = ratio
                    best_name = str(candidate_item.get("name"))
    if best_name:
        item = skill_dict.get(best_name) or {}
        return NormalizedSkill(
            name=best_name,
            raw=text,
            method="FUZZY",
            confidence=round(min(0.9, best_ratio * 0.9), 4),
            category=str(item.get("category", "")),
        )

    return NormalizedSkill(name=text, raw=text, method="UNKNOWN", confidence=0.0)


def _variant_pattern(variant: str) -> re.Pattern:
    escaped = re.escape(variant)
    if ASCII_RE.match(variant):
        return re.compile(r"(?<![a-z0-9])" + escaped + r"(?![a-z0-9])", re.IGNORECASE)
    return re.compile(escaped, re.IGNORECASE)


def normalize_text(text: str) -> List[NormalizedSkill]:
    """从一段文本中抽取技能。先做词典扫描（长词优先），再按分隔符切分兜底。"""
    content = (text or "").strip()
    if not content:
        return []
    skill_dict = get_dict()
    found: dict = {}
    taken: List[tuple] = []

    for variant, standard_name in skill_dict.variants():
        if len(variant) < 2:
            continue
        pattern = _variant_pattern(variant)
        for match in pattern.finditer(content):
            start, end = match.span()
            if any(not (end <= s or start >= e) for s, e in taken):
                continue
            taken.append((start, end))
            item = skill_dict.get(standard_name) or {}
            current = found.get(standard_name)
            candidate = NormalizedSkill(
                name=standard_name,
                raw=match.group(0),
                method="EXACT" if key_of(match.group(0)) == key_of(standard_name) else "ALIAS",
                confidence=0.95,
                category=str(item.get("category", "")),
            )
            if current is None or candidate.confidence > current.confidence:
                found[standard_name] = candidate

    for token in TOKEN_SPLIT_RE.split(content):
        token = token.strip(" .。:：;；!！?？\"'“”‘’")
        if len(token) < 2:
            continue
        norm = normalize(token)
        if norm.method == "UNKNOWN" or not norm.name:
            continue
        current = found.get(norm.name)
        if current is None or norm.confidence > current.confidence:
            found[norm.name] = norm

    return list(found.values())


def is_known(name: str) -> bool:
    return normalize(name).method != "UNKNOWN"
