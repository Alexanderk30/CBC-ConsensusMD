"""Schema validation tests.

One positive + one negative per rule stated in consensusmd_schemas.md.
"""
from __future__ import annotations

import pytest
from pydantic import ValidationError

from backend.schemas import (
    AntagonistChallenge,
    AntagonistInput,
    AntagonistOutput,
    BaseRateEstimate,
    CannotMissDiagnosis,
    CausalChainStep,
    ChallengeAddressed,
    CompetingHypothesis,
    ConsensusOutput,
    ConvergedOutput,
    DeadlockOutput,
    Demographics,
    Diagnosis,
    DistinguishingTest,
    EliminativeReasoning,
    IntegratedReasoning,
    LeadingDiagnosisBrief,
    LeadingDiagnosisForAntagonist,
    MechanisticReasoning,
    NarrativeCriteriaCheck,
    NoCredibleChallenge,
    OtherSpecialistConclusion,
    PatientCase,
    PositionDelta,
    PreviousChallenge,
    ProbabilisticReasoning,
    ResponseToChallenge,
    RiskFactorModifier,
    RulingOutEvidence,
    SpecialistConclusionAnon,
    SpecialistDebateInput,
    SpecialistRound0Output,
    SpecialistRoundNOutput,
    Vitals,
)


# ---------------------------------------------------------------------------
# Fixtures / helpers
# ---------------------------------------------------------------------------


def _valid_diagnosis(**overrides) -> Diagnosis:
    defaults = dict(
        diagnosis_name="Pulmonary embolism",
        icd10_approximate="I26.9",
        commitment="leading",
        supporting_evidence=["SpO2 94%"],
        refuting_evidence=[],
        alternative_explanation_considered="Anxiety, but does not explain hypoxia.",
    )
    defaults.update(overrides)
    return Diagnosis(**defaults)


def _probabilistic_reasoning() -> ProbabilisticReasoning:
    return ProbabilisticReasoning(
        frame="probabilistic",
        base_rate_estimates=[
            BaseRateEstimate(
                diagnosis="PE",
                estimated_prevalence="~5x elevated postpartum",
                population_context="Postpartum women",
            ),
            BaseRateEstimate(
                diagnosis="Anxiety",
                estimated_prevalence="Common",
                population_context="Postpartum women",
            ),
        ],
        risk_factor_modifiers=[
            RiskFactorModifier(
                factor="Postpartum day 18",
                effect_on_probability="strongly_increases",
            ),
        ],
        posterior_ranking="Postpartum state raises PE posterior above anxiety.",
    )


def _mechanistic_reasoning() -> MechanisticReasoning:
    return MechanisticReasoning(
        frame="mechanistic",
        unifying_mechanism="Pulmonary arterial occlusion",
        causal_chain=[
            CausalChainStep(
                step="DVT forms in postpartum state",
                explains_findings=["postpartum risk"],
            ),
            CausalChainStep(
                step="Clot embolizes to pulmonary artery",
                explains_findings=["hypoxia", "tachycardia"],
            ),
        ],
        unexplained_findings=["self-reported anxiety"],
    )


def _eliminative_reasoning() -> EliminativeReasoning:
    return EliminativeReasoning(
        frame="eliminative",
        cannot_miss_diagnoses=[
            CannotMissDiagnosis(
                diagnosis="PE",
                danger_level="immediately_life_threatening",
                plausibility_in_this_case="cannot_exclude",
            ),
            CannotMissDiagnosis(
                diagnosis="MI",
                danger_level="immediately_life_threatening",
                plausibility_in_this_case="unlikely",
            ),
        ],
        ruling_out_evidence=[
            RulingOutEvidence(diagnosis="PE", test_or_finding_needed="CT pulmonary angiogram"),
        ],
    )


def _differential_two() -> list[Diagnosis]:
    return [
        _valid_diagnosis(),
        _valid_diagnosis(
            diagnosis_name="Anxiety attack",
            icd10_approximate="F41.0",
            commitment="considered",
            supporting_evidence=["Known anxiety history"],
            alternative_explanation_considered="PE, ruled in by hypoxia.",
        ),
    ]


