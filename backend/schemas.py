"""ConsensusMD — Pydantic models for agent I/O contracts.

Translation of consensusmd_schemas.md into Pydantic v2. Every schema rule
stated in the spec is enforced at model level — no silent coercion, no extra
fields.

The load-bearing validators:
  - Diagnosis: 'committed' requires >=2 supporting_evidence items.
  - SpecialistRound0Output: primary_diagnosis must equal differential[0].
  - SpecialistRound0Output: reasoning_frame must equal reasoning.frame.
  - ConsensusOutput: outcome must match output.type.
"""
from __future__ import annotations

from typing import Annotated, Literal, Optional, Union

from pydantic import BaseModel, ConfigDict, Field, model_validator


# ---------------------------------------------------------------------------
# Type aliases
# ---------------------------------------------------------------------------

CommitmentLevel = Literal["committed", "leading", "candidate", "considered"]
ReasoningFrame = Literal["probabilistic", "mechanistic", "eliminative"]

DangerLevel = Literal[
    "immediately_life_threatening", "time_critical", "serious", "significant"
]
PlausibilityLevel = Literal[
    "cannot_exclude", "possible", "unlikely", "effectively_excluded"
]
NetAssessment = Literal[
    "supports_strongly", "supports_weakly", "equivocal", "argues_against"
]
RiskFactorEffect = Literal[
    "strongly_increases", "increases", "minimal", "decreases", "strongly_decreases"
]

PositionChange = Literal[
    "maintained",
    "confidence_raised",
    "confidence_lowered",
    "differential_reordered",
    "primary_diagnosis_changed",
]
ChangeType = Literal[
    "maintained",
    "confidence_raised",
    "confidence_lowered",
    "primary_diagnosis_changed",
    "differential_reordered",
]
ChallengeNovelty = Literal[
    "new_attack", "refinement_of_previous", "different_alternative_same_weakness"
]
SpecialistAnonymousId = Literal["A", "B", "C"]
SpecialistResponseSummary = Literal[
    "moved_toward_challenge",
    "partially_moved",
    "no_movement",
    "moved_away_from_challenge",
]
ReferralUrgency = Literal["emergent", "urgent", "routine"]
ConvergenceOutcome = Literal["converged", "deadlocked"]
ConsensusStateValue = Literal["split", "partial", "converged", "deadlocked"]
Sex = Literal["M", "F", "other"]


# ---------------------------------------------------------------------------
# Base
# ---------------------------------------------------------------------------


class _Strict(BaseModel):
    """Strict base: no extra fields permitted (additionalProperties: false)."""

    model_config = ConfigDict(extra="forbid")


# ---------------------------------------------------------------------------
# Criteria (MVP: narrative only; library deferred)
# ---------------------------------------------------------------------------


class NarrativeCriteriaCheck(_Strict):
    check_type: Literal["narrative"]
    criteria_met: list[str]
    criteria_not_met: list[str]
    net_assessment: NetAssessment


CriteriaCheck = Annotated[
    NarrativeCriteriaCheck,
    Field(discriminator="check_type"),
]


# ---------------------------------------------------------------------------
# Diagnosis
# ---------------------------------------------------------------------------


class Diagnosis(_Strict):
    diagnosis_name: str
    icd10_approximate: str
    commitment: CommitmentLevel
    supporting_evidence: list[str] = Field(min_length=1)
    refuting_evidence: list[str] = Field(default_factory=list)
    alternative_explanation_considered: str = Field(min_length=1)
    criteria_check: Optional[CriteriaCheck] = None

    @model_validator(mode="after")
    def _committed_requires_two_supporting_findings(self) -> "Diagnosis":
        if self.commitment == "committed" and len(self.supporting_evidence) < 2:
            raise ValueError(
                "commitment='committed' requires >=2 supporting_evidence items; "
                f"got {len(self.supporting_evidence)}."
            )
        return self


# ---------------------------------------------------------------------------
# Reasoning sub-schemas
# ---------------------------------------------------------------------------


class BaseRateEstimate(_Strict):
    diagnosis: str
    estimated_prevalence: str
    population_context: str


class RiskFactorModifier(_Strict):
    factor: str
    effect_on_probability: RiskFactorEffect


class ProbabilisticReasoning(_Strict):
    frame: Literal["probabilistic"]
    base_rate_estimates: list[BaseRateEstimate] = Field(min_length=2)
    risk_factor_modifiers: list[RiskFactorModifier]
    posterior_ranking: str


class CausalChainStep(_Strict):
    step: str
    explains_findings: list[str]


class MechanisticReasoning(_Strict):
    frame: Literal["mechanistic"]
    unifying_mechanism: str
    causal_chain: list[CausalChainStep] = Field(min_length=2)
    unexplained_findings: list[str]


class CannotMissDiagnosis(_Strict):
    diagnosis: str
    danger_level: DangerLevel
    plausibility_in_this_case: PlausibilityLevel


class RulingOutEvidence(_Strict):
    diagnosis: str
    test_or_finding_needed: str


