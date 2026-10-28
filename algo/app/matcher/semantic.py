"""S_sem：优先 bge 向量余弦，不可用时降级为纯 Python BM25。"""

import hashlib
import logging
import math
import os
import re
import threading
from collections import Counter
from typing import List, Optional, Sequence, Tuple

import numpy as np

LOG = logging.getLogger("jobfit.algo.semantic")

HAN_RE = re.compile(r"[\u4e00-\u9fff]")
WORD_RE = re.compile(r"[a-zA-Z0-9+#.]+")
HASH_DIM = 256


def tokenize(text: str) -> List[str]:
    """中文按单字 + 二元组，英文/数字按词，适配 BM25 与哈希向量。"""
    lowered = (text or "").lower()
    tokens: List[str] = WORD_RE.findall(lowered)
    hans = HAN_RE.findall(lowered)
    tokens.extend(hans)
    tokens.extend(hans[index] + hans[index + 1] for index in range(len(hans) - 1))
    return tokens


class BM25:
    def __init__(self, documents: Sequence[str], k1: float = 1.5, b: float = 0.75) -> None:
        self.k1 = k1
        self.b = b
        self.tokens = [tokenize(doc) for doc in documents]
        self.lengths = [len(item) for item in self.tokens]
        self.count = len(self.tokens)
        self.avg_len = (sum(self.lengths) / self.count) if self.count else 1.0
        document_freq: Counter = Counter()
        self.term_freq: List[Counter] = []
        for tokens in self.tokens:
            counter = Counter(tokens)
            self.term_freq.append(counter)
            document_freq.update(counter.keys())
        self.idf = {
            term: math.log(1 + (self.count - df + 0.5) / (df + 0.5))
            for term, df in document_freq.items()
        }

    def score(self, query: str, index: int) -> float:
        if index < 0 or index >= self.count:
            return 0.0
        counter = self.term_freq[index]
        length = self.lengths[index] or 1
        total = 0.0
        for token in tokenize(query):
            if token not in counter:
                continue
            freq = counter[token]
            denominator = freq + self.k1 * (1 - self.b + self.b * length / (self.avg_len or 1.0))
            total += self.idf.get(token, 0.0) * freq * (self.k1 + 1) / (denominator or 1.0)
        return total

    def max_score(self, query: str) -> float:
        if not self.count:
            return 0.0
        return max(self.score(query, index) for index in range(self.count))


def _normalize_bm25(score: float) -> float:
    """把无上界 BM25 压缩到 0~1，仅作降级路径的可比分数。"""
    if score <= 0:
        return 0.0
    return score / (score + 3.0)


class Embedder:
    """sentence-transformers 懒加载；加载失败后不再重试。"""

    def __init__(self) -> None:
        self.model_name = os.getenv("EMBEDDING_MODEL", "BAAI/bge-small-zh-v1.5")
        self._model = None
        self._loaded = False
        self._failed = False
        self._lock = threading.Lock()

    @property
    def loaded(self) -> bool:
        return self._loaded

    def ensure_loaded(self) -> bool:
        if self._loaded:
            return True
        if self._failed:
            return False
        with self._lock:
            if self._loaded:
                return True
            if self._failed:
                return False
            try:
                from sentence_transformers import SentenceTransformer

                self._model = SentenceTransformer(self.model_name)
                self._loaded = True
                LOG.info("embedding model loaded: %s", self.model_name)
            except Exception as exc:  # 缺依赖/无网络/显存不足都降级
                self._failed = True
                LOG.warning("embedding model unavailable, fallback to BM25: %s", exc)
        return self._loaded

    def encode(self, texts: Sequence[str]) -> Optional[np.ndarray]:
        if not self.ensure_loaded() or self._model is None:
            return None
        try:
            vectors = self._model.encode(
                list(texts),
                batch_size=32,
                normalize_embeddings=True,
                show_progress_bar=False,
            )
        except Exception as exc:
            LOG.warning("embedding encode failed, fallback to BM25: %s", exc)
            return None
        return np.asarray(vectors, dtype=float)


_embedder: Optional[Embedder] = None
_embedder_lock = threading.Lock()


def get_embedder() -> Embedder:
    global _embedder
    if _embedder is None:
        with _embedder_lock:
            if _embedder is None:
                _embedder = Embedder()
    return _embedder


def embedding_loaded() -> bool:
    return get_embedder().loaded


def _embedding_similarity(
    resume_texts: Sequence[str], requirement_texts: Sequence[str], embedder: Embedder
) -> Optional[float]:
    vectors = embedder.encode(list(resume_texts) + list(requirement_texts))
    if vectors is None:
        return None
    resume_matrix = vectors[: len(resume_texts)]
    requirement_matrix = vectors[len(resume_texts):]
    if resume_matrix.size == 0 or requirement_matrix.size == 0:
        return None
    similarities = requirement_matrix @ resume_matrix.T
    best = np.clip(similarities.max(axis=1), 0.0, 1.0)
    return float(best.mean())


def encode_corpus(texts: Sequence[str]) -> Optional[np.ndarray]:
    """批量请求内复用简历块向量，避免每个岗位重复编码。"""
    docs = [str(text or "") for text in texts if str(text or "").strip()]
    if not docs:
        return None
    embedder = get_embedder()
    if not embedder.ensure_loaded():
        return None
    return embedder.encode(docs)


def semantic_score(
    resume_texts: Sequence[str],
    requirement_texts: Sequence[str],
    use_embedding: bool = True,
    resume_vectors: Optional[np.ndarray] = None,
) -> Tuple[float, str]:
    """返回 (S_sem, model_tag)。requirement 句取简历块最高相似度后求均值。"""
    resume_docs = [text for text in resume_texts if str(text or "").strip()]
    requirement_docs = [text for text in requirement_texts if str(text or "").strip()]
    if not resume_docs or not requirement_docs:
        return 0.5, "bm25"

    embedder = get_embedder()
    if use_embedding and embedder.ensure_loaded():
        if resume_vectors is not None and resume_vectors.size:
            requirement_matrix = embedder.encode(requirement_docs)
            if requirement_matrix is not None:
                similarities = requirement_matrix @ resume_vectors.T
                best = np.clip(similarities.max(axis=1), 0.0, 1.0)
                return round(float(best.mean()), 4), embedder.model_name
        score = _embedding_similarity(resume_docs, requirement_docs, embedder)
        if score is not None:
            return round(score, 4), embedder.model_name

    bm25 = BM25(resume_docs)
    scores = [_normalize_bm25(bm25.max_score(query)) for query in requirement_docs]
    return round(sum(scores) / len(scores), 4), "bm25"


def _hash_vector(text: str) -> List[float]:
    vector = [0.0] * HASH_DIM
    for token in tokenize(text):
        digest = hashlib.md5(token.encode("utf-8")).hexdigest()
        bucket = int(digest[:8], 16) % HASH_DIM
        sign = 1.0 if int(digest[8:9], 16) % 2 == 0 else -1.0
        vector[bucket] += sign
    norm = math.sqrt(sum(value * value for value in vector))
    if norm <= 0:
        return vector
    return [round(value / norm, 6) for value in vector]


def embed_texts(texts: Sequence[str]) -> Tuple[List[List[float]], str]:
    """供 /internal/embed 使用；模型不可用时返回确定性哈希向量并显式标记。"""
    if not texts:
        return [], "unavailable"
    embedder = get_embedder()
    vectors = embedder.encode(list(texts)) if embedder.ensure_loaded() else None
    if vectors is not None:
        return vectors.tolist(), embedder.model_name
    return [_hash_vector(text) for text in texts], "hash-char-ngram"