def _valid_round0(frame="probabilistic") -> SpecialistRound0Output:
    reasoning = {
        "probabilistic": _probabilistic_reasoning(),
        "mechanistic": _mechanistic_reasoning(),
        "eliminative": _eliminative_reasoning(),
    }[frame]
    return SpecialistRound0Output(
        differential=_differential_two(),
        primary_diagnosis="Pulmonary embolism",
        recommended_next_step="D-dimer then CT-PA if positive.",
        reasoning_frame=frame,
        reasoning=reasoning,
    )


def _valid_patient_case(**overrides) -> PatientCase:
    defaults = dict(
        case_id="stemi-001",
        demographics=Demographics(age=62, sex="M"),
        chief_complaint="Crushing chest pain for the past hour.",
        history_of_present_illness="Sudden substernal pressure, radiating to left arm.",
        past_medical_history=["Hypertension"],
        medications=["lisinopril"],
        social_history="40 pack-year smoking history.",
        family_history="Father MI at 58.",
        vitals=Vitals(
            hr=98, bp_systolic=148, bp_diastolic=92, rr=20, spo2=96, temp_c=36.8
        ),
        physical_exam="Diaphoretic, in distress.",
        initial_workup={"ekg": "2mm ST elevation II/III/aVF", "troponin": "pending"},
    )
    defaults.update(overrides)
    return PatientCase(**defaults)


# ---------------------------------------------------------------------------
# Diagnosis
# ---------------------------------------------------------------------------


def test_diagnosis_valid():
    d = _valid_diagnosis()
    assert d.commitment == "leading"


def test_diagnosis_committed_requires_two_supporting_findings():
    with pytest.raises(ValidationError) as exc:
        _valid_diagnosis(commitment="committed", supporting_evidence=["only one finding"])
    assert "committed" in str(exc.value)


def test_diagnosis_committed_with_two_findings_accepted():
    d = _valid_diagnosis(
        commitment="committed",
        supporting_evidence=["SpO2 94%", "Tachycardia 112"],
    )
    assert d.commitment == "committed"


def test_diagnosis_rejects_empty_alternative_explanation():
    with pytest.raises(ValidationError):
        _valid_diagnosis(alternative_explanation_considered="")


def test_diagnosis_rejects_zero_supporting_evidence():
    with pytest.raises(ValidationError):
        _valid_diagnosis(supporting_evidence=[])


def test_diagnosis_rejects_extra_fields():
    with pytest.raises(ValidationError):
        Diagnosis(
            diagnosis_name="PE",
            icd10_approximate="I26.9",
            commitment="leading",
            supporting_evidence=["x"],
            refuting_evidence=[],
            alternative_explanation_considered="none",
            numeric_confidence=0.85,  # banned
        )


# ---------------------------------------------------------------------------
# Reasoning frames
# ---------------------------------------------------------------------------


def test_probabilistic_reasoning_requires_two_base_rates():
    with pytest.raises(ValidationError):
        ProbabilisticReasoning(
            frame="probabilistic",
            base_rate_estimates=[
                BaseRateEstimate(
                    diagnosis="X", estimated_prevalence="rare", population_context="any"
                )
            ],
            risk_factor_modifiers=[],
            posterior_ranking="n/a",
        )


def test_mechanistic_reasoning_requires_two_chain_steps():
    with pytest.raises(ValidationError):
        MechanisticReasoning(
            frame="mechanistic",
            unifying_mechanism="X",
            causal_chain=[CausalChainStep(step="one", explains_findings=[])],
            unexplained_findings=[],
        )


def test_eliminative_reasoning_requires_two_cannot_miss():
    with pytest.raises(ValidationError):
        EliminativeReasoning(
            frame="eliminative",
            cannot_miss_diagnoses=[
                CannotMissDiagnosis(
                    diagnosis="X",
                    danger_level="serious",
                    plausibility_in_this_case="possible",
                )
            ],
            ruling_out_evidence=[],
        )


