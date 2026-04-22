"""ConsensusMD debate orchestrator.

Implements the main control flow per the kickoff pseudocode:
  - Round 0: blind specialists run in parallel, no debate context.
  - Rounds 1..max: antagonist first → convergence check → specialists run
    in parallel (if not yet converged).
  - Termination: `survival_count >= 2` (two consecutive NoCredibleChallenge
    returns from the antagonist) or `current_round == max_rounds` deadlock.
  - Final: consensus agent produces ConvergedOutput or DeadlockOutput.

Information isolation is enforced in `DebateState.build_*_input`, not here.
This module only wires together the agent calls.

Live streaming: pass `on_event` to receive JSON-serializable event dicts as
the debate progresses (see backend/api/websocket.py for the message format).
"""
from __future__ import annotations

import asyncio
import random
from dataclasses import dataclass
from typing import Any, Awaitable, Callable, Optional

from backend.agents.base import call_agent
from backend.orchestrator.state import DebateState, ReasoningFrame
from backend.prompts import (
    ANTAGONIST_PROMPT,
    CONSENSUS_PROMPT,
    SPECIALIST_PROMPTS,
)
from backend.schemas import (
    AntagonistOutput,
    ConsensusOutput,
    ConvergenceOutcome,
    PatientCase,
    SpecialistRound0Output,
    SpecialistRoundNOutput,
)


_ROLES: tuple[ReasoningFrame, ...] = (
    "probabilistic",
    "mechanistic",
    "eliminative",
)


EventCallback = Callable[[dict[str, Any]], Awaitable[None]]


@dataclass
class DebateResult:
    state: DebateState
    consensus: ConsensusOutput


# ---------------------------------------------------------------------------
# Agent call wrappers — each serializes the typed input to JSON for the prompt.
# ---------------------------------------------------------------------------


async def _call_specialist_round_0(
    role: ReasoningFrame, case: PatientCase
) -> SpecialistRound0Output:
    user_content = (
        "Produce your Round 0 specialist output per the output contract in "
        "the system prompt. This is the blind round — you have no "
        "information about the other specialists or the debate structure.\n\n"
        "PATIENT CASE (JSON):\n" + case.model_dump_json(indent=2)
    )
    return await call_agent(
        role=role,
        system_prompt=SPECIALIST_PROMPTS[role],
        user_content=user_content,
        output_schema=SpecialistRound0Output,
    )


async def _call_specialist_debate(
    role: ReasoningFrame, state: DebateState, round_num: int
) -> SpecialistRoundNOutput:
    inp = state.build_specialist_debate_input(role, round_num)
    user_content = (
        f"Round {round_num} specialist debate input follows. Respond with your "
        "updated output per the SpecialistRoundNOutput schema. "
        "`position_change` is relative to your previous-round output.\n\n"
        "DEBATE INPUT (JSON):\n" + inp.model_dump_json(indent=2)
    )
    return await call_agent(
        role=role,
        system_prompt=SPECIALIST_PROMPTS[role],
        user_content=user_content,
        output_schema=SpecialistRoundNOutput,
    )


async def _call_antagonist(
    state: DebateState, round_num: int
) -> AntagonistOutput:
    inp = state.build_antagonist_input(round_num)
    user_content = (
        f"Evaluate Round {round_num} for credible challenge. Respond with "
        "AntagonistOutput — either AntagonistChallenge (all three required "
        "components) or NoCredibleChallenge (if no substantive alternative "
        "is supported by the case).\n\n"
        "ANTAGONIST INPUT (JSON):\n" + inp.model_dump_json(indent=2)
    )
    return await call_agent(
        role="antagonist",
        system_prompt=ANTAGONIST_PROMPT,
        user_content=user_content,
        output_schema=AntagonistOutput,
    )


async def _call_consensus(
    state: DebateState,
    outcome: ConvergenceOutcome,
    final_round: int,
) -> ConsensusOutput:
    inp = state.build_consensus_input(outcome=outcome, final_round=final_round)
    user_content = (
        f"Produce the final consensus output. Convergence outcome: {outcome}. "
        f"Final round: {final_round}. Full debate context follows.\n\n"
        "CONSENSUS INPUT (JSON):\n" + inp.model_dump_json(indent=2)
    )
    return await call_agent(
        role="consensus",
        system_prompt=CONSENSUS_PROMPT,
        user_content=user_content,
        output_schema=ConsensusOutput,
    )


