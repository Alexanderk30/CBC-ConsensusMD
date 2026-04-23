"""DebateState — accumulated debate state + isolation-enforcing input builders.

This module is the information-isolation boundary. The `build_*_input`
methods are the ONLY place where policy on what each agent sees is enforced:

  - Specialists see the other specialists' primary + commitment only
    (never their reasoning).
  - Antagonist sees conclusions, anonymous A/B/C deltas, and prior challenges
    (never any specialist reasoning, never model identity).
  - Consensus sees the full picture.

Agent calls in `debate.py` must go through these builders — constructing an
agent input by hand elsewhere bypasses the isolation guarantee.

Resolutions encoded here:
  Q2 — termination is survival_count >= 2 only.
  Q3 — leading diagnosis: majority → highest-commitment-among-tied → alphabetical.
       3-way split fallback: highest commitment across any specialist's full
       differential, then alphabetical. Never null.
  Q4 — supporting_evidence_summary aggregates across specialists whose
       primary == leading, with normalization (lowercase, strip punct,
       collapse whitespace) before dedupe.
  Q5 — position_deltas round-over-round (N-1 vs N-2), empty in Round 1.
"""
from __future__ import annotations

import random
import re
import unicodedata
from collections import Counter
from typing import Literal, Optional

from backend.schemas import (
    AntagonistChallenge,
    AntagonistInput,
    AntagonistOutput,
    ChangeType,
    CommitmentLevel,
    ConsensusInput,
    ConvergenceOutcome,
    LeadingDiagnosisBrief,
    LeadingDiagnosisForAntagonist,
    OtherSpecialistConclusion,
    PatientCase,
    PositionDelta,
    PreviousChallenge,
    SpecialistAnonymousId,
    SpecialistConclusionAnon,
    SpecialistDebateInput,
    SpecialistHistory,
    SpecialistResponseSummary,
    SpecialistRound0Output,
    SpecialistRoundNOutput,
    SpecialistRoundOutputAny,
)


ReasoningFrame = Literal["probabilistic", "mechanistic", "eliminative"]
TerminationState = Literal["converged", "continue", "deadlocked"]

_ROLES: tuple[ReasoningFrame, ...] = ("probabilistic", "mechanistic", "eliminative")
_ANON_IDS: tuple[SpecialistAnonymousId, ...] = ("A", "B", "C")

_COMMITMENT_RANK: dict[CommitmentLevel, int] = {
    "committed": 3,
    "leading": 2,
    "candidate": 1,
    "considered": 0,
}


# ---------------------------------------------------------------------------
# Pure helpers (no state)
# ---------------------------------------------------------------------------


def _normalize(text: str) -> str:
    """Lowercase, strip punctuation, collapse whitespace (Q4 normalization)."""
    text = unicodedata.normalize("NFKD", text.lower())
    text = re.sub(r"[^\w\s]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _compute_leading_diagnosis(
    specialist_outputs: dict[ReasoningFrame, SpecialistRoundOutputAny],
) -> tuple[str, CommitmentLevel]:
    """Leading diagnosis computation per Q3. Never returns null."""
    primaries: list[tuple[str, CommitmentLevel]] = [
        (out.primary_diagnosis, out.differential[0].commitment)
        for out in specialist_outputs.values()
    ]
    counts = Counter(dx for dx, _ in primaries)
    max_count = max(counts.values())

    if max_count >= 2:
        tied = [dx for dx, c in counts.items() if c == max_count]

        def _tied_key(dx: str) -> tuple[int, str]:
            best_rank = max(
                _COMMITMENT_RANK[commit] for name, commit in primaries if name == dx
            )
            return (-best_rank, dx.lower())

        tied.sort(key=_tied_key)
        chosen = tied[0]
        chosen_commit = max(
            (commit for name, commit in primaries if name == chosen),
            key=lambda c: _COMMITMENT_RANK[c],
        )
        return chosen, chosen_commit

    # 3-way split fallback: scan full differentials.
    all_diagnoses: list[tuple[str, CommitmentLevel]] = []
    for out in specialist_outputs.values():
        for diag in out.differential:
            all_diagnoses.append((diag.diagnosis_name, diag.commitment))
    all_diagnoses.sort(
        key=lambda pair: (-_COMMITMENT_RANK[pair[1]], pair[0].lower())
    )
    return all_diagnoses[0]