# ---------------------------------------------------------------------------
# SpecialistRound0Output
# ---------------------------------------------------------------------------


def test_round0_valid_all_three_frames():
    for frame in ("probabilistic", "mechanistic", "eliminative"):
        out = _valid_round0(frame=frame)
        assert out.reasoning_frame == frame
        assert out.reasoning.frame == frame


def test_round0_rejects_primary_diagnosis_mismatch():
    with pytest.raises(ValidationError, match="primary_diagnosis"):
        SpecialistRound0Output(
            differential=_differential_two(),
            primary_diagnosis="Something else entirely",
            recommended_next_step="CT-PA",
            reasoning_frame="probabilistic",
            reasoning=_probabilistic_reasoning(),
        )


def test_round0_rejects_reasoning_frame_mismatch():
    with pytest.raises(ValidationError, match="frame"):
        SpecialistRound0Output(
            differential=_differential_two(),
            primary_diagnosis="Pulmonary embolism",
            recommended_next_step="CT-PA",
            reasoning_frame="probabilistic",
            reasoning=_mechanistic_reasoning(),
        )


def test_round0_requires_min_two_differential():
    with pytest.raises(ValidationError):
        SpecialistRound0Output(
            differential=[_valid_diagnosis()],
            primary_diagnosis="Pulmonary embolism",
            recommended_next_step="CT-PA",
            reasoning_frame="probabilistic",
            reasoning=_probabilistic_reasoning(),
        )


def test_round0_rejects_more_than_six_differential():
    diffs = [
        _valid_diagnosis(diagnosis_name=f"Diagnosis {i}", commitment="considered")
        for i in range(7)
    ]
    with pytest.raises(ValidationError):
        SpecialistRound0Output(
            differential=diffs,
            primary_diagnosis="Diagnosis 0",
            recommended_next_step="test",
            reasoning_frame="probabilistic",
            reasoning=_probabilistic_reasoning(),
        )


# ---------------------------------------------------------------------------
# SpecialistRoundNOutput (inherits Round0 rules)
# ---------------------------------------------------------------------------


def test_roundN_valid():
    out = SpecialistRoundNOutput(
        differential=_differential_two(),
        primary_diagnosis="Pulmonary embolism",
        recommended_next_step="CT-PA",
        reasoning_frame="probabilistic",
        reasoning=_probabilistic_reasoning(),
        position_change="confidence_raised",
        response_to_challenge=ResponseToChallenge(
            challenge_addressed=True,
            position_justification="Hypoxia cannot be explained by anxiety.",
        ),
    )
    assert out.position_change == "confidence_raised"


def test_roundN_inherits_primary_mismatch_rule():
    with pytest.raises(ValidationError, match="primary_diagnosis"):
        SpecialistRoundNOutput(
            differential=_differential_two(),
            primary_diagnosis="WRONG",
            recommended_next_step="CT-PA",
            reasoning_frame="probabilistic",
            reasoning=_probabilistic_reasoning(),
            position_change="maintained",
            response_to_challenge=ResponseToChallenge(
                challenge_addressed=False, position_justification="n/a"
            ),
        )


def test_round0_rejects_roundN_extras():
    """A Round 0 output must not carry position_change / response_to_challenge."""
    with pytest.raises(ValidationError):
        SpecialistRound0Output.model_validate(
            {
                "differential": [
                    d.model_dump() for d in _differential_two()
                ],
                "primary_diagnosis": "Pulmonary embolism",
                "recommended_next_step": "CT-PA",
                "reasoning_frame": "probabilistic",
                "reasoning": _probabilistic_reasoning().model_dump(),
                "position_change": "maintained",
                "response_to_challenge": {
                    "challenge_addressed": False,
                    "position_justification": "x",
                },
            }
        )


# ---------------------------------------------------------------------------
# AntagonistOutput
# ---------------------------------------------------------------------------


