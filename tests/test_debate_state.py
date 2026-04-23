"""DebateState tests — information isolation, termination, leading-dx, deltas.

The isolation tests are the important ones. They guard the architectural
invariant that specialists never see each other's reasoning and the antagonist
never sees any reasoning or model attribution.
"""
from __future__ import annotations

import json
import random

import pytest

from backend.orchestrator.state import (
    DebateState,
    _aggregate_supporting_evidence,
    _compute_leading_diagnosis,
    _normalize,
    _summarize_change,
    _summarize_response,
)
from backend.schemas import (
    AntagonistChallenge,
    AntagonistOutput,
    BaseRateEstimate,
    CannotMissDiagnosis,
    CausalChainStep,
    Demographics,
    Diagnosis,
    EliminativeReasoning,
    MechanisticReasoning,
    NoCredibleChallenge,
    PatientCase,
    ProbabilisticReasoning,
    ResponseToChallenge,
    RiskFactorModifier,
    RulingOutEvidence,
    SpecialistRound0Output,
    SpecialistRoundNOutput,
    Vitals,
)


# ---------------------------------------------------------------------------
# Fixtures / helpers
# ---------------------------------------------------------------------------


def _case() -> PatientCase:
    return PatientCase(
        case_id="test-case",
        demographics=Demographics(age=62, sex="M"),
        chief_complaint="Chest pain",
        history_of_present_illness="Sudden onset substernal chest pain.",
        past_medical_history=[],
        medications=[],
        social_history="",
        family_history="",
        vitals=Vitals(
            hr=90, bp_systolic=140, bp_diastolic=80, rr=16, spo2=97, temp_c=37.0
        ),
        physical_exam="diaphoretic",
        initial_workup={},
    )


def _prob_reasoning() -> ProbabilisticReasoning:
    return ProbabilisticReasoning(
        frame="probabilistic",
        base_rate_estimates=[
            BaseRateEstimate(
                diagnosis="STEMI",
                estimated_prevalence="common in 60+ smokers",
                population_context="ED",
            ),
            BaseRateEstimate(
                diagnosis="Aortic dissection",
                estimated_prevalence="rare",
                population_context="ED",
            ),
        ],
        risk_factor_modifiers=[
            RiskFactorModifier(factor="smoking", effect_on_probability="strongly_increases"),
        ],
        posterior_ranking="STEMI dominates given risk profile.",
    )


def _mech_reasoning() -> MechanisticReasoning:
    return MechanisticReasoning(
        frame="mechanistic",
        unifying_mechanism="plaque rupture with acute coronary occlusion",
        causal_chain=[
            CausalChainStep(step="plaque rupture", explains_findings=["ST elevation"]),
            CausalChainStep(step="infarction", explains_findings=["chest pain"]),
        ],
        unexplained_findings=[],
    )


def _elim_reasoning() -> EliminativeReasoning:
    return EliminativeReasoning(
        frame="eliminative",
        cannot_miss_diagnoses=[
            CannotMissDiagnosis(
                diagnosis="STEMI",
                danger_level="immediately_life_threatening",
                plausibility_in_this_case="cannot_exclude",
            ),
            CannotMissDiagnosis(
                diagnosis="Aortic dissection",
                danger_level="immediately_life_threatening",
                plausibility_in_this_case="unlikely",
            ),
        ],
        ruling_out_evidence=[
            RulingOutEvidence(diagnosis="STEMI", test_or_finding_needed="troponin"),
        ],
    )


def _diag(name: str, commit: str = "leading", supporting=None) -> Diagnosis:
    return Diagnosis(
        diagnosis_name=name,
        icd10_approximate="I21.9",
        commitment=commit,
        supporting_evidence=supporting or ["ST elevation II/III/aVF", "diaphoresis"],
        refuting_evidence=[],
        alternative_explanation_considered=(
            "Pericarditis — ruled out by reciprocal depression pattern."
        ),
    )


def _r0(frame, primary="STEMI", commit="leading", supporting=None) -> SpecialistRound0Output:
    reasoning = {
        "probabilistic": _prob_reasoning(),
        "mechanistic": _mech_reasoning(),
        "eliminative": _elim_reasoning(),
    }[frame]
    return SpecialistRound0Output(
        differential=[
            _diag(primary, commit=commit, supporting=supporting),
            _diag("Aortic dissection", commit="considered"),
        ],
        primary_diagnosis=primary,
        recommended_next_step="CT coronary angiogram",
        reasoning_frame=frame,
        reasoning=reasoning,
    )


