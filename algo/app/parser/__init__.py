"""解析流水线入口：文件 → schema + blocks；以及 JD 解析。"""

import re
from typing import Dict, List, Optional, Sequence, Tuple

from ..skills.normalize import normalize_text
from .blocks import TABLE_HEADER_WORDS, TableBlock, assign_tables, build_blocks
from .extract import ParseBusinessError, extract_document
from .fields import (
    TIME_RANGE_RE,
    clean_line,
    extract_award,
    extract_city,
    extract_company,
    extract_degree,
    extract_gpa,
    extract_job_intention,
    extract_level,
    extract_major,
    extract_name_from_lines,
    extract_phone,
    extract_email,
    extract_rank,
    extract_role,
    extract_school,
    extract_skills,
    infer_level,
    is_company,
    is_highlight,
    is_school,
    parse_period,
    split_clauses,
    total_experience_years,
)
from .layout import Line, detect_column_count, group_lines, heading_flags, order_lines
from .section import Section, build_sections

PARSER_VERSION = "1.0.0"
LOW_CONFIDENCE_THRESHOLD = 0.85
_SOURCE_PRIORITY = {"SKILL_SECTION": 3, "WORK": 2, "PROJECT": 1}
_NICE_RE = re.compile(r"优先|加分|更佳|锦上添花|nice to have", re.IGNORECASE)
_HARD_RE = re.compile(r"必须|要求|至少|需具备|需要")


def _table_texts(rows: Sequence[Sequence[str]]) -> List[str]:
    texts: List[str] = []
    for row in rows:
        cells = [clean_line(cell) for cell in row if str(cell or "").strip()]
        if not cells:
            continue
        joined = " ".join(cells)
        if len(cells) >= 2 and not re.search(r"\d", joined) and any(
            cell in TABLE_HEADER_WORDS for cell in cells
        ):
            continue
        texts.append(joined)
    return texts


def _section_strings(section: Section, tables: Sequence[TableBlock]) -> List[str]:
    texts = [clean_line(line.text) for line in section.lines if line.text.strip()]
    for table in tables:
        texts.extend(_table_texts(table.rows))
    return [text for text in texts if text]


_VERB_PREFIX_RE = re.compile(
    r"^(负责|参与|开发|设计|实现|优化|重构|搭建|部署|维护|测试|分析|调研|推动|主导|"
    r"编写|管理|监控|排查|定位|接入|对接|迭代|上线|使用|基于|通过|完成|主要|协助|独立)"
)


def _headerish(text: str) -> bool:
    """判断是否为条目标题行（公司/学校/岗位/时间/短标题），用于合并分行的标题。"""
    if len(text) > 60 or _VERB_PREFIX_RE.match(text):
        return False
    if TIME_RANGE_RE.search(text) or is_school(text) or is_company(text) or extract_role(text):
        return True
    return len(text) <= 24 and not re.search(r"[。；;，,]", text)


def _merge_header_lines(texts: Sequence[str]) -> List[str]:
    merged: List[str] = []
    for text in texts:
        if (
            merged
            and _headerish(text)
            and _headerish(merged[-1])
            and not TIME_RANGE_RE.search(merged[-1])
        ):
            previous = merged[-1]
            # 两个公司/学校名视为两条独立经历，避免把相邻条目并成一条
            conflict = (is_company(text) and is_company(previous)) or (
                is_school(text) and is_school(previous)
            )
            if not conflict:
                merged[-1] = f"{previous} {text}"
                continue
        merged.append(text)
    return merged


def _group_entries(texts: Sequence[str]) -> List[List[str]]:
    """按“学校/公司/时间区间”切分条目，其余行视为上一条目的描述。"""
    groups: List[List[str]] = []
    current: List[str] = []
    for text in _merge_header_lines(texts):
        starts = bool(TIME_RANGE_RE.search(text)) or is_school(text)
        if not starts and is_company(text) and len(text) <= 60:
            starts = True
        if not starts and not current:
            starts = True
        if starts and current:
            groups.append(current)
            current = [text]
        else:
            current.append(text)
    if current:
        groups.append(current)
    return groups


def _append_low(low: List[str], path: str, confidence: float) -> None:
    if confidence < LOW_CONFIDENCE_THRESHOLD:
        low.append(path)


