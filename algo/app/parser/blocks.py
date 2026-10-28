"""生成与原文一一对应的 blocks[]（用于报告定位）。"""

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Sequence

from .layout import Line, normalize_table
from .section import Section

TABLE_HEADER_WORDS = {
    "时间", "学校", "公司", "项目", "专业", "学历", "职位", "岗位", "起止时间", "经历",
}


@dataclass
class TableBlock:
    section_idx: int
    rows: List[List[str]] = field(default_factory=list)
    page_no: int = 0


def _last_content_section(sections: Sequence[Section]) -> int:
    for index in range(len(sections) - 1, -1, -1):
        if sections[index].lines or sections[index].heading_line:
            return index
    return 0


def _guess_section(sections: Sequence[Section], rows: Sequence[Sequence[str]]) -> int:
    """按表头关键词猜测归属，猜不到则归入最近正文区块。"""
    header = " ".join(rows[0]) if rows else ""
    body = " ".join(" ".join(str(cell) for cell in row) for row in rows)
    if any(word in header for word in ("学校", "专业", "学历", "GPA", "绩点")):
        for index, section in enumerate(sections):
            if section.section_type == "EDUCATION":
                return index
    if "项目" in header:
        for index, section in enumerate(sections):
            if section.section_type == "PROJECT":
                return index
    if any(word in header for word in ("公司", "职位", "岗位", "工作")):
        for index, section in enumerate(sections):
            if section.section_type == "WORK":
                return index
    if any(word in body for word in ("大学", "学院")):
        for index, section in enumerate(sections):
            if section.section_type == "EDUCATION":
                return index
    if "有限公司" in body or "公司" in body:
        for index, section in enumerate(sections):
            if section.section_type == "WORK":
                return index
    if "项目" in body:
        for index, section in enumerate(sections):
            if section.section_type == "PROJECT":
                return index
    return _last_content_section(sections)


def assign_tables(sections: Sequence[Section], tables: Sequence[Sequence[Sequence[str]]]) -> List[TableBlock]:
    """表格单独成块，并归入教育/工作/项目等正文区块。"""
    result: List[TableBlock] = []
    for raw in tables:
        rows = normalize_table(raw)
        if not rows:
            continue
        result.append(TableBlock(section_idx=_guess_section(sections, rows), rows=rows))
    return result


def _take_offset(doc_text: str, raw: str, cursor: int) -> tuple:
    if not raw:
        return cursor, cursor, cursor
    position = doc_text.find(raw, cursor)
    if position < 0:
        # 双栏重排后阅读顺序与原文顺序不一致，回退到全文查找
        position = doc_text.find(raw)
    if position < 0:
        position = cursor
    end = position + len(raw)
    return position, end, max(cursor, end)


def _line_block(line: Line, block_type: str, section_idx: int, confidence: float, start: int, end: int) -> dict:
    return {
        "block_type": block_type,
        "section_idx": section_idx,
        "raw_text": line.text,
        "page_no": line.page_no,
        "start_offset": start,
        "end_offset": end,
        "confidence": round(float(confidence), 3),
    }


def build_blocks(
    sections: Sequence[Section],
    table_blocks: Sequence[TableBlock],
    doc_text: str,
) -> List[dict]:
    blocks: List[dict] = []
    cursor = 0
    tables_by_section: Dict[int, List[TableBlock]] = {}
    for table in table_blocks:
        tables_by_section.setdefault(table.section_idx, []).append(table)

    for index, section in enumerate(sections):
        confidence = section.confidence if section.confidence > 0 else 0.5
        if section.heading_line is not None:
            start, end, cursor = _take_offset(doc_text, section.heading_line.text, cursor)
            block = _line_block(section.heading_line, "HEADING", index, confidence, start, end)
            blocks.append(block)
        for line in section.lines:
            if not line.text.strip():
                continue
            start, end, cursor = _take_offset(doc_text, line.text, cursor)
            blocks.append(_line_block(line, "PARAGRAPH", index, confidence, start, end))
        for table in tables_by_section.get(index, []):
            raw_text = "\n".join(
                " | ".join(cell for cell in row if cell) for row in table.rows if any(row)
            )
            blocks.append(
                {
                    "block_type": "TABLE",
                    "section_idx": index,
                    "raw_text": raw_text,
                    "page_no": table.page_no,
                    "start_offset": cursor,
                    "end_offset": cursor,
                    "confidence": 0.95,
                }
            )

    return blocks
