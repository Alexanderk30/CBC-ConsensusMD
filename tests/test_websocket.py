"""WebSocket handler tests — exercise error paths before run_debate is called.

These tests do not invoke real LLM APIs; they verify the handler's request
validation, error-emission contract, and case_id lookup fallback behavior.
"""
from __future__ import annotations

from fastapi.testclient import TestClient

from backend.main import app


def test_ws_rejects_invalid_json():
    client = TestClient(app)
    with client.websocket_connect("/ws/debate") as ws:
        ws.send_text("not json {")
        msg = ws.receive_json()
        assert msg["event"] == "error"
        assert "invalid JSON" in msg["message"]


def test_ws_rejects_unknown_action():
    client = TestClient(app)
    with client.websocket_connect("/ws/debate") as ws:
        ws.send_json({"action": "bogus"})
        msg = ws.receive_json()
        assert msg["event"] == "error"
        assert "unknown action" in msg["message"]
        assert "bogus" in msg["message"]


def test_ws_rejects_missing_case_payload():
    client = TestClient(app)
    with client.websocket_connect("/ws/debate") as ws:
        ws.send_json({"action": "start_debate"})
        msg = ws.receive_json()
        assert msg["event"] == "error"
        assert "case_id" in msg["message"] or "case" in msg["message"]


def test_ws_rejects_unknown_case_id():
    client = TestClient(app)
    with client.websocket_connect("/ws/debate") as ws:
        ws.send_json({"action": "start_debate", "case_id": "demo-does-not-exist"})
        msg = ws.receive_json()
        assert msg["event"] == "error"
        assert "could not load case" in msg["message"]


def test_ws_rejects_malformed_inline_case():
    client = TestClient(app)
    with client.websocket_connect("/ws/debate") as ws:
        ws.send_json({"action": "start_debate", "case": {"case_id": "x"}})
        msg = ws.receive_json()
        # Inline payload missing required PatientCase fields → ValidationError → error event
        assert msg["event"] == "error"
        assert "could not load case" in msg["message"]
