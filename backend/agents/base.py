"""Unified agent-call infrastructure for ConsensusMD.

One interface — `call_agent(role, system_prompt, user_content, output_schema)` —
dispatches to the correct provider based on the role, uses structured output
(tool_use on Anthropic, JSON-mode on OpenRouter), retries once with a fallback
model on malformed output, and returns a validated Pydantic instance.

Model assignments are locked (see project memory: locked decisions Q0). Model
IDs are env-overridable because the exact hackathon-era IDs may shift; the
role→provider mapping is NOT overridable.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal, Type, TypeVar

from dotenv import load_dotenv
from pydantic import BaseModel, ValidationError


logger = logging.getLogger(__name__)

AgentRole = Literal[
    "probabilistic", "mechanistic", "eliminative", "antagonist", "consensus"
]
Provider = Literal["anthropic", "openrouter"]

T = TypeVar("T", bound=BaseModel)


# ---------------------------------------------------------------------------
# Env loading — .env then .env.example fallback
# ---------------------------------------------------------------------------


def _load_env_once() -> None:
    if getattr(_load_env_once, "_done", False):
        return
    repo_root = Path(__file__).resolve().parents[2]
    for candidate in (repo_root / ".env", repo_root / ".env.example"):
        if candidate.exists():
            load_dotenv(candidate, override=False)
    _load_env_once._done = True  # type: ignore[attr-defined]


# ---------------------------------------------------------------------------
# Model routing
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class ModelSpec:
    provider: Provider
    primary_model: str
    fallback_model: str


def _role_model_map() -> dict[AgentRole, ModelSpec]:
    """Role → ModelSpec. IDs env-overridable; providers are not."""
    _load_env_once()
    return {
        "probabilistic": ModelSpec(
            provider="openrouter",
            primary_model=os.getenv("PROBABILISTIC_MODEL", "openai/gpt-5.4"),
            fallback_model=os.getenv(
                "PROBABILISTIC_FALLBACK_MODEL", "openai/gpt-5"
            ),
        ),
        "mechanistic": ModelSpec(
            provider="openrouter",
            primary_model=os.getenv(
                "MECHANISTIC_MODEL", "google/gemini-3.1-pro-preview"
            ),
            fallback_model=os.getenv(
                "MECHANISTIC_FALLBACK_MODEL", "google/gemini-2.5-pro"
            ),
        ),
        "eliminative": ModelSpec(
            provider="anthropic",
            primary_model=os.getenv("ELIMINATIVE_MODEL", "claude-sonnet-4-6"),
            fallback_model=os.getenv(
                "ELIMINATIVE_FALLBACK_MODEL", "claude-sonnet-4-5"
            ),
        ),
        "antagonist": ModelSpec(
            provider="anthropic",
            primary_model=os.getenv("ANTAGONIST_MODEL", "claude-opus-4-6"),
            fallback_model=os.getenv(
                "ANTAGONIST_FALLBACK_MODEL", "claude-opus-4-5"
            ),
        ),
        "consensus": ModelSpec(
            provider="anthropic",
            primary_model=os.getenv("CONSENSUS_MODEL", "claude-opus-4-6"),
            fallback_model=os.getenv(
                "CONSENSUS_FALLBACK_MODEL", "claude-opus-4-5"
            ),
        ),
    }


# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------


class AgentCallError(RuntimeError):
    def __init__(self, role: AgentRole, stage: str, cause: Exception) -> None:
        super().__init__(f"[{role}:{stage}] {cause!r}")
        self.role = role
        self.stage = stage
        self.cause = cause


# ---------------------------------------------------------------------------
# JSON schema prep — strip Pydantic's top-level junk for provider tool/format APIs
# ---------------------------------------------------------------------------


def _output_json_schema(output_schema: Type[BaseModel]) -> dict[str, Any]:
    schema = output_schema.model_json_schema()
    # Providers accept arbitrary JSON Schema; no transformation needed for
    # Anthropic tool_use. OpenRouter tolerance varies by model — we fall back
    # to json_object mode if strict mode is rejected.
    return schema


# Keys whose *values* are nested objects (or arrays of objects) in our schemas.
# Only these keys are eligible for the tool_use stringified-object workaround —
# we don't unwrap arbitrary strings, which would clobber free-text fields that
# happen to start with `{` or `[` (e.g. a `supporting_finding` containing
# `'["hypoxia","tachycardia"]'` written as prose).
_NESTED_OBJECT_KEYS = frozenset(
    {
        "reasoning",
        "result",
        "output",
        "criteria_check",
        "integrated_reasoning",
        "distinguishing_test",
        "response_to_challenge",
        "current_leading_diagnosis",
        "demographics",
        "vitals",
        "patient_case",
        "own_previous_output",
        "antagonist_challenge",
    }
)


def _parse_stringified_nested(data: Any) -> Any:
    """Repair the Claude tool_use quirk where deeply-nested objects come back
    as JSON-encoded strings.

    Only un-stringifies values at keys named in `_NESTED_OBJECT_KEYS`. Recurses
    into dicts and lists but never touches arbitrary free-text strings.
    """
    if isinstance(data, dict):
        repaired: dict[str, Any] = {}
        for k, v in data.items():
            if k in _NESTED_OBJECT_KEYS and isinstance(v, str):
                stripped = v.strip()
                if stripped and stripped[0] in "{[":
                    try:
                        parsed = json.loads(stripped)
                    except json.JSONDecodeError:
                        repaired[k] = v
                        continue
                    if isinstance(parsed, (dict, list)):
                        repaired[k] = _parse_stringified_nested(parsed)
                        continue
                repaired[k] = v
            elif isinstance(v, (dict, list)):
                repaired[k] = _parse_stringified_nested(v)
            else:
                repaired[k] = v
        return repaired
    if isinstance(data, list):
        return [_parse_stringified_nested(v) for v in data]
    return data


# ---------------------------------------------------------------------------
# Anthropic call
# ---------------------------------------------------------------------------

_TOOL_NAME = "emit_output"


async def _call_anthropic(
    model: str,
    system_prompt: str,
    user_content: str,
    output_schema: Type[T],
) -> dict[str, Any]:
    from anthropic import AsyncAnthropic

    client = AsyncAnthropic(api_key=os.environ["ANTHROPIC_API_KEY"], timeout=60)
    tool_schema = _output_json_schema(output_schema)

    response = await client.messages.create(
        model=model,
        max_tokens=8000,
        system=[
            {
                "type": "text",
                "text": system_prompt,
                "cache_control": {"type": "ephemeral"},
            }
        ],
        messages=[{"role": "user", "content": user_content}],
        tools=[
            {
                "name": _TOOL_NAME,
                "description": (
                    f"Emit the {output_schema.__name__} as the single tool call."
                ),
                "input_schema": tool_schema,
            }
        ],
        tool_choice={"type": "tool", "name": _TOOL_NAME},
    )

    logger.info(
        "anthropic call: model=%s in=%d out=%d cache_read=%s cache_create=%s",
        model,
        response.usage.input_tokens,
        response.usage.output_tokens,
        getattr(response.usage, "cache_read_input_tokens", None),
        getattr(response.usage, "cache_creation_input_tokens", None),
    )

    for block in response.content:
        if getattr(block, "type", None) == "tool_use":
            raw = dict(block.input)  # type: ignore[attr-defined]
            return _parse_stringified_nested(raw)
    raise AgentCallError(
        role="anthropic_unknown",  # type: ignore[arg-type]
        stage="parse",
        cause=RuntimeError(
            "Anthropic response contained no tool_use block; "
            f"content types={[getattr(b, 'type', '?') for b in response.content]}"
        ),
    )


# ---------------------------------------------------------------------------
# OpenRouter call (OpenAI-compatible)
# ---------------------------------------------------------------------------


async def _call_openrouter(
    model: str,
    system_prompt: str,
    user_content: str,
    output_schema: Type[T],
) -> dict[str, Any]:
    from openai import AsyncOpenAI

    client = AsyncOpenAI(
        api_key=os.environ["OPENROUTER_API_KEY"],
        base_url="https://openrouter.ai/api/v1",
        timeout=60,
    )

    schema = _output_json_schema(output_schema)
    schema_hint = (
        "You MUST respond with a single JSON object conforming exactly to this "
        f"schema:\n\n{json.dumps(schema)}\n\n"
        "Do not wrap the object in markdown fences. Do not include commentary."
    )
    augmented_system = f"{system_prompt}\n\n---\n\n{schema_hint}"

    response = await client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": augmented_system},
            {"role": "user", "content": user_content},
        ],
        response_format={"type": "json_object"},
    )

    logger.info(
        "openrouter call: model=%s in=%d out=%d total=%d",
        model,
        response.usage.prompt_tokens,
        response.usage.completion_tokens,
        response.usage.total_tokens,
    )

    content = response.choices[0].message.content or ""
    try:
        raw = json.loads(content)
    except json.JSONDecodeError as e:
        raise AgentCallError("openrouter_unknown", "parse", e)  # type: ignore[arg-type]
    return _parse_stringified_nested(raw)


# ---------------------------------------------------------------------------
# Public entrypoint
# ---------------------------------------------------------------------------


async def call_agent(
    role: AgentRole,
    system_prompt: str,
    user_content: str,
    output_schema: Type[T],
    *,
    max_retries: int = 1,
) -> T:
    """Dispatch an agent call, validate structured output, retry once on failure.

    Retry uses the role's `fallback_model` (cross-model within the same
    provider). On second failure raises AgentCallError with the last cause.
    """
    _load_env_once()
    spec = _role_model_map()[role]
    last_exc: Exception | None = None

    for attempt in range(max_retries + 1):
        model = spec.primary_model if attempt == 0 else spec.fallback_model
        try:
            if spec.provider == "anthropic":
                raw = await _call_anthropic(
                    model, system_prompt, user_content, output_schema
                )
            elif spec.provider == "openrouter":
                raw = await _call_openrouter(
                    model, system_prompt, user_content, output_schema
                )
            else:  # pragma: no cover
                raise RuntimeError(f"unknown provider: {spec.provider}")
            return output_schema.model_validate(raw)
        except (ValidationError, json.JSONDecodeError, AgentCallError) as e:
            logger.warning(
                "call_agent attempt %d failed for role=%s model=%s: %s",
                attempt,
                role,
                model,
                e,
            )
            last_exc = e
        except Exception as e:  # provider HTTP/transport errors etc.
            logger.warning(
                "call_agent attempt %d unexpected error for role=%s model=%s: %r",
                attempt,
                role,
                model,
                e,
            )
            last_exc = e

    assert last_exc is not None
    raise AgentCallError(role=role, stage="all_attempts_failed", cause=last_exc)


# Sync shim for scripts / notebooks that aren't already in an event loop.
def call_agent_sync(
    role: AgentRole,
    system_prompt: str,
    user_content: str,
    output_schema: Type[T],
    *,
    max_retries: int = 1,
) -> T:
    return asyncio.run(
        call_agent(
            role=role,
            system_prompt=system_prompt,
            user_content=user_content,
            output_schema=output_schema,
            max_retries=max_retries,
        )
    )


__all__ = [
    "AgentRole",
    "Provider",
    "ModelSpec",
    "AgentCallError",
    "call_agent",
    "call_agent_sync",
]