class EliminativeReasoning(_Strict):
    frame: Literal["eliminative"]
    cannot_miss_diagnoses: list[CannotMissDiagnosis] = Field(min_length=2)
    ruling_out_evidence: list[RulingOutEvidence]


ReasoningUnion = Annotated[
    Union[ProbabilisticReasoning, MechanisticReasoning, EliminativeReasoning],
    Field(discriminator="frame"),
]


# ---------------------------------------------------------------------------
# PatientCase
# ---------------------------------------------------------------------------


class Demographics(_Strict):
    age: int = Field(ge=0, le=120)
    sex: Sex
    relevant_context: Optional[str] = None
    # Identifying / bedside-chart fields (optional; added for the clinician-
    # facing UI so the case panel can read like a real chart header). The LLM
    # prompts already ignore anything they don't actively reason over, so
    # these have no effect on debate behaviour.
    name: Optional[str] = None
    weight_kg: Optional[float] = Field(default=None, gt=0, le=500)
    allergies: Optional[str] = None
    code_status: Optional[str] = None


class Vitals(_Strict):
    hr: float
    bp_systolic: float
    bp_diastolic: float
    rr: float
    spo2: float = Field(ge=0, le=100)
    temp_c: float
    orthostatic_vitals: Optional[str] = None


class PatientCase(_Strict):
    case_id: str
    demographics: Demographics
    chief_complaint: str
    history_of_present_illness: str
    past_medical_history: list[str]
    medications: list[str]
    social_history: str
    family_history: str
    vitals: Vitals
    physical_exam: str
    initial_workup: dict = Field(default_factory=dict)


# ---------------------------------------------------------------------------
# Specialist outputs
# ---------------------------------------------------------------------------


class SpecialistRound0Output(_Strict):
    differential: list[Diagnosis] = Field(min_length=2, max_length=6)
    primary_diagnosis: str
    recommended_next_step: str
    reasoning_frame: ReasoningFrame
    reasoning: ReasoningUnion

    @model_validator(mode="after")
    def _primary_matches_first_differential(self) -> "SpecialistRound0Output":
        first = self.differential[0].diagnosis_name
        if self.primary_diagnosis != first:
            raise ValueError(
                "primary_diagnosis must equal differential[0].diagnosis_name "
                f"({self.primary_diagnosis!r} vs {first!r})."
            )
        return self

    @model_validator(mode="after")
    def _reasoning_frame_matches_reasoning(self) -> "SpecialistRound0Output":
        if self.reasoning_frame != self.reasoning.frame:
            raise ValueError(
                "reasoning_frame must equal reasoning.frame "
                f"({self.reasoning_frame!r} vs {self.reasoning.frame!r})."
            )
        return self


class ResponseToChallenge(_Strict):
    challenge_addressed: bool
    position_justification: str


class SpecialistRoundNOutput(SpecialistRound0Output):
    position_change: PositionChange
    response_to_challenge: ResponseToChallenge


# Union used for history fields; RoundN tried first because it has more fields.
SpecialistRoundOutputAny = Union[SpecialistRoundNOutput, SpecialistRound0Output]


# ---------------------------------------------------------------------------
# Specialist input (Rounds 1..N)
# ---------------------------------------------------------------------------


class LeadingDiagnosisBrief(_Strict):
    """System-computed leading diagnosis, no attribution."""

    diagnosis_name: str
    commitment: CommitmentLevel


class OtherSpecialistConclusion(_Strict):
    primary_diagnosis: str
    commitment: CommitmentLevel


# Forward ref resolved below
class AntagonistChallenge(_Strict):
    type: Literal["challenge"]
    challenged_diagnosis: str
    proposed_alternative: str
    supporting_finding: str
    reason_leading_diagnosis_fails: str
    challenge_novelty: ChallengeNovelty


class NoCredibleChallenge(_Strict):
    type: Literal["no_credible_challenge"]
    explanation: str
    alternatives_attempted: list[str] = Field(default_factory=list)


AntagonistResult = Annotated[
    Union[AntagonistChallenge, NoCredibleChallenge],
    Field(discriminator="type"),
]


class SpecialistDebateInput(_Strict):
    patient_case: PatientCase
    own_previous_output: SpecialistRoundOutputAny
    current_leading_diagnosis: LeadingDiagnosisBrief
    other_specialists_conclusions: list[OtherSpecialistConclusion] = Field(
        min_length=2, max_length=2
    )
    # Orchestrator contract: when the antagonist returns NoCredibleChallenge,
    # the orchestrator MUST translate that to None here. This field only ever
    # carries AntagonistChallenge or null.
    antagonist_challenge: Optional[AntagonistChallenge] = None
    round_number: int = Field(ge=1)


# ---------------------------------------------------------------------------
# Antagonist I/O
# ---------------------------------------------------------------------------


class LeadingDiagnosisForAntagonist(_Strict):
    diagnosis_name: str
    commitment: CommitmentLevel
    supporting_evidence_summary: list[str]


class SpecialistConclusionAnon(_Strict):
    primary_diagnosis: str
    commitment: CommitmentLevel


