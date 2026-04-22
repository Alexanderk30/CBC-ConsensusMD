"""Step 3 gate — smoke test each of the five agent roles end-to-end.

Runs sequentially:
  1. Probabilistic specialist (Round 0) on Case 2.
  2. Mechanistic specialist (Round 0) on Case 2.
  3. Eliminative specialist (Round 0) on Case 2.
  4. Antagonist (Round 1) with the three specialist conclusions.
  5. Consensus (final) with one round of history.

Each call must return a schema-valid Pydantic instance. Any failure prints the
failing role and raises.

Run:
    python3 scripts/smoke_test_agents.py
"""
from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

from backend.agents.base import call_agent  # noqa: E402
from backend.prompts import (  # noqa: E402
    ANTAGONIST_PROMPT,
    CONSENSUS_PROMPT,
    SPECIALIST_PROMPTS,
)
from backend.schemas import (  # noqa: E402
    AntagonistInput,
    AntagonistOutput,
    ConsensusInput,
    ConsensusOutput,
    LeadingDiagnosisForAntagonist,
    PatientCase,
    SpecialistConclusionAnon,
    SpecialistHistory,
    SpecialistRound0Output,
)


CASE_PATH = REPO_ROOT / "cases" / "demo" / "case_02_stemi.json"


def _load_case() -> PatientCase:
    return PatientCase.model_validate_json(CASE_PATH.read_text())


def _format_case_for_specialist(case: PatientCase) -> str:
    return (
        "Review the following patient case and produce your specialist output "
        "per the output contract in the system prompt.\n\n"
        "PATIENT CASE (JSON):\n"
        f"{case.model_dump_json(indent=2)}"
    )


async def _run_specialist(role: str, case: PatientCase) -> SpecialistRound0Output:
    print(f"  → calling {role} specialist...", flush=True)
    out = await call_agent(
        role=role,  # type: ignore[arg-type]
        system_prompt=SPECIALIST_PROMPTS[role],
        user_content=_format_case_for_specialist(case),
        output_schema=SpecialistRound0Output,
    )
    print(
        f"    ✓ {role}: primary={out.primary_diagnosis!r} "
        f"commitment={out.differential[0].commitment}"
    )
    return out


async def _run_antagonist(
    case: PatientCase, spec_outputs: dict[str, SpecialistRound0Output]
) -> AntagonistOutput:
    print("  → calling antagonist...", flush=True)
    # Pick a synthesized leading diagnosis (first specialist's primary).
    first = next(iter(spec_outputs.values()))
    ant_input = AntagonistInput(
        patient_case=case,
        current_leading_diagnosis=LeadingDiagnosisForAntagonist(
            diagnosis_name=first.primary_diagnosis,
            commitment=first.differential[0].commitment,
            supporting_evidence_summary=list(
                {
                    ev
                    for out in spec_outputs.values()
                    if out.primary_diagnosis == first.primary_diagnosis
                    for ev in out.differential[0].supporting_evidence
                }
            ),
        ),
        all_specialist_conclusions=[
            SpecialistConclusionAnon(
                primary_diagnosis=out.primary_diagnosis,
                commitment=out.differential[0].commitment,
            )
            for out in spec_outputs.values()
        ],
        position_deltas=[],
        previous_challenges=[],
        round_number=1,
    )
    user_content = (
        "You are evaluating the leading diagnosis for credible challenge in "
        "Round 1. Your input object follows:\n\n"
        f"{ant_input.model_dump_json(indent=2)}"
    )
    out = await call_agent(
        role="antagonist",
        system_prompt=ANTAGONIST_PROMPT,
        user_content=user_content,
        output_schema=AntagonistOutput,
    )
    print(f"    ✓ antagonist: result.type={out.result.type}")
    return out


async def _run_consensus(
    case: PatientCase,
    spec_outputs: dict[str, SpecialistRound0Output],
    antagonist_out: AntagonistOutput,
) -> ConsensusOutput:
    print("  → calling consensus...", flush=True)
    outcome = (
        "converged" if antagonist_out.result.type == "no_credible_challenge" else "deadlocked"
    )
    cons_input = ConsensusInput(
        patient_case=case,
        all_specialist_histories=[
            SpecialistHistory(specialist_role=role, rounds=[out])  # type: ignore[arg-type]
            for role, out in spec_outputs.items()
        ],
        antagonist_history=[antagonist_out],
        convergence_outcome=outcome,  # type: ignore[arg-type]
        final_round_number=1,
    )
    user_content = (
        f"Produce the final consensus output. Convergence outcome: {outcome}. "
        "The full debate context follows:\n\n"
        f"{cons_input.model_dump_json(indent=2)}"
    )
    out = await call_agent(
        role="consensus",
        system_prompt=CONSENSUS_PROMPT,
        user_content=user_content,
        output_schema=ConsensusOutput,
    )
    print(f"    ✓ consensus: outcome={out.outcome} type={out.output.type}")
    return out


async def main() -> int:
    print(f"Loading case from {CASE_PATH}")
    case = _load_case()
    print(f"Case loaded: {case.case_id} ({case.demographics.age}{case.demographics.sex})")

    print("\nStep 3.1 — Specialists (Round 0):")
    # Run all three specialists concurrently — validates parallel dispatch too.
    roles = ("probabilistic", "mechanistic", "eliminative")
    results = await asyncio.gather(
        *(_run_specialist(r, case) for r in roles)
    )
    spec_outputs = dict(zip(roles, results))

    print("\nStep 3.2 — Antagonist (Round 1):")
    antagonist_out = await _run_antagonist(case, spec_outputs)

    print("\nStep 3.3 — Consensus:")
    consensus_out = await _run_consensus(case, spec_outputs, antagonist_out)

    print("\n" + "=" * 60)
    print("All five roles executed successfully.")
    print("=" * 60)
    print(
        f"\nConsensus primary diagnosis: "
        f"{getattr(consensus_out.output, 'primary_diagnosis', 'N/A (deadlocked)')!r}"
    )
    print(f"Consensus outcome: {consensus_out.outcome}")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(asyncio.run(main()))
    except Exception as e:
        print(f"\n❌ SMOKE TEST FAILED: {type(e).__name__}: {e}", file=sys.stderr)
        import traceback

        traceback.print_exc()
        sys.exit(1)