def _aggregate_supporting_evidence(
    specialist_outputs: dict[ReasoningFrame, SpecialistRoundOutputAny],
    leading_diagnosis: str,
) -> list[str]:
    """Dedupe-by-normalization aggregation across specialists whose primary ==
    leading. Preserves first-seen surface form."""
    seen_norm: set[str] = set()
    result: list[str] = []
    leading_norm = _normalize(leading_diagnosis)
    for out in specialist_outputs.values():
        if _normalize(out.primary_diagnosis) != leading_norm:
            continue
        for ev in out.differential[0].supporting_evidence:
            norm = _normalize(ev)
            if norm and norm not in seen_norm:
                seen_norm.add(norm)
                result.append(ev)
    return result


def _summarize_change(
    prev_out: SpecialistRoundOutputAny,
    curr_out: SpecialistRoundOutputAny,
) -> ChangeType:
    prev_primary = _normalize(prev_out.primary_diagnosis)
    curr_primary = _normalize(curr_out.primary_diagnosis)
    prev_rank = _COMMITMENT_RANK[prev_out.differential[0].commitment]
    curr_rank = _COMMITMENT_RANK[curr_out.differential[0].commitment]

    if prev_primary != curr_primary:
        return "primary_diagnosis_changed"
    if curr_rank > prev_rank:
        return "confidence_raised"
    if curr_rank < prev_rank:
        return "confidence_lowered"
    prev_order = [_normalize(d.diagnosis_name) for d in prev_out.differential]
    curr_order = [_normalize(d.diagnosis_name) for d in curr_out.differential]
    if prev_order != curr_order:
        return "differential_reordered"
    return "maintained"


def _summarize_response(
    proposed_alternative: str,
    pre_outputs: dict[ReasoningFrame, SpecialistRoundOutputAny],
    post_outputs: dict[ReasoningFrame, SpecialistRoundOutputAny],
) -> SpecialistResponseSummary:
    """Heuristic mapping of specialist movement → response summary enum."""
    target = _normalize(proposed_alternative)
    moves_toward = 0
    moves_away = 0
    for role in pre_outputs:
        pre_p = _normalize(pre_outputs[role].primary_diagnosis)
        post_p = _normalize(post_outputs[role].primary_diagnosis)
        if pre_p != target and post_p == target:
            moves_toward += 1
        elif pre_p == target and post_p != target:
            moves_away += 1
    if moves_toward >= 2:
        return "moved_toward_challenge"
    if moves_toward >= 1:
        return "partially_moved"
    if moves_away >= 1:
        return "moved_away_from_challenge"
    return "no_movement"


# ---------------------------------------------------------------------------
# DebateState
# ---------------------------------------------------------------------------


