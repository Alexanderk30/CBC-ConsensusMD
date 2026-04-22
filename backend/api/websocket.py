"""WebSocket endpoint — streams a debate's events to the frontend.

Connection flow:
  1. Client connects to /ws/debate.
  2. Client sends one of:
       {"action": "start_debate", "case_id": "demo-02-stemi"}
       {"action": "start_debate", "case": {...PatientCase JSON...}}
  3. Server streams JSON event messages (see schema below) until
     {"event": "debate_complete"} (or {"event": "error"}).
  4. Server closes the connection.

Event message catalogue — see README.md for the frontend contract.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import ValidationError

from backend.orchestrator.debate import run_debate
from backend.schemas import PatientCase


logger = logging.getLogger(__name__)
router = APIRouter()

CASES_DIR = Path(__file__).resolve().parents[2] / "cases" / "demo"


def _load_case_by_id(case_id: str) -> PatientCase:
    """Resolve a case_id to a PatientCase by scanning cases/demo/."""
    candidate = CASES_DIR / f"{case_id}.json"
    if candidate.exists():
        return PatientCase.model_validate_json(candidate.read_text())
    # Fallback: scan for any file whose case_id matches.
    for path in CASES_DIR.glob("case_*.json"):
        if "_ground_truth" in path.name:
            continue
        try:
            case = PatientCase.model_validate_json(path.read_text())
        except ValidationError:
            continue
        if case.case_id == case_id:
            return case
    raise FileNotFoundError(f"No case with case_id={case_id!r} in {CASES_DIR}")


@router.websocket("/ws/debate")
async def ws_debate(websocket: WebSocket) -> None:
    await websocket.accept()
    try:
        raw = await websocket.receive_text()
        try:
            msg = json.loads(raw)
        except json.JSONDecodeError as e:
            await websocket.send_json(
                {"event": "error", "message": f"invalid JSON: {e}"}
            )
            return

        action = msg.get("action")
        if action != "start_debate":
            await websocket.send_json(
                {
                    "event": "error",
                    "message": f"unknown action {action!r}; expected 'start_debate'",
                }
            )
            return

        # Resolve the case: by case_id (preferred) or inline payload.
        try:
            if "case_id" in msg:
                case = _load_case_by_id(msg["case_id"])
            elif "case" in msg:
                case = PatientCase.model_validate(msg["case"])
            else:
                await websocket.send_json(
                    {
                        "event": "error",
                        "message": "must supply either 'case_id' or 'case'",
                    }
                )
                return
        except (FileNotFoundError, ValidationError) as e:
            await websocket.send_json(
                {"event": "error", "message": f"could not load case: {e}"}
            )
            return

        max_rounds = int(msg.get("max_rounds", 4))

        async def emit(event: dict[str, Any]) -> None:
            await websocket.send_json(event)

        try:
            await run_debate(case, max_rounds=max_rounds, on_event=emit)
        except Exception as exc:
            logger.exception("run_debate failed inside WebSocket handler")
            await websocket.send_json(
                {
                    "event": "error",
                    "message": f"debate failed: {type(exc).__name__}: {exc}",
                }
            )
    except WebSocketDisconnect:
        logger.info("WebSocket disconnected by client")
