"""ConsensusMD FastAPI entry point.

Run with:
    uvicorn backend.main:app --reload --port 8000

Endpoints:
    GET  /health                  — liveness probe
    GET  /cases                   — list demo cases
    GET  /cases/{case_id}         — fetch a single PatientCase JSON
    WS   /ws/debate               — stream a debate (see README.md)

CORS is permissive for origin but rejects credentialed requests — the
browser will refuse `allow_origins=["*"]` + `allow_credentials=True`, and
this demo doesn't use cookies, so drop credentials rather than pin origins.
"""
from __future__ import annotations

import json
import logging
import os
import re
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import ValidationError

from backend.api.websocket import CASES_DIR, _iter_case_files, router as ws_router
from backend.schemas import PatientCase


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
log = logging.getLogger(__name__)


# Required env vars. Surfaced at /health so the deployed instance can be
# probed without starting a debate, and logged at startup so the deploy
# log shows the failure mode immediately rather than 120s into the first
# WebSocket request.
_REQUIRED_ENV = ("ANTHROPIC_API_KEY", "OPENROUTER_API_KEY")


def _missing_env() -> list[str]:
    return [k for k in _REQUIRED_ENV if not os.environ.get(k)]


_startup_missing = _missing_env()
if _startup_missing:
    log.warning(
        "Missing required env vars at startup: %s. "
        "Debate requests will fail until these are set.",
        ", ".join(_startup_missing),
    )


app = FastAPI(
    title="ConsensusMD",
    description="Multi-agent adversarial diagnostic consultation system.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(ws_router)


# case_id must be the conservative slug form to keep path construction safe.
_CASE_ID_PATTERN = re.compile(r"^[a-z0-9][a-z0-9\-]{0,63}$")


@app.get("/health")
def health() -> dict[str, object]:
    """Liveness + config probe. Reports `degraded` if required API keys
    are missing so the deploy log and uptime monitor see the failure
    mode without having to start a real debate."""
    missing = _missing_env()
    if missing:
        return {"status": "degraded", "missing_env": missing}
    return {"status": "ok"}


@app.get("/cases")
def list_cases() -> list[dict[str, str]]:
    """List every case (demo + eval) with case_id, archetype, chief complaint."""
    out: list[dict[str, str]] = []
    for path in sorted(_iter_case_files(CASES_DIR)):
        try:
            case = PatientCase.model_validate_json(path.read_text())
        except ValidationError:
            continue
        gt_path = path.with_name(path.stem + "_ground_truth.json")
        archetype = None
        if gt_path.exists():
            try:
                gt = json.loads(gt_path.read_text())
                archetype = gt.get("archetype")
            except (json.JSONDecodeError, OSError):
                pass
        out.append(
            {
                "case_id": case.case_id,
                "age_sex": f"{case.demographics.age}{case.demographics.sex}",
                "chief_complaint": case.chief_complaint,
                "archetype": archetype or "unknown",
            }
        )
    return out


@app.get("/cases/{case_id}")
def get_case(case_id: str) -> dict:
    if not _CASE_ID_PATTERN.fullmatch(case_id):
        raise HTTPException(status_code=400, detail="invalid case_id format")
    for candidate in _iter_case_files(CASES_DIR):
        try:
            case = PatientCase.model_validate_json(candidate.read_text())
        except ValidationError:
            continue
        if case.case_id == case_id:
            return case.model_dump(mode="json")
    raise HTTPException(status_code=404, detail=f"case {case_id!r} not found")


# ── Static frontend ──────────────────────────────────────────────────
# Serve the built Vite bundle from `frontend/dist` so a single deployment
# (e.g. Railway) can ship backend + UI together. Mounted LAST so the API
# routes above take precedence; unmatched paths fall through to the
# `html=True` SPA fallback. Absent dist/ in dev, the mount is skipped.
from fastapi.staticfiles import StaticFiles  # noqa: E402

_FRONTEND_DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
if _FRONTEND_DIST.is_dir():
    app.mount("/", StaticFiles(directory=_FRONTEND_DIST, html=True), name="frontend")
