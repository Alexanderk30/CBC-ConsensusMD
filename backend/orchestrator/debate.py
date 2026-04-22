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
"""
from __future__ import annotations

import asyncio
import random
from dataclasses import dataclass
from typing import Optional

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
) -> DebateResult:
    state = DebateState(case=case, max_rounds=max_rounds, rng=rng)

    # Round 0 — blind specialists in parallel.
    round_0 = await asyncio.gather(
        *(_call_specialist_round_0(role, case) for role in _ROLES)
    )
    state.record_round_0(dict(zip(_ROLES, round_0)))

    # Rounds 1..N — debate.
    for round_num in range(1, max_rounds + 1):
        antagonist_output = await _call_antagonist(state, round_num)
        state.record_antagonist(antagonist_output)

        if state.survival_count >= 2:
            break  # Converged; skip specialist round.

        specialist_outputs = await asyncio.gather(
            *(
                _call_specialist_debate(role, state, round_num)
                for role in _ROLES
            )
        )
        state.record_specialists(
            round_num, dict(zip(_ROLES, specialist_outputs))
        )

    outcome: ConvergenceOutcome = (
        "converged" if state.survival_count >= 2 else "deadlocked"
    )
    final_round = state.current_round

    consensus = await _call_consensus(state, outcome, final_round)
    return DebateResult(state=state, consensus=consensus)


__all__ = ["DebateResult", "run_debate"]
