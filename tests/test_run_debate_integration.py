"""run_debate integration test with a mocked call_agent.

Locks the debate's event-emission sequence as a contract. A future refactor
that drops an event type or reorders the lifecycle will fail this test.
Does NOT hit real LLM APIs.
"""
from __future__ import annotations

import asyncio
import random

import backend.orchestrator.debate as debate_module
from backend.schemas import (
    AntagonistChallenge,
    AntagonistOutput,
    BaseRateEstimate,
    CannotMissDiagnosis,
    CausalChainStep,
    ConsensusOutput,
    ConvergedOutput,
    Demographics,
    Diagnosis,
    DistinguishingTest,
    EliminativeReasoning,
    IntegratedReasoning,
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


# ---- Fixtures (duplicated from test_debate_state for test isolation) ----


def _case() -> PatientCase:
    return PatientCase(
        case_id="integration-test",
        demographics=Demographics(age=62, sex="M"),
        chief_complaint="Chest pain",
        history_of_present_illness="Sudden onset",
        past_medical_history=[],
        medications=[],
        social_history="",
        family_history="",
        vitals=Vitals(hr=90, bp_systolic=140, bp_diastolic=80, rr=16, spo2=97, temp_c=37.0),
        physical_exam="unremarkable",
        initial_workup={},
    )


def _diag(name="STEMI", commit="leading") -> Diagnosis:
    return Diagnosis(
        diagnosis_name=name,
        icd10_approximate="I21.9",
        commitment=commit,
        supporting_evidence=["ST elevation", "diaphoresis"],
        refuting_evidence=[],
        alternative_explanation_considered="Pericarditis, ruled out by reciprocal depression.",
    )


def _prob_r0() -> SpecialistRound0Output:
    return SpecialistRound0Output(
        differential=[_diag(), _diag("Aortic dissection", "considered")],
        primary_diagnosis="STEMI",
        recommended_next_step="cath",
        reasoning_frame="probabilistic",
        reasoning=ProbabilisticReasoning(
            frame="probabilistic",
            base_rate_estimates=[
                BaseRateEstimate(diagnosis="STEMI", estimated_prevalence="common", population_context="ED"),
                BaseRateEstimate(diagnosis="AD", estimated_prevalence="rare", population_context="ED"),
            ],
            risk_factor_modifiers=[
                RiskFactorModifier(factor="smoking", effect_on_probability="strongly_increases"),
            ],
            posterior_ranking="STEMI dominates.",
        ),
    )


def _mech_r0() -> SpecialistRound0Output:
    return SpecialistRound0Output(
        differential=[_diag(), _diag("Aortic dissection", "considered")],
        primary_diagnosis="STEMI",
        recommended_next_step="cath",
        reasoning_frame="mechanistic",
        reasoning=MechanisticReasoning(
            frame="mechanistic",
            unifying_mechanism="plaque rupture",
            causal_chain=[
                CausalChainStep(step="rupture", explains_findings=["ST elevation"]),
                CausalChainStep(step="infarct", explains_findings=["pain"]),
            ],
            unexplained_findings=[],
        ),
    )


def _elim_r0() -> SpecialistRound0Output:
    return SpecialistRound0Output(
        differential=[_diag(), _diag("Aortic dissection", "considered")],
        primary_diagnosis="STEMI",
        recommended_next_step="cath",
        reasoning_frame="eliminative",
        reasoning=EliminativeReasoning(
            frame="eliminative",
            cannot_miss_diagnoses=[
                CannotMissDiagnosis(
                    diagnosis="STEMI",
                    danger_level="immediately_life_threatening",
                    plausibility_in_this_case="cannot_exclude",
                ),
                CannotMissDiagnosis(
                    diagnosis="AD",
                    danger_level="immediately_life_threatening",
                    plausibility_in_this_case="unlikely",
                ),
            ],
            ruling_out_evidence=[RulingOutEvidence(diagnosis="STEMI", test_or_finding_needed="troponin")],
        ),
    )


def _rn(frame: str) -> SpecialistRoundNOutput:
    r0 = {"probabilistic": _prob_r0, "mechanistic": _mech_r0, "eliminative": _elim_r0}[frame]()
    return SpecialistRoundNOutput(
        differential=r0.differential,
        primary_diagnosis=r0.primary_diagnosis,
        recommended_next_step=r0.recommended_next_step,
        reasoning_frame=r0.reasoning_frame,
        reasoning=r0.reasoning,
        position_change="maintained",
        response_to_challenge=ResponseToChallenge(
            challenge_addressed=True,
            position_justification="maintaining STEMI per EKG",
        ),
    )


def _ncc(round_number: int) -> AntagonistOutput:
    return AntagonistOutput(
        round_number=round_number,
        result=NoCredibleChallenge(
            type="no_credible_challenge",
            explanation="no alternative",
            alternatives_attempted=[],
        ),
    )


def _converged_consensus() -> ConsensusOutput:
    return ConsensusOutput(
        outcome="converged",
        final_round=2,
        output=ConvergedOutput(
            type="converged",
            primary_diagnosis="STEMI",
            commitment="leading",
            integrated_reasoning=IntegratedReasoning(
                probabilistic_view="a",
                mechanistic_view="b",
                eliminative_view="c",
                synthesis="STEMI",
            ),
            supporting_evidence_consolidated=["ST elevation", "diaphoresis"],
            distinguishing_test=DistinguishingTest(
                test_name="troponin + cath",
                expected_finding="occluded vessel",
                rationale="confirms",
            ),
            residual_uncertainty="exact culprit vessel",
        ),
    )


def _run_with_mock(responses):
    """Monkey-patch call_agent in debate module, run, and capture events."""
    call_log = {"idx": 0}

    async def fake_call_agent(**kwargs):
        i = call_log["idx"]
        call_log["idx"] += 1
        return responses[i]

    async def _run():
        events: list[dict] = []

        async def emit(event):
            events.append(event)

        original = debate_module.call_agent
        debate_module.call_agent = fake_call_agent
        try:
            result = await debate_module.run_debate(
                _case(), on_event=emit, rng=random.Random(42)
            )
        finally:
            debate_module.call_agent = original
        return events, result, call_log["idx"]

    return asyncio.run(_run())


def test_run_debate_converges_at_round_2_with_expected_event_sequence():
    # 3 round-0 specialists + NCC round 1 + 3 round-1 specialists + NCC round 2 (converges) + consensus
    responses = [
        _prob_r0(),
        _mech_r0(),
        _elim_r0(),
        _ncc(1),
        _rn("probabilistic"),
        _rn("mechanistic"),
        _rn("eliminative"),
        _ncc(2),
        _converged_consensus(),
    ]
    events, result, call_count = _run_with_mock(responses)

    assert call_count == 9
    assert result.consensus.outcome == "converged"
    assert result.state.survival_count == 2

    types = [e["event"] for e in events]
    # Structural contract: every event type fires the expected number of times.
    assert types[0] == "debate_started"
    assert types[-1] == "debate_complete"
    assert types.count("specialist_output") == 6
    assert types.count("antagonist_output") == 2
    assert types.count("round_completed") == 3
    assert types.count("consensus_started") == 1
    assert types.count("consensus_output") == 1

    # Terminal event reports converged outcome and final round 2.
    assert events[-1]["outcome"] == "converged"
    assert events[-1]["final_round"] == 2


def test_run_debate_deadlocks_at_max_rounds_with_all_challenges():
    def _challenge(rn: int) -> AntagonistOutput:
        return AntagonistOutput(
            round_number=rn,
            result=AntagonistChallenge(
                type="challenge",
                challenged_diagnosis="STEMI",
                proposed_alternative=f"Alt{rn}",
                supporting_finding="something",
                reason_leading_diagnosis_fails="something else",
                challenge_novelty="new_attack",
            ),
        )

    def _deadlock_consensus() -> ConsensusOutput:
        from backend.schemas import CompetingHypothesis, DeadlockOutput

        return ConsensusOutput(
            outcome="deadlocked",
            final_round=4,
            output=DeadlockOutput(
                type="deadlocked",
                competing_hypotheses=[
                    CompetingHypothesis(
                        diagnosis="STEMI",
                        supporting_evidence=["EKG"],
                        distinguishing_test="troponin",
                    ),
                    CompetingHypothesis(
                        diagnosis="Pericarditis",
                        supporting_evidence=["pattern"],
                        distinguishing_test="echo",
                    ),
                ],
                recommended_next_action="specialist referral",
                referral_urgency="urgent",
            ),
        )

    # All antagonists challenge → survival never hits 2 → deadlock at round 4.
    responses = [
        _prob_r0(), _mech_r0(), _elim_r0(),            # Round 0
        _challenge(1), _rn("probabilistic"), _rn("mechanistic"), _rn("eliminative"),
        _challenge(2), _rn("probabilistic"), _rn("mechanistic"), _rn("eliminative"),
        _challenge(3), _rn("probabilistic"), _rn("mechanistic"), _rn("eliminative"),
        _challenge(4), _rn("probabilistic"), _rn("mechanistic"), _rn("eliminative"),
        _deadlock_consensus(),
    ]
    events, result, _ = _run_with_mock(responses)

    assert result.consensus.outcome == "deadlocked"
    assert result.state.survival_count == 0

    types = [e["event"] for e in events]
    assert types.count("specialist_output") == 15  # 3 + 4*3
    assert types.count("antagonist_output") == 4
    assert events[-1]["outcome"] == "deadlocked"
    assert events[-1]["final_round"] == 4


def test_run_debate_skips_specialists_when_converged_at_round_2_antagonist():
    # NCC round 1 → survival 1 → specialists run. NCC round 2 → survival 2 → specialists SKIPPED.
    responses = [
        _prob_r0(), _mech_r0(), _elim_r0(),
        _ncc(1),
        _rn("probabilistic"), _rn("mechanistic"), _rn("eliminative"),
        _ncc(2),  # survival hits 2 here — specialists must NOT be called after this
        _converged_consensus(),
    ]
    events, result, call_count = _run_with_mock(responses)
    # If specialists ran after the round-2 NCC we'd need 12 calls, not 9.
    assert call_count == 9
    assert result.consensus.outcome == "converged"

    # The round_completed for round 2 carries the "converged_before_specialists" note.
    round_completed_notes = [
        e.get("note") for e in events if e["event"] == "round_completed"
    ]
    assert "converged_before_specialists" in round_completed_notes