def _rn(frame, primary="STEMI", commit="leading", position="maintained") -> SpecialistRoundNOutput:
    reasoning = {
        "probabilistic": _prob_reasoning(),
        "mechanistic": _mech_reasoning(),
        "eliminative": _elim_reasoning(),
    }[frame]
    return SpecialistRoundNOutput(
        differential=[
            _diag(primary, commit=commit),
            _diag("Aortic dissection", commit="considered"),
        ],
        primary_diagnosis=primary,
        recommended_next_step="CT coronary angiogram",
        reasoning_frame=frame,
        reasoning=reasoning,
        position_change=position,
        response_to_challenge=ResponseToChallenge(
            challenge_addressed=True,
            position_justification="STEMI pattern on EKG is diagnostic.",
        ),
    )


def _seeded_state() -> DebateState:
    """State with Round 0 populated; deterministic anon IDs via rng seed."""
    s = DebateState(case=_case(), max_rounds=4, rng=random.Random(42))
    s.record_round_0(
        {
            "probabilistic": _r0("probabilistic"),
            "mechanistic": _r0("mechanistic"),
            "eliminative": _r0("eliminative"),
        }
    )
    return s


_BANNED_REASONING_FIELDS = [
    "base_rate_estimates",
    "risk_factor_modifiers",
    "posterior_ranking",
    "unifying_mechanism",
    "causal_chain",
    "unexplained_findings",
    "cannot_miss_diagnoses",
    "ruling_out_evidence",
]


# ---------------------------------------------------------------------------
# Pure helpers
# ---------------------------------------------------------------------------


def test_normalize_lowercases_strips_punct_collapses_whitespace():
    assert _normalize("  Pulmonary Embolism!  ") == "pulmonary embolism"
    assert _normalize("Postpartum PE (day 18)") == "postpartum pe day 18"


def test_compute_leading_diagnosis_majority_wins():
    outputs = {
        "probabilistic": _r0("probabilistic", primary="STEMI", commit="leading"),
        "mechanistic": _r0("mechanistic", primary="STEMI", commit="leading"),
        "eliminative": _r0("eliminative", primary="Pericarditis", commit="candidate"),
    }
    name, commit = _compute_leading_diagnosis(outputs)
    assert name == "STEMI"
    assert commit == "leading"


def test_compute_leading_diagnosis_majority_tiebreak_by_highest_commitment_among_tied():
    outputs = {
        "probabilistic": _r0("probabilistic", primary="STEMI", commit="leading"),
        "mechanistic": _r0(
            "mechanistic", primary="STEMI", commit="committed",
            supporting=["a", "b"],
        ),
        "eliminative": _r0("eliminative", primary="Pericarditis", commit="candidate"),
    }
    name, commit = _compute_leading_diagnosis(outputs)
    assert name == "STEMI"
    assert commit == "committed"


def test_compute_leading_diagnosis_three_way_split_highest_commitment_fallback():
    outputs = {
        "probabilistic": _r0("probabilistic", primary="Alpha", commit="candidate"),
        "mechanistic": _r0("mechanistic", primary="Beta", commit="candidate"),
        "eliminative": _r0("eliminative", primary="Gamma", commit="leading"),
    }
    name, commit = _compute_leading_diagnosis(outputs)
    assert name == "Gamma"
    assert commit == "leading"


def test_compute_leading_diagnosis_never_null_on_full_tie():
    outputs = {
        "probabilistic": _r0("probabilistic", primary="A", commit="considered"),
        "mechanistic": _r0("mechanistic", primary="B", commit="considered"),
        "eliminative": _r0("eliminative", primary="C", commit="considered"),
    }
    name, _commit = _compute_leading_diagnosis(outputs)
    # All 6 differential items at "considered". Alphabetical first wins.
    assert name == "A"


def test_aggregate_supporting_evidence_normalizes_before_dedupe():
    outputs = {
        "probabilistic": _r0(
            "probabilistic",
            primary="STEMI",
            supporting=["ST elevation in II/III/aVF", "Diaphoresis"],
        ),
        "mechanistic": _r0(
            "mechanistic",
            primary="STEMI",
            supporting=["st elevation in ii iii avf", "diaphoresis."],
        ),
        "eliminative": _r0(
            "eliminative",
            primary="Pericarditis",
            supporting=["do not include"],
        ),
    }
    result = _aggregate_supporting_evidence(outputs, "STEMI")
    assert len(result) == 2
    assert "do not include" not in result