def _build_education(
    sections: Sequence[Section],
    tables_by_section: Dict[int, List[TableBlock]],
    low: List[str],
) -> List[dict]:
    entries: List[dict] = []
    for index, section in enumerate(sections):
        if section.section_type != "EDUCATION":
            continue
        for group in _group_entries(_section_strings(section, tables_by_section.get(index, []))):
            text = " ".join(group)
            school = extract_school(text)
            major = extract_major(text)
            degree = extract_degree(text)
            start, end = parse_period(text)
            gpa = extract_gpa(text)
            rank = extract_rank(text)
            if not (school or major or degree or start):
                continue
            field_conf: Dict[str, float] = {}
            if school:
                field_conf["school"] = 0.95
            if major:
                field_conf["major"] = 0.95
            if degree:
                field_conf["degree"] = 0.95
            if start:
                field_conf["start"] = 0.95
            if end:
                field_conf["end"] = 0.95
            if gpa:
                field_conf["gpa"] = 0.95
            if rank:
                field_conf["rank"] = 0.95
            position = len(entries)
            for name, value in (
                ("school", school),
                ("major", major),
                ("degree", degree),
                ("start", start),
                ("end", end),
                ("gpa", gpa),
                ("rank", rank),
            ):
                if value:
                    _append_low(low, f"education[{position}].{name}", field_conf.get(name, 0.0))
            entries.append(
                {
                    "school": school,
                    "major": major,
                    "degree": degree,
                    "start": start or "",
                    "end": end or "",
                    "gpa": gpa,
                    "rank": rank,
                    "confidence": round(sum(field_conf.values()) / len(field_conf), 3)
                    if field_conf
                    else 0.5,
                }
            )
    return entries


def _build_work(
    sections: Sequence[Section],
    tables_by_section: Dict[int, List[TableBlock]],
    low: List[str],
) -> List[dict]:
    entries: List[dict] = []
    for index, section in enumerate(sections):
        if section.section_type != "WORK":
            continue
        for group in _group_entries(_section_strings(section, tables_by_section.get(index, []))):
            text = " ".join(group)
            first = group[0]
            company = extract_company(first) or extract_company(text)
            title = extract_role(first) or extract_role(text)
            start, end = parse_period(first)
            if not start:
                start, end = parse_period(text)
            description = "\n".join(group[1:]).strip()
            if not (company or title or start):
                continue
            field_conf: Dict[str, float] = {}
            if company:
                field_conf["company"] = 0.95
            if title:
                field_conf["title"] = 0.95
            if start:
                field_conf["start"] = 0.95
            if end:
                field_conf["end"] = 0.95
            position = len(entries)
            for name, value in (
                ("company", company),
                ("title", title),
                ("start", start),
                ("end", end),
            ):
                if value:
                    _append_low(low, f"work[{position}].{name}", field_conf.get(name, 0.0))
            entries.append(
                {
                    "company": company,
                    "title": title,
                    "start": start or "",
                    "end": end or "",
                    "description": description,
                    "confidence": round(sum(field_conf.values()) / len(field_conf), 3)
                    if field_conf
                    else 0.5,
                }
            )
    return entries


def _project_name(line: str) -> str:
    text = TIME_RANGE_RE.sub("", clean_line(line))
    text = text.strip(" -—|｜·:：")
    if not text:
        return ""
    if re.match(r"^(负责|参与|使用|基于|通过|完成|实现|主要|项目描述|工作内容)", text):
        return ""
    role = extract_role(text)
    if role:
        text = text.replace(role, " ")
    text = re.sub(r"^[\s\-—|｜·:：]+|[\s\-—|｜·:：]+$", "", text)
    return text[:40]


def _build_project(
    sections: Sequence[Section],
    tables_by_section: Dict[int, List[TableBlock]],
    low: List[str],
) -> Tuple[List[dict], List[set]]:
    entries: List[dict] = []
    skill_sets: List[set] = []
    for index, section in enumerate(sections):
        if section.section_type != "PROJECT":
            continue
        for group in _group_entries(_section_strings(section, tables_by_section.get(index, []))):
            text = " ".join(group)
            first = group[0]
            start, end = parse_period(first)
            if not start:
                start, end = parse_period(text)
            name = _project_name(first)
            body = group[1:]
            if not name and len(group) > 1 and not is_highlight(group[1]):
                name = _project_name(group[1])
                body = group[2:]
            name_conf = 0.75 if name else 0.0
            if not name:
                name = clean_line(first)[:40]
                name_conf = 0.7
            role = extract_role(first)
            if not role and group:
                role = extract_role(text)
            description_lines = [clean_line(item) for item in body if clean_line(item)]
            highlights = [item for item in description_lines if is_highlight(item)]
            description = "\n".join(description_lines)
            stack: List[str] = []
            found = extract_skills(text)
            for skill in found:
                if skill.method != "UNKNOWN" and skill.name not in stack:
                    stack.append(skill.name)
            skill_sets.append({skill.name for skill in found if skill.method != "UNKNOWN"})

            field_conf: Dict[str, float] = {}
            if name:
                field_conf["name"] = name_conf
            if role:
                field_conf["role"] = 0.95
            if start:
                field_conf["start"] = 0.95
            if end:
                field_conf["end"] = 0.95
            position = len(entries)
            for field_name, value in (
                ("name", name),
                ("role", role),
                ("start", start),
                ("end", end),
            ):
                if value:
                    _append_low(low, f"project[{position}].{field_name}", field_conf.get(field_name, 0.0))
            entries.append(
                {
                    "name": name,
                    "role": role,
                    "start": start or "",
                    "end": end or "",
                    "stack": stack[:12],
                    "description": description,
                    "highlights": highlights,
                    "confidence": round(sum(field_conf.values()) / len(field_conf), 3)
                    if field_conf
                    else 0.5,
                }
            )
    return entries, skill_sets