class DebateState:
    """Accumulates debate state; builds isolation-enforcing agent inputs."""

    def __init__(
        self,
        case: PatientCase,
        max_rounds: int = 4,
        *,
        rng: Optional[random.Random] = None,
    ) -> None:
        self.case = case
        self.max_rounds = max_rounds
        self.current_round: int = 0
        self._survival_count: int = 0

        self._specialist_rounds: dict[
            ReasoningFrame, dict[int, SpecialistRoundOutputAny]
        ] = {r: {} for r in _ROLES}
        self._antagonist_rounds: dict[int, AntagonistOutput] = {}

        roles = list(_ROLES)
        (rng or random.Random()).shuffle(roles)
        self._anon_id_by_role: dict[ReasoningFrame, SpecialistAnonymousId] = dict(
            zip(roles, _ANON_IDS)
        )

    # ---- Recorders ----

    def record_round_0(
        self, outputs: dict[ReasoningFrame, SpecialistRound0Output]
    ) -> None:
        if set(outputs.keys()) != set(_ROLES):
            raise ValueError(
                f"record_round_0 requires all three roles; got {list(outputs.keys())!r}"
            )
        for role, out in outputs.items():
            self._specialist_rounds[role][0] = out
        self.current_round = 0

    def record_antagonist(self, output: AntagonistOutput) -> None:
        self._antagonist_rounds[output.round_number] = output
        if output.result.type == "no_credible_challenge":
            self._survival_count += 1
        else:
            self._survival_count = 0
        self.current_round = max(self.current_round, output.round_number)

    def record_specialists(
        self,
        round_num: int,
        outputs: dict[ReasoningFrame, SpecialistRoundNOutput],
    ) -> None:
        if round_num < 1:
            raise ValueError("record_specialists requires round_num >= 1")
        if set(outputs.keys()) != set(_ROLES):
            raise ValueError(
                f"record_specialists requires all three roles; got {list(outputs.keys())!r}"
            )
        for role, out in outputs.items():
            self._specialist_rounds[role][round_num] = out
        self.current_round = max(self.current_round, round_num)

    # ---- Read-only state ----

    @property
    def survival_count(self) -> int:
        return self._survival_count

    @property
    def anon_id_by_role(self) -> dict[ReasoningFrame, SpecialistAnonymousId]:
        return dict(self._anon_id_by_role)

    def check_termination(self) -> TerminationState:
        """Convergence vs. deadlock vs. continue.

        Note: `run_debate` reaches deadlock by falling off the for-loop
        (no explicit check_termination call inside the loop). The deadlock
        branch here is defensive — useful for external callers querying
        state after the fact, and kept green by `test_termination_deadlock_at_max_rounds_without_convergence`.
        """
        if self._survival_count >= 2:
            return "converged"
        if self.current_round >= self.max_rounds and self.current_round > 0:
            return "deadlocked"
        return "continue"

    def latest_specialist_outputs(
        self,
    ) -> dict[ReasoningFrame, SpecialistRoundOutputAny]:
        result: dict[ReasoningFrame, SpecialistRoundOutputAny] = {}
        for role, per_round in self._specialist_rounds.items():
            if not per_round:
                raise RuntimeError(
                    f"No specialist outputs recorded for role={role!r}."
                )
            result[role] = per_round[max(per_round.keys())]
        return result

    def specialist_outputs_at_round(
        self, round_num: int
    ) -> dict[ReasoningFrame, SpecialistRoundOutputAny]:
        result: dict[ReasoningFrame, SpecialistRoundOutputAny] = {}
        for role, per_round in self._specialist_rounds.items():
            if round_num not in per_round:
                raise RuntimeError(
                    f"No specialist output for role={role!r} at round={round_num}."
                )
            result[role] = per_round[round_num]
        return result

    def current_leading_diagnosis(self) -> tuple[str, CommitmentLevel]:
        return _compute_leading_diagnosis(self.latest_specialist_outputs())

    # ---- Input builders (isolation boundary) ----

    def build_specialist_debate_input(
        self, role: ReasoningFrame, round_num: int
    ) -> SpecialistDebateInput:
        """Round >= 1 input for a specialist.

        Isolation: other specialists contribute only primary + commitment.
        Antagonist output translated per the SpecialistDebateInput contract —
        AntagonistChallenge stays, NoCredibleChallenge becomes None.
        """
        if round_num < 1:
            raise ValueError("build_specialist_debate_input requires round_num >= 1")

        prev_round = round_num - 1
        prev_outputs = self.specialist_outputs_at_round(prev_round)
        own_prev = prev_outputs[role]
        leading_name, leading_commit = _compute_leading_diagnosis(prev_outputs)

        others = [
            OtherSpecialistConclusion(
                primary_diagnosis=out.primary_diagnosis,
                commitment=out.differential[0].commitment,
            )
            for other_role, out in prev_outputs.items()
            if other_role != role
        ]

        antag = self._antagonist_rounds.get(round_num)
        challenge: Optional[AntagonistChallenge] = None
        if antag is not None and isinstance(antag.result, AntagonistChallenge):
            challenge = antag.result

        return SpecialistDebateInput(
            patient_case=self.case,
            own_previous_output=own_prev,
            current_leading_diagnosis=LeadingDiagnosisBrief(
                diagnosis_name=leading_name, commitment=leading_commit
            ),
            other_specialists_conclusions=others,
            antagonist_challenge=challenge,
            round_number=round_num,
        )

    def build_antagonist_input(self, round_num: int) -> AntagonistInput:
        """Round >= 1 input for the antagonist.

        Isolation: no reasoning, no model attribution. Position deltas use
        anonymous A/B/C IDs; conclusions are ordered by those anonymous IDs
        so role order can't be inferred from position.
        """
        if round_num < 1:
            raise ValueError("build_antagonist_input requires round_num >= 1")

        prev_round = round_num - 1
        prev_outputs = self.specialist_outputs_at_round(prev_round)
        leading_name, leading_commit = _compute_leading_diagnosis(prev_outputs)
        supporting = _aggregate_supporting_evidence(prev_outputs, leading_name)

        conclusions_by_anon: list[
            tuple[SpecialistAnonymousId, SpecialistConclusionAnon]
        ] = [
            (
                self._anon_id_by_role[role],
                SpecialistConclusionAnon(
                    primary_diagnosis=out.primary_diagnosis,
                    commitment=out.differential[0].commitment,
                ),
            )
            for role, out in prev_outputs.items()
        ]
        conclusions_by_anon.sort(key=lambda pair: pair[0])
        all_conclusions = [c for _, c in conclusions_by_anon]

        # Round-over-round deltas (Q5): empty in Round 1.
        deltas: list[PositionDelta] = []
        if round_num >= 2:
            try:
                older_outputs = self.specialist_outputs_at_round(round_num - 2)
            except RuntimeError:
                older_outputs = None
            if older_outputs is not None:
                for role, curr_out in prev_outputs.items():
                    prev_out = older_outputs[role]
                    deltas.append(
                        PositionDelta(
                            specialist_anonymous_id=self._anon_id_by_role[role],
                            change_type=_summarize_change(prev_out, curr_out),
                            previous_primary=prev_out.primary_diagnosis,
                            current_primary=curr_out.primary_diagnosis,
                        )
                    )
                deltas.sort(key=lambda d: d.specialist_anonymous_id)

        # Previous challenges: all Challenge-typed antagonist outputs from
        # rounds < round_num, paired with the specialists' observed response.
        previous_challenges: list[PreviousChallenge] = []
        for r in sorted(self._antagonist_rounds.keys()):
            if r >= round_num:
                continue
            antag = self._antagonist_rounds[r]
            if not isinstance(antag.result, AntagonistChallenge):
                continue
            try:
                before = self.specialist_outputs_at_round(r - 1)
                after = self.specialist_outputs_at_round(r)
            except RuntimeError:
                continue
            summary = _summarize_response(
                antag.result.proposed_alternative, before, after
            )
            previous_challenges.append(
                PreviousChallenge(
                    round=r,
                    challenge_alternative=antag.result.proposed_alternative,
                    specialist_response_summary=summary,
                )
            )

        return AntagonistInput(
            patient_case=self.case,
            current_leading_diagnosis=LeadingDiagnosisForAntagonist(
                diagnosis_name=leading_name,
                commitment=leading_commit,
                supporting_evidence_summary=supporting,
            ),
            all_specialist_conclusions=all_conclusions,
            position_deltas=deltas,
            previous_challenges=previous_challenges,
            round_number=round_num,
        )

    def build_consensus_input(
        self, outcome: ConvergenceOutcome, final_round: int
    ) -> ConsensusInput:
        """Full debate context. Consensus is the only agent with everything."""
        histories: list[SpecialistHistory] = []
        for role in _ROLES:
            rounds_map = self._specialist_rounds[role]
            rounds_list = [rounds_map[r] for r in sorted(rounds_map.keys())]
            histories.append(
                SpecialistHistory(specialist_role=role, rounds=rounds_list)
            )

        antagonist_history = [
            self._antagonist_rounds[r]
            for r in sorted(self._antagonist_rounds.keys())
        ]

        return ConsensusInput(
            patient_case=self.case,
            all_specialist_histories=histories,
            antagonist_history=antagonist_history,
            convergence_outcome=outcome,
            final_round_number=final_round,
        )


__all__ = [
    "DebateState",
    "TerminationState",
    "ReasoningFrame",
]