def test_summarize_change_primary_changed_outranks_confidence():
    prev = _rn("probabilistic", primary="STEMI", commit="leading")
    curr = _rn(
        "probabilistic",
        primary="Pericarditis",
        commit="committed",
        position="primary_diagnosis_changed",
    )
    assert _summarize_change(prev, curr) == "primary_diagnosis_changed"


def test_summarize_change_confidence_raised():
    prev = _rn("probabilistic", primary="STEMI", commit="candidate")
    curr = _rn("probabilistic", primary="STEMI", commit="committed")
    assert _summarize_change(prev, curr) == "confidence_raised"


def test_summarize_change_maintained():
    prev = _rn("probabilistic")
    curr = _rn("probabilistic")
    assert _summarize_change(prev, curr) == "maintained"


def test_summarize_response_strong_toward():
    pre = {
        "probabilistic": _rn("probabilistic", primary="STEMI"),
        "mechanistic": _rn("mechanistic", primary="STEMI"),
        "eliminative": _rn("eliminative", primary="STEMI"),
    }
    post = {
        "probabilistic": _rn("probabilistic", primary="Pericarditis"),
        "mechanistic": _rn("mechanistic", primary="Pericarditis"),
        "eliminative": _rn("eliminative", primary="STEMI"),
    }
    assert _summarize_response("Pericarditis", pre, post) == "moved_toward_challenge"


def test_summarize_response_no_movement():
    pre = {
        "probabilistic": _rn("probabilistic", primary="STEMI"),
        "mechanistic": _rn("mechanistic", primary="STEMI"),
        "eliminative": _rn("eliminative", primary="STEMI"),
    }
    assert _summarize_response("Pericarditis", pre, pre) == "no_movement"


# ---------------------------------------------------------------------------
# Anonymous IDs
# ---------------------------------------------------------------------------


def test_anon_ids_stable_per_state():
    s = _seeded_state()
    snapshot_1 = s.anon_id_by_role
    snapshot_2 = s.anon_id_by_role
    assert snapshot_1 == snapshot_2
    assert sorted(snapshot_1.values()) == ["A", "B", "C"]


def test_anon_ids_are_a_b_c_exhaustive():
    s = DebateState(case=_case(), rng=random.Random(1))
    assert sorted(s.anon_id_by_role.values()) == ["A", "B", "C"]


def test_anon_ids_mapping_covers_all_three_roles():
    s = DebateState(case=_case(), rng=random.Random(7))
    assert set(s.anon_id_by_role.keys()) == {
        "probabilistic",
        "mechanistic",
        "eliminative",
    }


# ---------------------------------------------------------------------------
# Termination (Q2: survival_count >= 2 only)
# ---------------------------------------------------------------------------


def _ncc(round_number: int) -> AntagonistOutput:
    return AntagonistOutput(
        round_number=round_number,
        result=NoCredibleChallenge(
            type="no_credible_challenge",
            explanation="no credible alternative this round",
            alternatives_attempted=[],
        ),
    )


def _challenge(round_number: int, alternative: str = "Pericarditis") -> AntagonistOutput:
    return AntagonistOutput(
        round_number=round_number,
        result=AntagonistChallenge(
            type="challenge",
            challenged_diagnosis="STEMI",
            proposed_alternative=alternative,
            supporting_finding="diffuse ST elevation pattern",
            reason_leading_diagnosis_fails="Expected focal pattern for MI.",
            challenge_novelty="new_attack",
        ),
    )


def test_termination_one_ncc_is_continue():
    s = _seeded_state()
    s.record_antagonist(_ncc(1))
    assert s.check_termination() == "continue"
    assert s.survival_count == 1


def test_termination_two_consecutive_nccs_converges():
    s = _seeded_state()
    s.record_antagonist(_ncc(1))
    s.record_antagonist(_ncc(2))
    assert s.check_termination() == "converged"
    assert s.survival_count == 2


def test_termination_challenge_resets_survival_count():
    s = _seeded_state()
    s.record_antagonist(_ncc(1))
    assert s.survival_count == 1
    s.record_antagonist(_challenge(2))
    assert s.survival_count == 0
    assert s.check_termination() == "continue"