def _collect_skills(
    sections: Sequence[Section],
    tables_by_section: Dict[int, List[TableBlock]],
    project_skill_sets: Sequence[set],
) -> List[dict]:
    skill_map: Dict[str, dict] = {}

    def add(name: str, raw: str, level: Optional[str], source: str) -> None:
        item = skill_map.get(name)
        if item is None:
            skill_map[name] = {"name": name, "raw": raw, "level": level, "source": source}
            return
        if _SOURCE_PRIORITY.get(source, 0) > _SOURCE_PRIORITY.get(item["source"], 0):
            item["source"] = source
            item["raw"] = raw
        if level and not item.get("level"):
            item["level"] = level

    for index, section in enumerate(sections):
        texts = _section_strings(section, tables_by_section.get(index, []))
        if section.section_type == "SKILL":
            for text in texts:
                level = extract_level(text)
                for skill in normalize_text(text):
                    if skill.method == "UNKNOWN":
                        continue
                    add(skill.name, skill.raw, level, "SKILL_SECTION")
        elif section.section_type in ("PROJECT", "WORK"):
            source = "PROJECT" if section.section_type == "PROJECT" else "WORK"
            for text in texts:
                for skill in normalize_text(text):
                    if skill.method == "UNKNOWN":
                        continue
                    add(skill.name, skill.raw, None, source)

    occurrence: Dict[str, int] = {}
    for names in project_skill_sets:
        for name in names:
            occurrence[name] = occurrence.get(name, 0) + 1

    result: List[dict] = []
    for item in skill_map.values():
        level = item.get("level") or infer_level(occurrence.get(item["name"], 0))
        result.append(
            {
                "name": item["name"],
                "raw": item["raw"],
                "level": level,
                "source": item["source"],
            }
        )
    result.sort(key=lambda entry: (-_SOURCE_PRIORITY.get(entry["source"], 0), entry["name"]))
    return result


def _build_awards(
    sections: Sequence[Section],
    tables_by_section: Dict[int, List[TableBlock]],
) -> List[dict]:
    awards: List[dict] = []
    seen = set()
    for index, section in enumerate(sections):
        if section.section_type != "AWARD":
            continue
        for text in _section_strings(section, tables_by_section.get(index, [])):
            award = extract_award(text)
            if not award:
                continue
            key = (award["name"], award.get("date") or "")
            if key in seen:
                continue
            seen.add(key)
            awards.append(award)
    return awards


def _build_basic(
    sections: Sequence[Section],
    tables_by_section: Dict[int, List[TableBlock]],
    work_entries: Sequence[dict],
    low: List[str],
) -> dict:
    full_lines: List[str] = []
    for index, section in enumerate(sections):
        full_lines.extend(line.text for line in section.lines)
        for table in tables_by_section.get(index, []):
            full_lines.extend(_table_texts(table.rows))
    full_text = "\n".join(full_lines)

    if sections and sections[0].section_type == "OTHER" and sections[0].lines:
        header_lines = [line.text for line in sections[0].lines]
    else:
        header_lines = full_lines[:8]

    name, name_conf = extract_name_from_lines(header_lines)
    phone = extract_phone(full_text)
    email = extract_email(full_text)
    city = extract_city(full_text)
    intention = extract_job_intention(full_text)

    confidence: Dict[str, float] = {}
    if name:
        confidence["name"] = name_conf
    if phone:
        confidence["phone"] = 0.95
    if email:
        confidence["email"] = 0.99
    if city:
        confidence["city"] = 0.95
    if intention:
        confidence["jobIntention"] = 0.95

    if name:
        _append_low(low, "basic.name", name_conf)
    if city:
        _append_low(low, "basic.city", 0.95)
    if intention:
        _append_low(low, "basic.jobIntention", 0.95)

    return {
        "name": name,
        "phone": phone,
        "email": email,
        "city": city,
        "jobIntention": intention,
        "yearsOfExp": total_experience_years(work_entries),
        "confidence": confidence,
    }