def test_antagonist_output_challenge_valid():
    out = AntagonistOutput(
        round_number=1,
        result=AntagonistChallenge(
            type="challenge",
            challenged_diagnosis="Anxiety attack",
            proposed_alternative="Pulmonary embolism",
            supporting_finding="SpO2 94% on room air",
            reason_leading_diagnosis_fails="Anxiety does not cause hypoxia.",
            challenge_novelty="new_attack",
        ),
    )
    assert out.result.type == "challenge"


def test_antagonist_output_no_credible_valid():
    out = AntagonistOutput(
        round_number=2,
        result=NoCredibleChallenge(
            type="no_credible_challenge",
            explanation="All alternatives ruled out by the EKG pattern.",
            alternatives_attempted=["Aortic dissection", "Pericarditis"],
        ),
    )
    assert out.result.type == "no_credible_challenge"


def test_antagonist_output_rejects_invalid_discriminator():
    with pytest.raises(ValidationError):
        AntagonistOutput.model_validate(
            {"round_number": 1, "result": {"type": "something_else"}}
        )


def test_antagonist_output_rejects_round_zero():
    with pytest.raises(ValidationError):
        AntagonistOutput(
            round_number=0,
            result=NoCredibleChallenge(
                type="no_credible_challenge", explanation="x", alternatives_attempted=[]
            ),
        )


# ---------------------------------------------------------------------------
# ConsensusOutput
# ---------------------------------------------------------------------------


def _converged_output() -> ConvergedOutput:
    return ConvergedOutput(
        type="converged",
        primary_diagnosis="Pulmonary embolism",
        commitment="leading",
        integrated_reasoning=IntegratedReasoning(
            probabilistic_view="...",
            mechanistic_view="...",
            eliminative_view="...",
            synthesis="PE best fits presentation.",
        ),
        supporting_evidence_consolidated=["SpO2 94%", "postpartum day 18"],
        distinguishing_test=DistinguishingTest(
            test_name="CT pulmonary angiogram",
            expected_finding="Segmental filling defect",
            rationale="Confirms PE.",
        ),
        residual_uncertainty="Exact clot burden unknown without imaging.",
        antagonist_challenges_addressed=[
            ChallengeAddressed(challenge="Anxiety?", how_resolved="Hypoxia excludes.")
        ],
    )


def _deadlock_output() -> DeadlockOutput:
    return DeadlockOutput(
        type="deadlocked",
        competing_hypotheses=[
            CompetingHypothesis(
                diagnosis="MS",
                supporting_evidence=["Two episodes"],
                distinguishing_test="MRI brain/spine with contrast",
            ),
            CompetingHypothesis(
                diagnosis="Neuroborreliosis",
                supporting_evidence=["Endemic exposure"],
                distinguishing_test="Lyme serology",
            ),
        ],
        recommended_next_action="Neurology referral.",
        referral_urgency="urgent",
    )


def test_consensus_output_converged_valid():
    out = ConsensusOutput(outcome="converged", final_round=3, output=_converged_output())
    assert out.outcome == "converged"


def test_consensus_output_deadlocked_valid():
    out = ConsensusOutput(outcome="deadlocked", final_round=4, output=_deadlock_output())
    assert out.outcome == "deadlocked"


def test_consensus_output_rejects_outcome_mismatch():
    with pytest.raises(ValidationError, match="outcome"):
        ConsensusOutput(outcome="converged", final_round=4, output=_deadlock_output())


def test_converged_rejects_empty_residual_uncertainty():
    with pytest.raises(ValidationError):
        ConvergedOutput(
            type="converged",
            primary_diagnosis="X",
            commitment="leading",
            integrated_reasoning=IntegratedReasoning(
                probabilistic_view="a",
                mechanistic_view="b",
                eliminative_view="c",
                synthesis="d",
            ),
            supporting_evidence_consolidated=["a", "b"],
            distinguishing_test=DistinguishingTest(
                test_name="t", expected_finding="f", rationale="r"
            ),
            residual_uncertainty="",
        )