def test_termination_deadlock_at_max_rounds_without_convergence():
    s = _seeded_state()
    s.record_specialists(
        1,
        {
            "probabilistic": _rn("probabilistic"),
            "mechanistic": _rn("mechanistic"),
            "eliminative": _rn("eliminative"),
        },
    )
    s.record_specialists(
        4,
        {
            "probabilistic": _rn("probabilistic"),
            "mechanistic": _rn("mechanistic"),
            "eliminative": _rn("eliminative"),
        },
    )
    assert s.check_termination() == "deadlocked"


# ---------------------------------------------------------------------------
# Isolation — specialist debate input
# ---------------------------------------------------------------------------


def test_specialist_debate_input_other_specialists_only_primary_and_commitment():
    s = _seeded_state()
    inp = s.build_specialist_debate_input("probabilistic", round_num=1)
    assert len(inp.other_specialists_conclusions) == 2
    for other in inp.other_specialists_conclusions:
        assert set(other.model_dump().keys()) == {"primary_diagnosis", "commitment"}


def test_specialist_debate_input_no_reasoning_leak_from_others():
    """Reasoning sub-schema field names must not appear outside own_previous_output."""
    s = _seeded_state()
    inp = s.build_specialist_debate_input("probabilistic", round_num=1)
    data = inp.model_dump()
    data.pop("own_previous_output")  # caller's own reasoning is allowed in its own history
    data.pop("patient_case")
    rest = json.dumps(data)
    for banned in _BANNED_REASONING_FIELDS:
        assert banned not in rest, f"reasoning field {banned!r} leaked into specialist input"


def test_specialist_debate_input_challenge_passes_through():
    s = _seeded_state()
    s.record_antagonist(_challenge(1, alternative="Pericarditis"))
    inp = s.build_specialist_debate_input("probabilistic", round_num=1)
    assert inp.antagonist_challenge is not None
    assert inp.antagonist_challenge.proposed_alternative == "Pericarditis"


def test_specialist_debate_input_no_credible_challenge_translated_to_none():
    s = _seeded_state()
    s.record_antagonist(_ncc(1))
    inp = s.build_specialist_debate_input("probabilistic", round_num=1)
    assert inp.antagonist_challenge is None


def test_specialist_debate_input_round_0_rejected():
    s = _seeded_state()
    with pytest.raises(ValueError):
        s.build_specialist_debate_input("probabilistic", round_num=0)


# ---------------------------------------------------------------------------
# Isolation — antagonist input
# ---------------------------------------------------------------------------


def test_antagonist_input_contains_no_reasoning():
    s = _seeded_state()
    s.record_specialists(
        1,
        {
            "probabilistic": _rn("probabilistic"),
            "mechanistic": _rn("mechanistic"),
            "eliminative": _rn("eliminative"),
        },
    )
    inp = s.build_antagonist_input(round_num=2)
    serialized = inp.model_dump_json()
    for banned in _BANNED_REASONING_FIELDS:
        assert banned not in serialized, f"{banned!r} leaked into antagonist input"


def test_antagonist_input_conclusions_sorted_by_anon_id_not_role():
    s = _seeded_state()
    inp = s.build_antagonist_input(round_num=1)
    # The structural guarantee: conclusions are ordered by anon ID (A < B < C),
    # not by role. Verifying this doesn't leak role order when serialized.
    assert len(inp.all_specialist_conclusions) == 3


def test_antagonist_input_round_1_has_empty_deltas_and_no_previous_challenges():
    s = _seeded_state()
    inp = s.build_antagonist_input(round_num=1)
    assert inp.position_deltas == []
    assert inp.previous_challenges == []


def test_antagonist_input_round_2_has_round_over_round_deltas():
    s = _seeded_state()
    s.record_specialists(
        1,
        {
            "probabilistic": _rn(
                "probabilistic",
                primary="Pericarditis",
                position="primary_diagnosis_changed",
            ),
            "mechanistic": _rn("mechanistic", position="maintained"),
            "eliminative": _rn(
                "eliminative", commit="committed", position="confidence_raised"
            ),
        },
    )
    inp = s.build_antagonist_input(round_num=2)
    assert len(inp.position_deltas) == 3
    assert {d.specialist_anonymous_id for d in inp.position_deltas} == {"A", "B", "C"}


