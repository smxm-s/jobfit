"""区块分类：关键词精确匹配，未命中用字符相似度兜底，仍不确定归 OTHER。"""

import json
import re
import threading
from dataclasses import dataclass, field
from difflib import SequenceMatcher
from pathlib import Path
from typing import List, Optional, Sequence, Tuple

from .layout import Line

SECTION_KEYWORDS_FILE = (
    Path(__file__).resolve().parent.parent / "resources" / "section_keywords.json"
)
_CLEAN_RE = re.compile(r"[\s:：\-—_·|/\\()（）\[\]【】<>《》,，.。;；]+")

_lock = threading.Lock()
_cache: Optional[List[dict]] = None


def load_sections() -> List[dict]:
    global _cache
    if _cache is not None:
        return _cache
    with _lock:
        if _cache is None:
            with open(SECTION_KEYWORDS_FILE, "r", encoding="utf-8") as fp:
                _cache = list(json.load(fp).get("sections", []))
    return _cache


def _clean(text: str) -> str:
    return _CLEAN_RE.sub("", (text or "").lower())


def _is_ascii_only(text: str) -> bool:
    return bool(text) and all(ord(char) < 128 for char in text)


def classify_heading(text: str) -> Tuple[str, float, str]:
    """返回 (section_type, confidence, matched_keyword)。"""
    cleaned = _clean(text)
    if not cleaned:
        return "OTHER", 0.0, ""

    for section in load_sections():
        section_type = str(section.get("type", "OTHER"))
        for keyword in section.get("keywords", []):
            key = _clean(str(keyword))
            if not key:
                continue
            if cleaned.startswith(key):
                rest = cleaned[len(key):]
                if not rest or _is_ascii_only(rest):
                    return section_type, 0.95, str(keyword)
            if key in cleaned and len(cleaned) <= len(key) + 4:
                return section_type, 0.95, str(keyword)

    # 相似度兜底（分类模型置信度 ×0.9）
    best_type = "OTHER"
    best_ratio = 0.0
    for section in load_sections():
        section_type = str(section.get("type", "OTHER"))
        for keyword in section.get("keywords", []):
            key = _clean(str(keyword))
            if not key:
                continue
            ratio = SequenceMatcher(None, cleaned, key).ratio()
            if ratio > best_ratio:
                best_ratio = ratio
                best_type = section_type
    if best_ratio >= 0.72:
        return best_type, round(best_ratio * 0.9, 3), ""
    return "OTHER", 0.0, ""


@dataclass
class Section:
    section_type: str
    title: str
    confidence: float
    lines: List[Line] = field(default_factory=list)
    heading_line: Optional[Line] = None


def _detect_heading(line: Line, flag: bool) -> Optional[Tuple[str, float]]:
    section_type, confidence, keyword = classify_heading(line.text)
    if section_type == "OTHER":
        return None
    cleaned = _clean(line.text)
    short_title = bool(keyword) and len(cleaned) <= len(_clean(keyword)) + 2
    structural = line.style.lower().startswith("heading") or line.style.startswith("标题")
    if flag or short_title or structural:
        return section_type, confidence
    return None


def build_sections(lines: Sequence[Line], flags: Sequence[bool]) -> List[Section]:
    """标题行开启新区块，其余行归入当前区块。"""
    sections: List[Section] = [
        Section(section_type="OTHER", title="个人信息", confidence=0.5, lines=[])
    ]
    current = sections[0]
    for index, line in enumerate(lines):
        flag = flags[index] if index < len(flags) else False
        hit = _detect_heading(line, flag)
        if hit is not None:
            current = Section(
                section_type=hit[0],
                title=line.text.strip(),
                confidence=hit[1],
                lines=[],
                heading_line=line,
            )
            sections.append(current)
        else:
            current.lines.append(line)
    return sections