def build_schema(
    sections: Sequence[Section],
    table_blocks: Sequence[TableBlock],
    doc_type: str,
    page_count: int,
) -> Tuple[dict, float]:
    tables_by_section: Dict[int, List[TableBlock]] = {}
    for table in table_blocks:
        tables_by_section.setdefault(table.section_idx, []).append(table)

    low: List[str] = []
    education = _build_education(sections, tables_by_section, low)
    work = _build_work(sections, tables_by_section, low)
    project, project_skill_sets = _build_project(sections, tables_by_section, low)
    skills = _collect_skills(sections, tables_by_section, project_skill_sets)
    awards = _build_awards(sections, tables_by_section)
    basic = _build_basic(sections, tables_by_section, work, low)

    schema = {
        "basic": basic,
        "education": education,
        "work": work,
        "project": project,
        "skills": skills,
        "awards": awards,
        "meta": {
            "parserVersion": PARSER_VERSION,
            "docType": (doc_type or "").upper(),
            "pageCount": page_count,
            "lowConfidenceFields": low,
        },
    }

    confidences: List[float] = list(basic.get("confidence", {}).values())
    for collection in (education, work, project):
        confidences.extend(float(item.get("confidence", 0.0)) for item in collection)
    overall = round(sum(confidences) / len(confidences), 3) if confidences else 0.5
    return schema, overall


def parse_resume(data: bytes, doc_type: str) -> dict:
    document = extract_document(data, doc_type)
    lines: List[Line] = group_lines(document.spans, document.page_width)
    columns = detect_column_count(lines, document.page_width)
    ordered = order_lines(lines, document.page_width, columns)
    flags = heading_flags(ordered)
    sections = build_sections(ordered, flags)
    table_blocks = assign_tables(sections, document.tables)
    blocks = build_blocks(sections, table_blocks, document.text)
    schema, confidence = build_schema(
        sections, table_blocks, document.doc_type, document.page_count
    )
    return {"schema": schema, "blocks": blocks, "confidence": confidence}


def _jd_title(text: str) -> str:
    for raw_line in (text or "").splitlines():
        line = clean_line(raw_line)
        if not line:
            continue
        match = re.search(r"(?:岗位|职位|招聘)[:：]\s*([^\n]{2,30})", line)
        if match:
            return match.group(1).strip()
        if len(line) <= 40:
            return line.split("|")[0].strip()
    return ""


def _jd_min_years(text: str) -> int:
    values: List[int] = []
    for pattern in (
        r"(\d+)\s*年(?:以上|及以上)?(?:工作)?经验",
        r"(?:经验|工作年限)[:：]?\s*(\d+)\s*年",
        r"至少\s*(\d+)\s*年",
    ):
        values.extend(int(item) for item in re.findall(pattern, text or ""))
    return max(values) if values else 0


def _jd_majors(text: str) -> List[str]:
    keywords = [
        "计算机", "软件工程", "信息安全", "人工智能", "数据", "电子",
        "通信", "自动化", "数学", "统计",
    ]
    related: List[str] = []
    for clause in re.split(r"[。\n；;]", text or ""):
        if "专业" not in clause:
            continue
        for keyword in keywords:
            if keyword in clause and keyword not in related:
                related.append(keyword)
    return related


def _classify_requirement(clause: str) -> str:
    if _NICE_RE.search(clause or ""):
        return "NICE"
    if _HARD_RE.search(clause or ""):
        return "HARD"
    # 技能类未命中明确措辞时默认 HARD
    return "HARD"


def parse_jd(jd_text: str) -> dict:
    text = (jd_text or "").strip()
    requirements: List[dict] = []
    seen: Dict[str, dict] = {}
    for clause in split_clauses(text):
        content = clean_line(clause)
        if not content:
            continue
        req_type = _classify_requirement(content)
        for skill in normalize_text(content):
            if skill.method == "UNKNOWN":
                continue
            key = skill.name
            if key in seen:
                existing = seen[key]
                if existing["reqType"] == "NICE" and req_type == "HARD":
                    existing["reqType"] = "HARD"
                    existing["raw"] = content[:150]
                continue
            item = {
                "raw": content[:150],
                "skill": skill.name,
                "reqType": req_type,
                "category": skill.category,
            }
            requirements.append(item)
            seen[key] = item

    parsed = {
        "title": _jd_title(text),
        "education": {"degree": extract_degree(text), "majorRelated": _jd_majors(text)},
        "experience": {"minYears": _jd_min_years(text)},
        "skills": [
            {"raw": item["raw"], "skill": item["skill"], "reqType": item["reqType"]}
            for item in requirements
        ],
    }
    return {"parsed": parsed, "requirements": requirements}


__all__ = [
    "PARSER_VERSION",
    "ParseBusinessError",
    "build_schema",
    "parse_jd",
    "parse_resume",
]
