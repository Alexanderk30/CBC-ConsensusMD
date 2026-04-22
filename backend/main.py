"""ConsensusMD FastAPI entry point.

Run with:
    uvicorn backend.main:app --reload --port 8000

Endpoints:
    GET  /health                  — liveness probe
    GET  /cases                   — list demo cases
    GET  /cases/{case_id}         — fetch a single PatientCase JSON
    WS   /ws/debate               — stream a debate (see README.md)

CORS is permissive (allows all origins) — this is a local demo; tighten in
production.
"""
from __future__ import annotations

import logging
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import ValidationError

from backend.api.websocket import CASES_DIR, router as ws_router
from backend.schemas import PatientCase


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)


app = FastAPI(
    title="ConsensusMD",
    description="Multi-agent adversarial diagnostic consultation system.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(ws_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/cases")
def list_cases() -> list[dict[str, str]]:
    """List demo cases with their case_id, archetype (from ground truth), and a one-line summary."""
    out: list[dict[str, str]] = []
    for path in sorted(CASES_DIR.glob("case_*.json")):
        if "_ground_truth" in path.name:
            continue
        try:
            case = PatientCase.model_validate_json(path.read_text())
        except ValidationError:
            continue
        gt_path = path.with_name(path.stem + "_ground_truth.json")
        archetype = None
        if gt_path.exists():
            import json as _json

            try:
                gt = _json.loads(gt_path.read_text())
                archetype = gt.get("archetype")
            except (_json.JSONDecodeError, OSError):
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
    path = CASES_DIR / f"{case_id}.json"
    if not path.exists():
        for candidate in CASES_DIR.glob("case_*.json"):
            if "_ground_truth" in candidate.name:
                continue
            try:
                case = PatientCase.model_validate_json(candidate.read_text())
            except ValidationError:
                continue
            if case.case_id == case_id:
                return case.model_dump(mode="json")
        raise HTTPException(status_code=404, detail=f"case {case_id!r} not found")
    return PatientCase.model_validate_json(path.read_text()).model_dump(mode="json")