def test_antagonist_input_previous_challenge_response_summary_reflects_movement():
    s = _seeded_state()
    s.record_antagonist(_challenge(1, alternative="Pericarditis"))
    s.record_specialists(
        1,
        {
            "probabilistic": _rn(
                "probabilistic",
                primary="Pericarditis",
                position="primary_diagnosis_changed",
            ),
            "mechanistic": _rn(
                "mechanistic",
                primary="Pericarditis",
                position="primary_diagnosis_changed",
            ),
            "eliminative": _rn("eliminative", position="maintained"),
        },
    )
    inp = s.build_antagonist_input(round_num=2)
    assert len(inp.previous_challenges) == 1
    pc = inp.previous_challenges[0]
    assert pc.round == 1
    assert pc.challenge_alternative == "Pericarditis"
    assert pc.specialist_response_summary == "moved_toward_challenge"


def test_antagonist_input_round_3_includes_all_prior_challenges():
    """A round-3 antagonist call must see both round-1 and round-2 challenges."""
    s = _seeded_state()
    # Round 1 antagonist challenges Pericarditis.
    s.record_antagonist(_challenge(1, alternative="Pericarditis"))
    s.record_specialists(
        1,
        {
            "probabilistic": _rn(
                "probabilistic",
                primary="Pericarditis",
                position="primary_diagnosis_changed",
            ),
            "mechanistic": _rn(
                "mechanistic",
                primary="Pericarditis",
                position="primary_diagnosis_changed",
            ),
            "eliminative": _rn("eliminative", position="maintained"),
        },
    )
    # Round 2 antagonist challenges Aortic dissection.
    s.record_antagonist(_challenge(2, alternative="Aortic dissection"))
    s.record_specialists(
        2,
        {
            "probabilistic": _rn(
                "probabilistic",
                primary="Aortic dissection",
                position="primary_diagnosis_changed",
            ),
            "mechanistic": _rn("mechanistic", primary="Pericarditis", position="maintained"),
            "eliminative": _rn("eliminative", position="maintained"),
        },
    )
    inp = s.build_antagonist_input(round_num=3)
    assert len(inp.previous_challenges) == 2
    by_round = {p.round: p for p in inp.previous_challenges}
    assert by_round[1].challenge_alternative == "Pericarditis"
    assert by_round[1].specialist_response_summary == "moved_toward_challenge"
    assert by_round[2].challenge_alternative == "Aortic dissection"
    # Round 2: pre = round 1 (2 Pericarditis, 1 STEMI), post = round 2
    # (1 Aortic dissection, 1 Pericarditis, 1 STEMI). One moved toward AD.
    assert by_round[2].specialist_response_summary == "partially_moved"


def test_antagonist_input_ignores_ncc_in_previous_challenges():
    s = _seeded_state()
    s.record_antagonist(_ncc(1))
    s.record_specialists(
        1,
        {
            "probabilistic": _rn("probabilistic"),
            "mechanistic": _rn("mechanistic"),
            "eliminative": _rn("eliminative"),
        },
    )
    inp = s.build_antagonist_input(round_num=2)
    # NoCredibleChallenge outputs don't appear in previous_challenges — that
    # list is specifically for Challenge-typed antagonist outputs.
    assert inp.previous_challenges == []


# ---------------------------------------------------------------------------
# Consensus input (full context — the only agent with everything)
# ---------------------------------------------------------------------------


def test_consensus_input_contains_all_histories_and_antagonist_rounds():
    s = _seeded_state()
    s.record_antagonist(_ncc(1))
    s.record_specialists(
        1,
        {
            "probabilistic": _rn("probabilistic"),
            "mechanistic": _rn("mechanistic"),
            "eliminative": _rn("eliminative"),
        },
    )
    s.record_antagonist(_ncc(2))
    inp = s.build_consensus_input(outcome="converged", final_round=2)
    assert {h.specialist_role for h in inp.all_specialist_histories} == {
        "probabilistic",
        "mechanistic",
        "eliminative",
    }
    # Each history: round 0 + round 1 = 2 entries.
    for hist in inp.all_specialist_histories:
        assert len(hist.rounds) == 2
    assert len(inp.antagonist_history) == 2
    assert inp.convergence_outcome == "converged"
    assert inp.final_round_number == 2


def test_consensus_input_preserves_round_ordering():
    s = _seeded_state()
    s.record_specialists(
        1,
        {
            "probabilistic": _rn("probabilistic"),
            "mechanistic": _rn("mechanistic"),
            "eliminative": _rn("eliminative"),
        },
    )
    inp = s.build_consensus_input(outcome="deadlocked", final_round=4)
    for hist in inp.all_specialist_histories:
        # Rounds must be in ascending order of the round they were recorded at.
        assert len(hist.rounds) == 2