def test_converged_requires_min_two_consolidated_evidence():
    with pytest.raises(ValidationError):
        ConvergedOutput(
            type="converged",
            primary_diagnosis="X",
            commitment="leading",
            integrated_reasoning=IntegratedReasoning(
                probabilistic_view="a",
                mechanistic_view="b",
                eliminative_view="c",
                synthesis="d",
            ),
            supporting_evidence_consolidated=["only one"],
            distinguishing_test=DistinguishingTest(
                test_name="t", expected_finding="f", rationale="r"
            ),
            residual_uncertainty="something unknown",
        )


def test_deadlock_requires_min_two_competing_hypotheses():
    with pytest.raises(ValidationError):
        DeadlockOutput(
            type="deadlocked",
            competing_hypotheses=[
                CompetingHypothesis(
                    diagnosis="X",
                    supporting_evidence=["a"],
                    distinguishing_test="test",
                )
            ],
            recommended_next_action="referral",
            referral_urgency="urgent",
        )


def test_deadlock_rejects_more_than_four_competing_hypotheses():
    hyps = [
        CompetingHypothesis(
            diagnosis=f"H{i}",
            supporting_evidence=["x"],
            distinguishing_test="t",
        )
        for i in range(5)
    ]
    with pytest.raises(ValidationError):
        DeadlockOutput(
            type="deadlocked",
            competing_hypotheses=hyps,
            recommended_next_action="referral",
            referral_urgency="urgent",
        )


# ---------------------------------------------------------------------------
# PatientCase
# ---------------------------------------------------------------------------


def test_patient_case_valid():
    case = _valid_patient_case()
    assert case.case_id == "stemi-001"
    assert case.initial_workup["ekg"].startswith("2mm")


def test_patient_case_rejects_missing_temp():
    with pytest.raises(ValidationError):
        PatientCase.model_validate(
            {
                "case_id": "x",
                "demographics": {"age": 62, "sex": "M"},
                "chief_complaint": "x",
                "history_of_present_illness": "x",
                "past_medical_history": [],
                "medications": [],
                "social_history": "x",
                "family_history": "x",
                "vitals": {
                    "hr": 98,
                    "bp_systolic": 148,
                    "bp_diastolic": 92,
                    "rr": 20,
                    "spo2": 96,
                    # missing temp_c
                },
                "physical_exam": "x",
                "initial_workup": {},
            }
        )


def test_patient_case_rejects_spo2_above_100():
    with pytest.raises(ValidationError):
        Vitals(hr=80, bp_systolic=120, bp_diastolic=80, rr=16, spo2=105, temp_c=37.0)


def test_patient_case_rejects_age_over_120():
    with pytest.raises(ValidationError):
        Demographics(age=121, sex="F")


# ---------------------------------------------------------------------------
# NarrativeCriteriaCheck
# ---------------------------------------------------------------------------


def test_narrative_criteria_check_valid():
    c = NarrativeCriteriaCheck(
        check_type="narrative",
        criteria_met=["Postpartum state"],
        criteria_not_met=["D-dimer not yet drawn"],
        net_assessment="supports_weakly",
    )
    assert c.net_assessment == "supports_weakly"


def test_diagnosis_with_narrative_criteria_accepted():
    d = _valid_diagnosis(
        criteria_check={
            "check_type": "narrative",
            "criteria_met": ["Postpartum"],
            "criteria_not_met": [],
            "net_assessment": "supports_weakly",
        }
    )
    assert d.criteria_check is not None
    assert d.criteria_check.check_type == "narrative"


# ---------------------------------------------------------------------------
# Input schemas (smoke tests — no custom validators, but ensure they construct)
# ---------------------------------------------------------------------------


