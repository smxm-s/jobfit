"""版面分块：行聚类、单双栏判定、阅读顺序重排、标题候选、表格还原。"""

import re
import statistics
from dataclasses import dataclass, field
from typing import List, Optional, Sequence

from .extract import Span


@dataclass
class Line:
    text: str
    spans: List[Span] = field(default_factory=list)
    page_no: int = 0
    x0: float = 0.0
    y0: float = 0.0
    x1: float = 0.0
    y1: float = 0.0
    size: float = 0.0
    bold: bool = False
    style: str = ""
    column: int = 0


def _ascii_word_edge(left: str, right: str) -> bool:
    if not left or not right:
        return False
    a, b = left[-1], right[0]
    return a.isascii() and a.isalnum() and b.isascii() and b.isalnum()


def _join_spans(spans: List[Span]) -> str:
    ordered = sorted(spans, key=lambda item: item.bbox[0])
    parts: List[str] = []
    prev: Optional[Span] = None
    for span in ordered:
        content = span.text
        if not content:
            continue
        if prev is not None:
            gap = span.bbox[0] - prev.bbox[2]
            if gap > max(2.0, span.size * 0.4) and _ascii_word_edge(prev.text, content):
                parts.append(" ")
        parts.append(content)
        prev = span
    return "".join(parts).strip()


def _make_line(spans: List[Span]) -> Line:
    ordered = sorted(spans, key=lambda item: item.bbox[0])
    sizes = [span.size for span in ordered if span.size > 0]
    bold_count = sum(1 for span in ordered if span.bold)
    style = next((span.style for span in ordered if span.style), "")
    return Line(
        text=_join_spans(ordered),
        spans=ordered,
        page_no=ordered[0].page_no,
        x0=min(span.bbox[0] for span in ordered),
        y0=min(span.bbox[1] for span in ordered),
        x1=max(span.bbox[2] for span in ordered),
        y1=max(span.bbox[3] for span in ordered),
        size=max(sizes) if sizes else 0.0,
        bold=bold_count * 2 >= len(ordered),
        style=style,
    )


def group_lines(spans: Sequence[Span], page_width: float = 0.0) -> List[Line]:
    """按 y 聚成视觉行；同一行内横向间隙过大则拆成两栏片段。"""
    if not spans:
        return []
    ordered = sorted(spans, key=lambda item: (item.page_no, item.bbox[1], item.bbox[0]))
    clusters: List[List[Span]] = []
    cluster_key = (ordered[0].page_no, ordered[0].bbox[1])
    current: List[Span] = []
    for span in ordered:
        tol = max(2.0, span.size * 0.5)
        same_page = span.page_no == cluster_key[0]
        same_row = abs(span.bbox[1] - cluster_key[1]) <= tol
        if current and same_page and same_row:
            current.append(span)
            continue
        if current:
            clusters.append(current)
        current = [span]
        cluster_key = (span.page_no, span.bbox[1])
    if current:
        clusters.append(current)

    lines: List[Line] = []
    split_gap = page_width * 0.15 if page_width > 0 else 0.0
    for cluster in clusters:
        ordered_cluster = sorted(cluster, key=lambda item: item.bbox[0])
        segments: List[List[Span]] = [[ordered_cluster[0]]]
        for span in ordered_cluster[1:]:
            prev = segments[-1][-1]
            gap = span.bbox[0] - prev.bbox[2]
            if split_gap and gap > split_gap:
                segments.append([span])
            else:
                segments[-1].append(span)
        for segment in segments:
            text = _join_spans(segment)
            if text:
                lines.append(_make_line(segment))
    return lines


def _column_split(lines: Sequence[Line], page_width: float) -> Optional[float]:
    if page_width <= 0:
        return None
    candidates = sorted(
        line.x0 for line in lines if (line.x1 - line.x0) < page_width * 0.8
    )
    if len(candidates) < 4:
        return None
    best_gap = 0.0
    split_at = -1
    for index in range(len(candidates) - 1):
        gap = candidates[index + 1] - candidates[index]
        if gap > best_gap:
            best_gap = gap
            split_at = index
    if split_at < 0 or best_gap <= page_width * 0.15:
        return None
    if split_at + 1 < 2 or len(candidates) - (split_at + 1) < 2:
        return None
    return (candidates[split_at] + candidates[split_at + 1]) / 2


def detect_column_count(lines: Sequence[Line], page_width: float) -> int:
    return 2 if _column_split(lines, page_width) is not None else 1


def order_lines(lines: Sequence[Line], page_width: float, column_count: int) -> List[Line]:
    """栏内 y 升序、栏间按栏序号；跨栏标题置于两栏之前。"""
    if column_count < 2:
        return sorted(lines, key=lambda line: (line.page_no, line.y0, line.x0))

    split_x = _column_split(lines, page_width)
    if split_x is None:
        return sorted(lines, key=lambda line: (line.page_no, line.y0, line.x0))

    for line in lines:
        line.column = 0 if line.x0 < split_x else 1

    result: List[Line] = []
    for page_no in sorted({line.page_no for line in lines}):
        page_lines = [line for line in lines if line.page_no == page_no]
        full_width = [
            line
            for line in page_lines
            if page_width > 0 and (line.x1 - line.x0) >= page_width * 0.6
        ]
        full_ids = {id(line) for line in full_width}
        left = sorted(
            [line for line in page_lines if id(line) not in full_ids and line.column == 0],
            key=lambda line: (line.y0, line.x0),
        )
        right = sorted(
            [line for line in page_lines if id(line) not in full_ids and line.column == 1],
            key=lambda line: (line.y0, line.x0),
        )
        result.extend(sorted(full_width, key=lambda line: line.y0))
        result.extend(left)
        result.extend(right)
    return result


def heading_flags(lines: Sequence[Line]) -> List[bool]:
    """字号 Top3 且加粗，或 DOCX 标题样式，视为标题候选。"""
    if not lines:
        return []
    sizes = [round(line.size, 1) for line in lines if line.size > 0]
    if not sizes:
        return [False] * len(lines)
    body_size = statistics.median(sizes)
    top_sizes = set(sorted(set(sizes), reverse=True)[:3])
    flags: List[bool] = []
    for line in lines:
        style_heading = line.style.lower().startswith("heading") or line.style.startswith("标题")
        by_size = (
            line.size > 0
            and round(line.size, 1) in top_sizes
            and line.size >= body_size * 1.05
            and line.bold
        )
        flags.append(bool(style_heading or by_size))
    return flags


def normalize_table(rows: Sequence[Sequence[str]]) -> List[List[str]]:
    """表格按行列还原，单元格内换行折叠为空格。"""
    result: List[List[str]] = []
    for row in rows:
        cells = [re.sub(r"\s+", " ", str(cell or "")).strip() for cell in row]
        if any(cells):
            result.append(cells)
    return result


def table_to_text(rows: Sequence[Sequence[str]]) -> str:
    return "\n".join(
        " | ".join(cell for cell in row if cell) for row in rows if any(row)
    )
