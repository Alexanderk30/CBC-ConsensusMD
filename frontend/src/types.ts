// Type mirrors of the Python Pydantic schemas in backend/schemas.py.
// If the backend schema changes and the frontend isn't updated, the only
// visible effect is a TypeScript compile error and/or a missing field in the
// UI — no runtime validation is done here (the backend is source-of-truth).

export type Role = 'probabilistic' | 'mechanistic' | 'eliminative';
export type AgentId = Role | 'antagonist';
export type AnonId = 'A' | 'B' | 'C';

export type CommitmentLevel = 'committed' | 'leading' | 'candidate' | 'considered';
export type PositionChange =
  | 'maintained'
  | 'confidence_raised'
  | 'confidence_lowered'
  | 'differential_reordered'
  | 'primary_diagnosis_changed';
export type ChallengeNovelty =
  | 'new_attack'
  | 'refinement_of_previous'
  | 'different_alternative_same_weakness';
export type ReferralUrgency = 'emergent' | 'urgent' | 'routine';
export type ConvergenceOutcome = 'converged' | 'deadlocked';

export interface Diagnosis {
  diagnosis_name: string;
  icd10_approximate: string;
  commitment: CommitmentLevel;
  supporting_evidence: string[];
  refuting_evidence: string[];
  alternative_explanation_considered: string;
  criteria_check?: unknown;
}

export interface SpecialistRound0Output {
  differential: Diagnosis[];
  primary_diagnosis: string;
  recommended_next_step: string;
  reasoning_frame: Role;
  reasoning: Record<string, unknown>;
}

export interface SpecialistRoundNOutput extends SpecialistRound0Output {
  position_change: PositionChange;
  response_to_challenge: {
    challenge_addressed: boolean;
    position_justification: string;
  };
}

export type SpecialistOutput = SpecialistRound0Output | SpecialistRoundNOutput;

export interface AntagonistChallenge {
  type: 'challenge';
  challenged_diagnosis: string;
  proposed_alternative: string;
  supporting_finding: string;
  reason_leading_diagnosis_fails: string;
  challenge_novelty: ChallengeNovelty;
}

export interface NoCredibleChallenge {
  type: 'no_credible_challenge';
  explanation: string;
  alternatives_attempted: string[];
}

export type AntagonistResult = AntagonistChallenge | NoCredibleChallenge;

export interface AntagonistOutput {
  round_number: number;
  result: AntagonistResult;
}

export interface ConvergedOutput {
  type: 'converged';
  primary_diagnosis: string;
  commitment: CommitmentLevel;
  integrated_reasoning: {
    probabilistic_view: string;
    mechanistic_view: string;
    eliminative_view: string;
    synthesis: string;
  };
  supporting_evidence_consolidated: string[];
  distinguishing_test: {
    test_name: string;
    expected_finding: string;
    rationale: string;
  };
  residual_uncertainty: string;
  antagonist_challenges_addressed?: Array<{ challenge: string; how_resolved: string }>;
}

export interface CompetingHypothesis {
  diagnosis: string;
  supporting_evidence: string[];
  distinguishing_test: string;
  why_not_ruled_out?: string;
}

export interface DeadlockOutput {
  type: 'deadlocked';
  competing_hypotheses: CompetingHypothesis[];
  recommended_next_action: string;
  referral_urgency: ReferralUrgency;
  reason_for_deadlock?: string;
}

export interface ConsensusOutput {
  outcome: ConvergenceOutcome;
  final_round: number;
  output: ConvergedOutput | DeadlockOutput;
}

// WebSocket event catalogue — matches the documented contract in README.md.
export type DebateEvent =
  | {
      event: 'debate_started';
      case_id: string;
      max_rounds: number;
      anon_id_by_role: Record<Role, AnonId>;
    }
  | { event: 'round_started'; round: number }
  | { event: 'specialist_output'; round: number; role: Role; output: SpecialistOutput }
  | {
      event: 'antagonist_output';
      round: number;
      output: AntagonistOutput;
      survival_count: number;
    }
  | {
      event: 'round_completed';
      round: number;
      leading_diagnosis: string;
      leading_commitment: CommitmentLevel;
      survival_count: number;
      note?: string;
    }
  | { event: 'consensus_started'; outcome: ConvergenceOutcome; final_round: number }
  | { event: 'consensus_output'; output: ConsensusOutput }
  | { event: 'debate_complete'; outcome: ConvergenceOutcome; final_round: number }
  | { event: 'error'; message: string };

export interface CaseSummary {
  case_id: string;
  age_sex: string;
  chief_complaint: string;
  archetype: string;
}

export interface PatientCase {
  case_id: string;
  demographics: {
    age: number;
    sex: 'M' | 'F' | 'other';
    relevant_context?: string;
    name?: string;
    weight_kg?: number;
    allergies?: string;
    code_status?: string;
  };
  chief_complaint: string;
  history_of_present_illness: string;
  past_medical_history: string[];
  medications: string[];
  social_history: string;
  family_history: string;
  vitals: {
    hr: number;
    bp_systolic: number;
    bp_diastolic: number;
    rr: number;
    spo2: number;
    temp_c: number;
    orthostatic_vitals?: string;
  };
  physical_exam: string;
  initial_workup: Record<string, unknown>;
}