def test_specialist_debate_input_valid():
    prev = SpecialistRoundNOutput(
        differential=_differential_two(),
        primary_diagnosis="Pulmonary embolism",
        recommended_next_step="CT-PA",
        reasoning_frame="probabilistic",
        reasoning=_probabilistic_reasoning(),
        position_change="maintained",
        response_to_challenge=ResponseToChallenge(
            challenge_addressed=True, position_justification="no movement needed"
        ),
    )
    inp = SpecialistDebateInput(
        patient_case=_valid_patient_case(),
        own_previous_output=prev,
        current_leading_diagnosis=LeadingDiagnosisBrief(
            diagnosis_name="Pulmonary embolism", commitment="leading"
        ),
        other_specialists_conclusions=[
            OtherSpecialistConclusion(
                primary_diagnosis="Pulmonary embolism", commitment="leading"
            ),
            OtherSpecialistConclusion(
                primary_diagnosis="Anxiety", commitment="considered"
            ),
        ],
        antagonist_challenge=None,
        round_number=2,
    )
    assert inp.round_number == 2
    assert inp.antagonist_challenge is None


def test_specialist_debate_input_accepts_round0_as_prev():
    """In Round 1, own_previous_output is a Round 0 output (no position_change)."""
    prev = _valid_round0(frame="probabilistic")
    inp = SpecialistDebateInput(
        patient_case=_valid_patient_case(),
        own_previous_output=prev,
        current_leading_diagnosis=LeadingDiagnosisBrief(
            diagnosis_name="Pulmonary embolism", commitment="leading"
        ),
        other_specialists_conclusions=[
            OtherSpecialistConclusion(
                primary_diagnosis="Pulmonary embolism", commitment="leading"
            ),
            OtherSpecialistConclusion(
                primary_diagnosis="Anxiety", commitment="considered"
            ),
        ],
        antagonist_challenge=None,
        round_number=1,
    )
    assert inp.round_number == 1


def test_specialist_debate_input_rejects_three_other_specialists():
    with pytest.raises(ValidationError):
        SpecialistDebateInput(
            patient_case=_valid_patient_case(),
            own_previous_output=_valid_round0(),
            current_leading_diagnosis=LeadingDiagnosisBrief(
                diagnosis_name="X", commitment="leading"
            ),
            other_specialists_conclusions=[
                OtherSpecialistConclusion(primary_diagnosis="X", commitment="leading"),
                OtherSpecialistConclusion(primary_diagnosis="Y", commitment="leading"),
                OtherSpecialistConclusion(primary_diagnosis="Z", commitment="leading"),
            ],
            antagonist_challenge=None,
            round_number=2,
        )


def test_antagonist_input_valid():
    inp = AntagonistInput(
        patient_case=_valid_patient_case(),
        current_leading_diagnosis=LeadingDiagnosisForAntagonist(
            diagnosis_name="Pulmonary embolism",
            commitment="leading",
            supporting_evidence_summary=["SpO2 94%", "postpartum day 18"],
        ),
        all_specialist_conclusions=[
            SpecialistConclusionAnon(
                primary_diagnosis="Pulmonary embolism", commitment="leading"
            ),
            SpecialistConclusionAnon(
                primary_diagnosis="Pulmonary embolism", commitment="candidate"
            ),
            SpecialistConclusionAnon(
                primary_diagnosis="Anxiety attack", commitment="candidate"
            ),
        ],
        position_deltas=[
            PositionDelta(
                specialist_anonymous_id="A",
                change_type="maintained",
                previous_primary="Pulmonary embolism",
                current_primary="Pulmonary embolism",
            ),
        ],
        previous_challenges=[
            PreviousChallenge(
                round=1,
                challenge_alternative="Pulmonary embolism",
                specialist_response_summary="moved_toward_challenge",
            ),
        ],
        round_number=2,
    )
    assert inp.round_number == 2
    assert len(inp.all_specialist_conclusions) == 3


def test_antagonist_input_rejects_wrong_specialist_count():
    with pytest.raises(ValidationError):
        AntagonistInput(
            patient_case=_valid_patient_case(),
            current_leading_diagnosis=LeadingDiagnosisForAntagonist(
                diagnosis_name="X",
                commitment="leading",
                supporting_evidence_summary=[],
            ),
            all_specialist_conclusions=[
                SpecialistConclusionAnon(primary_diagnosis="X", commitment="leading"),
                SpecialistConclusionAnon(primary_diagnosis="Y", commitment="leading"),
            ],
            position_deltas=[],
            previous_challenges=[],
            round_number=1,
        )
