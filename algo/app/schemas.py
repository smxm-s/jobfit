"""请求 / 响应模型，字段名与后端保持一致（camelCase）。"""

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field


class ParseRequest(BaseModel):
    # 本项目后端以 base64 传文件；fileKey 仅作占位，MinIO 拉取由后端完成
    fileKey: Optional[str] = None
    fileBase64: Optional[str] = None
    docType: str = Field(default="PDF", description="PDF / DOCX")


class ParseResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    schema_data: Dict[str, Any] = Field(default_factory=dict, alias="schema")
    blocks: List[Dict[str, Any]] = Field(default_factory=list)
    confidence: float = 0.0


class JdParseRequest(BaseModel):
    jdText: str = ""


class JdParseResponse(BaseModel):
    parsed: Dict[str, Any] = Field(default_factory=dict)
    requirements: List[Dict[str, Any]] = Field(default_factory=list)


class MatchRequest(BaseModel):
    resumeSchema: Dict[str, Any] = Field(default_factory=dict)
    blocks: List[Dict[str, Any]] = Field(default_factory=list)
    jobParsed: Dict[str, Any] = Field(default_factory=dict)
    jobRequirements: List[Dict[str, Any]] = Field(default_factory=list)
    weights: Optional[Dict[str, float]] = None
    options: Dict[str, Any] = Field(default_factory=dict)


class MatchResponse(BaseModel):
    total: float = 0.0
    sSkill: float = 0.0
    sSem: float = 0.0
    sExp: float = 0.0
    sEdu: float = 0.0
    evidences: List[Dict[str, Any]] = Field(default_factory=list)
    risks: List[Dict[str, Any]] = Field(default_factory=list)
    algoVersion: str = ""
    weights: Dict[str, float] = Field(default_factory=dict)


class BatchJob(BaseModel):
    jobId: Any = None
    card: Dict[str, Any] = Field(default_factory=dict)
    jdSummary: Optional[str] = None


class BatchRequest(BaseModel):
    resumeSchema: Dict[str, Any] = Field(default_factory=dict)
    blocks: List[Dict[str, Any]] = Field(default_factory=list)
    jobs: List[BatchJob] = Field(default_factory=list)
    weights: Optional[Dict[str, float]] = None
    topN: int = 10
    options: Dict[str, Any] = Field(default_factory=dict)


class BatchResultItem(BaseModel):
    jobId: Any = None
    score: float = 0.0
    stage: str = "COARSE"
    sSkill: float = 0.0
    sSem: float = 0.0
    sExp: float = 0.0
    sEdu: float = 0.0
    hitSkills: List[str] = Field(default_factory=list)
    missSkills: List[str] = Field(default_factory=list)
    rejectReason: Optional[str] = None


class EmbedRequest(BaseModel):
    texts: List[str] = Field(default_factory=list)


class EmbedResponse(BaseModel):
    vectors: List[List[float]] = Field(default_factory=list)
    model: str = ""


class HealthResponse(BaseModel):
    status: str = "ok"
    modelLoaded: bool = False
