"""JobFit 算法服务（FastAPI）。无状态、不连库、日志输出到 stdout。"""

import base64
import binascii
import logging
import sys
from typing import List

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from .matcher import compute_match
from .matcher.batch import run_batch
from .matcher.semantic import embed_texts, embedding_loaded
from .parser import ParseBusinessError, parse_jd, parse_resume
from .schemas import (
    BatchRequest,
    EmbedRequest,
    JdParseRequest,
    MatchRequest,
    ParseRequest,
)

logging.basicConfig(
    level=logging.INFO,
    stream=sys.stdout,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
    force=True,
)
LOG = logging.getLogger("jobfit.algo")

app = FastAPI(title="JobFit Algorithm Service", version="1.0.0")


def _decode_base64(value: str) -> bytes:
    text = (value or "").strip()
    if not text:
        raise ParseBusinessError(
            "E_MISSING_FILE",
            "fileBase64 不能为空；fileKey 由后端读取后转 base64 再传入",
            422,
        )
    if text.lower().startswith("data:") and "," in text:
        text = text.split(",", 1)[1]
    text = text.replace("\n", "").replace("\r", "").strip()
    text += "=" * ((-len(text)) % 4)
    try:
        data = base64.b64decode(text, validate=False)
    except (binascii.Error, ValueError) as exc:
        raise ParseBusinessError("E_INVALID_BASE64", "文件 base64 解码失败", 422) from exc
    if not data:
        raise ParseBusinessError("E_EMPTY_FILE", "文件内容为空", 422)
    return data


@app.exception_handler(ParseBusinessError)
async def handle_business_error(request: Request, exc: ParseBusinessError) -> JSONResponse:
    LOG.warning("business error %s: %s", exc.code, exc.message)
    return JSONResponse(
        status_code=exc.http_status,
        content={"code": exc.code, "message": exc.message},
    )


@app.exception_handler(Exception)
async def handle_unexpected_error(request: Request, exc: Exception) -> JSONResponse:
    LOG.exception("unhandled error: %s", exc)
    return JSONResponse(
        status_code=500,
        content={"code": "E_INTERNAL", "message": "算法服务内部错误"},
    )


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "modelLoaded": embedding_loaded()}


@app.post("/internal/parse")
def parse_endpoint(req: ParseRequest) -> dict:
    result = parse_resume(_decode_base64(req.fileBase64 or ""), req.docType)
    return {
        "schema": result["schema"],
        "blocks": result["blocks"],
        "confidence": result["confidence"],
    }


@app.post("/internal/jd-parse")
def jd_parse_endpoint(req: JdParseRequest) -> dict:
    return parse_jd(req.jdText)


@app.post("/internal/match")
def match_endpoint(req: MatchRequest) -> dict:
    return compute_match(
        resume_schema=req.resumeSchema,
        blocks=req.blocks,
        job_parsed=req.jobParsed,
        job_requirements=req.jobRequirements,
        weights=req.weights,
        options=req.options,
    )


@app.post("/internal/match/batch")
def batch_endpoint(req: BatchRequest) -> List[dict]:
    jobs = [job.model_dump() for job in req.jobs]
    return run_batch(
        resume_schema=req.resumeSchema,
        blocks=req.blocks,
        jobs=jobs,
        weights=req.weights,
        top_n=req.topN,
        options=req.options,
    )


@app.post("/internal/embed")
def embed_endpoint(req: EmbedRequest) -> dict:
    vectors, model = embed_texts(req.texts)
    return {"vectors": vectors, "model": model}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=8000)
