"""Run a full ConsensusMD debate against a PatientCase JSON file.

Usage:
    python3 scripts/run_case.py cases/demo/case_02_stemi.json

Prints a concise summary of the debate outcome. For full state dump, pass
--dump.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
import time
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT))

from backend.orchestrator.debate import run_debate  # noqa: E402
from backend.schemas import PatientCase  # noqa: E402


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("case_path", type=Path)
    p.add_argument("--max-rounds", type=int, default=4)
    p.add_argument("--dump", action="store_true", help="Print full debate state + consensus as JSON")
    return p.parse_args()


async def _main() -> int:
    args = _parse_args()
    case = PatientCase.model_validate_json(args.case_path.read_text())
    print(f"Running debate on case: {case.case_id} ({case.demographics.age}{case.demographics.sex})")
    print(f"Chief complaint: {case.chief_complaint}")
    print()
    t0 = time.monotonic()
    result = await run_debate(case, max_rounds=args.max_rounds)
    elapsed = time.monotonic() - t0

    consensus = result.consensus
    state = result.state
    print("=" * 70)
    print(f"Outcome:             {consensus.outcome}")
    print(f"Output type:         {consensus.output.type}")
    print(f"Final round:         {consensus.final_round}")
    print(f"Rounds completed:    {state.current_round}")
    print(f"Survival count:      {state.survival_count}")
    print(f"Wall clock:          {elapsed:.1f}s")
    if consensus.output.type == "converged":
        print(f"Primary diagnosis:   {consensus.output.primary_diagnosis!r}")
        print(f"Commitment:          {consensus.output.commitment}")
        print(f"Distinguishing test: {consensus.output.distinguishing_test.test_name}")
        print(f"Residual:            {consensus.output.residual_uncertainty[:100]}")
    else:
        print(f"Referral urgency:    {consensus.output.referral_urgency}")
        print(f"Competing hypotheses:")
        for h in consensus.output.competing_hypotheses:
            print(f"  - {h.diagnosis} (distinguishing: {h.distinguishing_test})")
    print("=" * 70)

    if args.dump:
        payload = {
            "consensus": consensus.model_dump(mode="json"),
            "antagonist_rounds": [
                a.model_dump(mode="json") for a in state.build_consensus_input(
                    outcome=consensus.outcome,
                    final_round=consensus.final_round,
                ).antagonist_history
            ],
            "anon_id_by_role": state.anon_id_by_role,
        }
        print(json.dumps(payload, indent=2))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(asyncio.run(_main()))
    except Exception as exc:
        print(f"\n DEBATE FAILED: {type(exc).__name__}: {exc}", file=sys.stderr)
        import traceback

        traceback.print_exc()
        sys.exit(1)
