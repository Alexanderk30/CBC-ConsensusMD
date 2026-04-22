"""Evaluation harness — run held-out cases through run_debate and score them.

Compares actual convergence outcome + primary diagnosis (for converged cases)
against the ground-truth sidecar JSON. Reports:
  - convergence rate (% converged vs. deadlocked)
  - outcome-match rate (did the outcome type match ground truth?)
  - accuracy on converged cases (fuzzy primary-diagnosis match)
  - mean rounds to convergence
  - per-case log for failure analysis

Usage:
    python3 -m backend.evaluation.runner cases/demo --out eval_report.json

Sequential execution only — parallel debates would hammer the API providers
and muddle diagnostic debugging when a case fails unexpectedly.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import logging
import sys
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path
from statistics import mean
from typing import Optional

from backend.orchestrator.debate import run_debate
from backend.orchestrator.state import _normalize
from backend.schemas import PatientCase


logger = logging.getLogger(__name__)


@dataclass
class CaseResult:
    case_id: str
    expected_outcome: Optional[str]
    actual_outcome: Optional[str]
    outcome_match: Optional[bool]
    expected_primary: Optional[str]
    actual_primary: Optional[str]
    primary_match: Optional[bool]
    final_round: Optional[int]
    elapsed_seconds: float
    error: Optional[str] = None


@dataclass
class EvalReport:
    total: int
    outcome_match_count: int
    converged_count: int
    deadlocked_count: int
    converged_correct_count: int
    correct_deadlock_count: int
    mean_elapsed_seconds: float
    mean_final_round_converged: Optional[float]
    results: list[CaseResult] = field(default_factory=list)


def _fuzzy_primary_match(expected: str, actual: str) -> bool:
    """Loose bag-of-words overlap after normalization.

    Returns True if ≥60% of the shorter normalized-word set is in the longer.
    Words shorter than 3 chars are dropped. This accommodates variations like
    'Pulmonary embolism' vs 'Acute pulmonary embolism, postpartum'.
    """
    exp = {w for w in _normalize(expected).split() if len(w) >= 3}
    act = {w for w in _normalize(actual).split() if len(w) >= 3}
    if not exp or not act:
        return False
    shorter, longer = (exp, act) if len(exp) <= len(act) else (act, exp)
    overlap = shorter & longer
    return len(overlap) / len(shorter) >= 0.6


async def evaluate_case(case_path: Path, ground_truth_path: Path) -> CaseResult:
    case = PatientCase.model_validate_json(case_path.read_text())
    ground_truth = json.loads(ground_truth_path.read_text())

    expected_outcome = ground_truth.get("expected_outcome")
    expected_primary = ground_truth.get("correct_primary_diagnosis")

    t0 = time.monotonic()
    try:
        result = await run_debate(case)
    except Exception as exc:
        elapsed = time.monotonic() - t0
        logger.exception("debate failed for case_id=%s", case.case_id)
        return CaseResult(
            case_id=case.case_id,
            expected_outcome=expected_outcome,
            actual_outcome=None,
            outcome_match=None,
            expected_primary=expected_primary,
            actual_primary=None,
            primary_match=None,
            final_round=None,
            elapsed_seconds=elapsed,
            error=f"{type(exc).__name__}: {exc}",
        )
    elapsed = time.monotonic() - t0

    actual_outcome = result.consensus.outcome
    outcome_match = (
        expected_outcome == actual_outcome if expected_outcome else None
    )

    actual_primary: Optional[str] = None
    primary_match: Optional[bool] = None
    if actual_outcome == "converged":
        actual_primary = result.consensus.output.primary_diagnosis  # type: ignore[union-attr]
        if expected_primary:
            primary_match = _fuzzy_primary_match(expected_primary, actual_primary)

    return CaseResult(
        case_id=case.case_id,
        expected_outcome=expected_outcome,
        actual_outcome=actual_outcome,
        outcome_match=outcome_match,
        expected_primary=expected_primary,
        actual_primary=actual_primary,
        primary_match=primary_match,
        final_round=result.consensus.final_round,
        elapsed_seconds=elapsed,
    )


def _pair_case_files(case_dir: Path) -> list[tuple[Path, Path]]:
    pairs: list[tuple[Path, Path]] = []
    for path in sorted(case_dir.glob("case_*.json")):
        if "_ground_truth" in path.name:
            continue
        gt_path = path.with_name(path.stem + "_ground_truth.json")
        if not gt_path.exists():
            logger.warning("no ground truth sidecar for %s; skipping", path.name)
            continue
        pairs.append((path, gt_path))
    return pairs


async def evaluate_directory(case_dir: Path) -> EvalReport:
    pairs = _pair_case_files(case_dir)
    results: list[CaseResult] = []
    for case_path, gt_path in pairs:
        logger.info("evaluating %s", case_path.name)
        result = await evaluate_case(case_path, gt_path)
        results.append(result)

    converged = [r for r in results if r.actual_outcome == "converged"]
    deadlocked = [r for r in results if r.actual_outcome == "deadlocked"]
    converged_correct = [r for r in converged if r.primary_match]
    correct_deadlocks = [
        r for r in deadlocked if r.expected_outcome == "deadlocked"
    ]

    mean_final_round_converged: Optional[float] = None
    if converged:
        final_rounds = [r.final_round for r in converged if r.final_round is not None]
        if final_rounds:
            mean_final_round_converged = mean(final_rounds)

    return EvalReport(
        total=len(results),
        outcome_match_count=sum(1 for r in results if r.outcome_match),
        converged_count=len(converged),
        deadlocked_count=len(deadlocked),
        converged_correct_count=len(converged_correct),
        correct_deadlock_count=len(correct_deadlocks),
        mean_elapsed_seconds=mean(r.elapsed_seconds for r in results) if results else 0.0,
        mean_final_round_converged=mean_final_round_converged,
        results=results,
    )


def _print_summary(report: EvalReport) -> None:
    print("=" * 70)
    print("ConsensusMD evaluation summary")
    print("=" * 70)
    print(f"Total cases:              {report.total}")
    print(f"Outcome-type matches:     {report.outcome_match_count}/{report.total}")
    print(f"Converged cases:          {report.converged_count}")
    print(f"  of which correct:       {report.converged_correct_count}")
    print(f"Deadlocked cases:         {report.deadlocked_count}")
    print(f"  correct deadlocks:      {report.correct_deadlock_count}")
    if report.mean_final_round_converged is not None:
        print(f"Mean final round (conv):  {report.mean_final_round_converged:.1f}")
    print(f"Mean wall-clock:          {report.mean_elapsed_seconds:.1f}s")
    print()
    print("Per-case:")
    for r in report.results:
        icon = "?" if r.error else ("✓" if r.outcome_match and (r.primary_match or r.expected_outcome == "deadlocked") else "✗")
        extra = f" ({r.actual_primary!r})" if r.actual_primary else ""
        err = f" ERROR: {r.error}" if r.error else ""
        print(
            f"  [{icon}] {r.case_id:30s} expected={r.expected_outcome:10s} "
            f"actual={r.actual_outcome or 'none':10s}{extra}{err}"
        )
    print("=" * 70)


async def _amain() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("case_dir", type=Path)
    parser.add_argument("--out", type=Path, help="Write JSON report to this path")
    args = parser.parse_args()

    report = await evaluate_directory(args.case_dir)
    _print_summary(report)

    if args.out:
        payload = {
            **{k: v for k, v in asdict(report).items() if k != "results"},
            "results": [asdict(r) for r in report.results],
        }
        args.out.write_text(json.dumps(payload, indent=2))
        print(f"\nWrote JSON report to {args.out}")
    return 0


def main() -> int:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )
    return asyncio.run(_amain())


if __name__ == "__main__":
    sys.exit(main())
