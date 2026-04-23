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

Concurrency notes:
- Specialist outputs run in parallel inside run_debate via asyncio.gather.
  Two emits could race on the single WebSocket send channel, so every emit
  goes through an asyncio.Lock.
- If the client disconnects mid-debate we cancel run_debate rather than
  keep hitting the provider APIs. The task is raced against a disconnect
  watcher and cancelled with asyncio.wait + FIRST_COMPLETED.
"""
from __future__ import annotations

import asyncio
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
    send_lock = asyncio.Lock()

    async def emit(event: dict[str, Any]) -> None:
        async with send_lock:
            await websocket.send_json(event)

    try:
        raw = await websocket.receive_text()
        try:
            msg = json.loads(raw)
        except json.JSONDecodeError as exc:
            await emit({"event": "error", "message": f"invalid JSON: {exc}"})
            return

        action = msg.get("action")
        if action != "start_debate":
            await emit(
                {
                    "event": "error",
                    "message": f"unknown action {action!r}; expected 'start_debate'",
                }
            )
            return

        try:
            if "case_id" in msg:
                case = _load_case_by_id(msg["case_id"])
            elif "case" in msg:
                case = PatientCase.model_validate(msg["case"])
            else:
                await emit(
                    {
                        "event": "error",
                        "message": "must supply either 'case_id' or 'case'",
                    }
                )
                return
        except (FileNotFoundError, ValidationError) as exc:
            await emit({"event": "error", "message": f"could not load case: {exc}"})
            return

        max_rounds = int(msg.get("max_rounds", 4))

        # Race the debate against a disconnect watcher. If the client goes away
        # mid-debate, we cancel run_debate rather than keep paying for API calls
        # whose results nobody will read.
        debate_task = asyncio.create_task(
            run_debate(case, max_rounds=max_rounds, on_event=emit)
        )

        async def _watch_disconnect() -> None:
            try:
                while True:
                    received = await websocket.receive()
                    if received.get("type") == "websocket.disconnect":
                        return
            except WebSocketDisconnect:
                return

        watch_task = asyncio.create_task(_watch_disconnect())

        done, pending = await asyncio.wait(
            [debate_task, watch_task],
            return_when=asyncio.FIRST_COMPLETED,
        )

        for task in pending:
            task.cancel()
            try:
                await task
            except (asyncio.CancelledError, WebSocketDisconnect):
                pass
            except Exception:
                logger.exception("unexpected error cancelling pending task")

        if watch_task in done and debate_task in pending:
            logger.info("client disconnected mid-debate; run_debate cancelled")
            return

        if debate_task in done:
            try:
                debate_task.result()
            except Exception as exc:
                logger.exception("run_debate failed inside WebSocket handler")
                try:
                    await emit(
                        {
                            "event": "error",
                            "message": f"debate failed: {type(exc).__name__}: {exc}",
                        }
                    )
                except Exception:
                    pass  # client may have disconnected before we could tell them
    except WebSocketDisconnect:
        logger.info("WebSocket disconnected by client during setup")
