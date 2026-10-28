"""技能词典加载与层级查询（内存缓存，进程内只读）。"""

import json
import re
import threading
from pathlib import Path
from typing import Dict, List, Optional

RESOURCE_DIR = Path(__file__).resolve().parent.parent / "resources"
SKILL_DICT_FILE = RESOURCE_DIR / "skill_dict.json"


def key_of(text: str) -> str:
    """标准化比较键：忽略大小写、空格与常见分隔符。"""
    return re.sub(r"[\s\-_./·,，、:：]+", "", (text or "").lower())


class SkillDict:
    def __init__(self, payload: dict) -> None:
        self.version: str = str(payload.get("version", "1.0.0"))
        self.items: List[dict] = list(payload.get("skills", []))
        self.by_key: Dict[str, dict] = {}
        self.alias_to_name: Dict[str, str] = {}
        self.parent_of: Dict[str, str] = {}
        self.categories: Dict[str, str] = {}
        for item in self.items:
            name = str(item.get("name", "")).strip()
            if not name:
                continue
            k = key_of(name)
            self.by_key[k] = item
            self.parent_of[k] = str(item.get("parent", "") or "")
            self.categories[k] = str(item.get("category", "") or "")
            for alias in item.get("aliases", []) or []:
                ak = key_of(str(alias))
                if ak and ak not in self.alias_to_name:
                    self.alias_to_name[ak] = name

    def variants(self) -> List[tuple]:
        """返回 (原始写法, 标准名)，按写法长度降序，供文本扫描使用。"""
        result: List[tuple] = []
        for item in self.items:
            name = str(item.get("name", "")).strip()
            if not name:
                continue
            result.append((name, name))
            for alias in item.get("aliases", []) or []:
                alias_text = str(alias).strip()
                if alias_text:
                    result.append((alias_text, name))
        result.sort(key=lambda pair: len(pair[0]), reverse=True)
        return result

    def get(self, name: str) -> Optional[dict]:
        return self.by_key.get(key_of(name))

    def is_descendant(self, child: str, ancestor: str) -> bool:
        """判断技能 child 是否位于 ancestor 的下级（用于 h=0.6 的命中口径）。"""
        child_key = key_of(child)
        ancestor_key = key_of(ancestor)
        if not child_key or not ancestor_key or child_key == ancestor_key:
            return False
        current = self.parent_of.get(child_key, "")
        seen = set()
        while current:
            ck = key_of(current)
            if ck in seen:
                break
            seen.add(ck)
            if ck == ancestor_key:
                return True
            current = self.parent_of.get(ck, "")
        return False


_lock = threading.Lock()
_cache: Optional[SkillDict] = None


def load_dict() -> SkillDict:
    global _cache
    if _cache is not None:
        return _cache
    with _lock:
        if _cache is None:
            with open(SKILL_DICT_FILE, "r", encoding="utf-8") as fp:
                _cache = SkillDict(json.load(fp))
    return _cache


def get_dict() -> SkillDict:
    return load_dict()


def reload_dict() -> SkillDict:
    global _cache
    with _lock:
        with open(SKILL_DICT_FILE, "r", encoding="utf-8") as fp:
            _cache = SkillDict(json.load(fp))
    return _cache