class PositionDelta(_Strict):
    specialist_anonymous_id: SpecialistAnonymousId
    change_type: ChangeType
    previous_primary: Optional[str] = None
    current_primary: Optional[str] = None


class PreviousChallenge(_Strict):
    round: int
    challenge_alternative: str
    specialist_response_summary: SpecialistResponseSummary


class AntagonistInput(_Strict):
    patient_case: PatientCase
    current_leading_diagnosis: LeadingDiagnosisForAntagonist
    all_specialist_conclusions: list[SpecialistConclusionAnon] = Field(
        min_length=3, max_length=3
    )
    position_deltas: list[PositionDelta]
    previous_challenges: list[PreviousChallenge]
    round_number: int = Field(ge=1)


class AntagonistOutput(_Strict):
    round_number: int = Field(ge=1)
    result: AntagonistResult


# ---------------------------------------------------------------------------
# Consensus I/O
# ---------------------------------------------------------------------------


class SpecialistHistory(_Strict):
    specialist_role: ReasoningFrame
    rounds: list[SpecialistRoundOutputAny]


class ConsensusInput(_Strict):
    patient_case: PatientCase
    all_specialist_histories: list[SpecialistHistory] = Field(
        min_length=3, max_length=3
    )
    antagonist_history: list[AntagonistOutput]
    convergence_outcome: ConvergenceOutcome
    final_round_number: int


class IntegratedReasoning(_Strict):
    probabilistic_view: str
    mechanistic_view: str
    eliminative_view: str
    synthesis: str


class DistinguishingTest(_Strict):
    test_name: str
    expected_finding: str
    rationale: str


class ChallengeAddressed(_Strict):
    challenge: str
    how_resolved: str


class ConvergedOutput(_Strict):
    type: Literal["converged"]
    primary_diagnosis: str
    commitment: CommitmentLevel
    integrated_reasoning: IntegratedReasoning
    supporting_evidence_consolidated: list[str] = Field(min_length=2)
    distinguishing_test: DistinguishingTest
    residual_uncertainty: str = Field(min_length=1)
    antagonist_challenges_addressed: list[ChallengeAddressed] = Field(
        default_factory=list
    )


class CompetingHypothesis(_Strict):
    diagnosis: str
    supporting_evidence: list[str]
    distinguishing_test: str
    why_not_ruled_out: Optional[str] = None


class DeadlockOutput(_Strict):
    type: Literal["deadlocked"]
    competing_hypotheses: list[CompetingHypothesis] = Field(min_length=2, max_length=4)
    recommended_next_action: str
    referral_urgency: ReferralUrgency
    reason_for_deadlock: Optional[str] = None


ConsensusOutputUnion = Annotated[
    Union[ConvergedOutput, DeadlockOutput],
    Field(discriminator="type"),
]


class ConsensusOutput(_Strict):
    outcome: ConvergenceOutcome
    final_round: int
    output: ConsensusOutputUnion

    @model_validator(mode="after")
    def _outcome_matches_output_type(self) -> "ConsensusOutput":
        if self.outcome != self.output.type:
            raise ValueError(
                f"outcome {self.outcome!r} does not match output.type "
                f"{self.output.type!r}."
            )
        return self


__all__ = [
    # aliases
    "CommitmentLevel",
    "ReasoningFrame",
    "DangerLevel",
    "PlausibilityLevel",
    "NetAssessment",
    "PositionChange",
    "ChangeType",
    "ChallengeNovelty",
    "SpecialistAnonymousId",
    "SpecialistResponseSummary",
    "ReferralUrgency",
    "ConvergenceOutcome",
    "ConsensusStateValue",
    # criteria
    "NarrativeCriteriaCheck",
    "CriteriaCheck",
    # diagnosis
    "Diagnosis",
    # reasoning
    "BaseRateEstimate",
    "RiskFactorModifier",
    "ProbabilisticReasoning",
    "CausalChainStep",
    "MechanisticReasoning",
    "CannotMissDiagnosis",
    "RulingOutEvidence",
    "EliminativeReasoning",
    "ReasoningUnion",
    # case
    "Demographics",
    "Vitals",
    "PatientCase",
    # specialist
    "SpecialistRound0Output",
    "SpecialistRoundNOutput",
    "ResponseToChallenge",
    "SpecialistRoundOutputAny",
    "LeadingDiagnosisBrief",
    "OtherSpecialistConclusion",
    "SpecialistDebateInput",
    # antagonist
    "LeadingDiagnosisForAntagonist",
    "SpecialistConclusionAnon",
    "PositionDelta",
    "PreviousChallenge",
    "AntagonistInput",
    "AntagonistChallenge",
    "NoCredibleChallenge",
    "AntagonistResult",
    "AntagonistOutput",
    # consensus
    "SpecialistHistory",
    "ConsensusInput",
    "IntegratedReasoning",
    "DistinguishingTest",
    "ChallengeAddressed",
    "ConvergedOutput",
    "CompetingHypothesis",
    "DeadlockOutput",
    "ConsensusOutputUnion",
    "ConsensusOutput",
]