# ---------------------------------------------------------------------------
# Main orchestration
# ---------------------------------------------------------------------------


async def run_debate(
    case: PatientCase,
    max_rounds: int = 4,
    *,
    rng: Optional[random.Random] = None,
    on_event: Optional[EventCallback] = None,
) -> DebateResult:
    """Run a full debate. If `on_event` is provided, it is awaited with a
    JSON-serializable dict after each significant debate event — see
    backend/api/websocket.py for the message catalogue."""

    async def _emit(event: dict[str, Any]) -> None:
        if on_event is not None:
            await on_event(event)

    state = DebateState(case=case, max_rounds=max_rounds, rng=rng)
    await _emit(
        {
            "event": "debate_started",
            "case_id": case.case_id,
            "max_rounds": max_rounds,
            "anon_id_by_role": dict(state.anon_id_by_role),
        }
    )

    # Round 0 — blind specialists in parallel, emitting each output as it completes.
    await _emit({"event": "round_started", "round": 0})

    async def _round_0(role: ReasoningFrame) -> SpecialistRound0Output:
        out = await _call_specialist_round_0(role, case)
        await _emit(
            {
                "event": "specialist_output",
                "round": 0,
                "role": role,
                "output": out.model_dump(mode="json"),
            }
        )
        return out

    round_0 = await asyncio.gather(*(_round_0(r) for r in _ROLES))
    state.record_round_0(dict(zip(_ROLES, round_0)))
    leading_name, leading_commit = state.current_leading_diagnosis()
    await _emit(
        {
            "event": "round_completed",
            "round": 0,
            "leading_diagnosis": leading_name,
            "leading_commitment": leading_commit,
            "survival_count": state.survival_count,
        }
    )

    # Rounds 1..N — debate.
    for round_num in range(1, max_rounds + 1):
        await _emit({"event": "round_started", "round": round_num})

        antagonist_output = await _call_antagonist(state, round_num)
        state.record_antagonist(antagonist_output)
        await _emit(
            {
                "event": "antagonist_output",
                "round": round_num,
                "output": antagonist_output.model_dump(mode="json"),
                "survival_count": state.survival_count,
            }
        )

        if state.survival_count >= 2:
            await _emit(
                {
                    "event": "round_completed",
                    "round": round_num,
                    "leading_diagnosis": leading_name,
                    "leading_commitment": leading_commit,
                    "survival_count": state.survival_count,
                    "note": "converged_before_specialists",
                }
            )
            break  # Converged; skip specialist round.

        async def _round_n(role: ReasoningFrame, rn: int = round_num) -> SpecialistRoundNOutput:
            out = await _call_specialist_debate(role, state, rn)
            await _emit(
                {
                    "event": "specialist_output",
                    "round": rn,
                    "role": role,
                    "output": out.model_dump(mode="json"),
                }
            )
            return out

        specialist_outputs = await asyncio.gather(
            *(_round_n(role) for role in _ROLES)
        )
        state.record_specialists(
            round_num, dict(zip(_ROLES, specialist_outputs))
        )
        leading_name, leading_commit = state.current_leading_diagnosis()
        await _emit(
            {
                "event": "round_completed",
                "round": round_num,
                "leading_diagnosis": leading_name,
                "leading_commitment": leading_commit,
                "survival_count": state.survival_count,
            }
        )

    outcome: ConvergenceOutcome = (
        "converged" if state.survival_count >= 2 else "deadlocked"
    )
    final_round = state.current_round

    await _emit(
        {
            "event": "consensus_started",
            "outcome": outcome,
            "final_round": final_round,
        }
    )
    consensus = await _call_consensus(state, outcome, final_round)
    await _emit(
        {
            "event": "consensus_output",
            "output": consensus.model_dump(mode="json"),
        }
    )
    await _emit(
        {
            "event": "debate_complete",
            "outcome": outcome,
            "final_round": final_round,
        }
    )

    return DebateResult(state=state, consensus=consensus)


__all__ = ["DebateResult", "EventCallback", "run_debate"]
