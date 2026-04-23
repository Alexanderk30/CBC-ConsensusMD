// Reducer: accumulate a DebateState from the stream of WebSocket events.
// The raw event catalogue is documented in README.md and typed in types.ts.
// This module converts the server's structured events into UI-friendly
// utterances (for the transcript/scene) plus the derived state the HUD needs.

import type {
  AntagonistOutput,
  CommitmentLevel,
  ConsensusOutput,
  ConvergenceOutcome,
  DebateEvent,
  Role,
  SpecialistOutput,
  SpecialistRoundNOutput,
} from './types';
import type { AgentId, AnonId } from './types';
import { SPECIALIST_ROLES } from './agents';

export type UtteranceKind =
  | 'claim'
  | 'reinforce'
  | 'concede'
  | 'flip'
  | 'challenge'
  | 'pass'
  | 'converge'
  | 'deadlock';

export interface Utterance {
  id: string;
  round: number;
  from: AgentId | 'consensus';
  target?: AgentId;
  kind: UtteranceKind;
  text: string;
  meta?: string;
}

export type Phase =
  | 'idle'
  | 'connecting'
  | 'debating'
  | 'complete'
  | 'error';

export interface DifferentialEntry {
  id: string;
  name: string;
  weight: number;
  color?: 'lead' | 'dissent';
}

export interface DebateState {
  phase: Phase;
  caseId?: string;
  maxRounds: number;
  currentRound: number;
  survivalCount: number;
  anonIdByRole?: Record<Role, AnonId>;
  leadingDiagnosis?: string;
  leadingCommitment?: CommitmentLevel;
  // Raw per-round outputs, in case the UI wants richer inspection
  specialistOutputs: Record<number, Partial<Record<Role, SpecialistOutput>>>;
  antagonistOutputs: Record<number, AntagonistOutput>;
  consensus?: ConsensusOutput;
  outcome?: ConvergenceOutcome;
  finalRound?: number;
  // Derived
  utterances: Utterance[];
  // Current "active" utterance index for scene focus
  activeUtteranceId?: string;
  error?: string;
  // Live events, for debugging
  lastEvent?: DebateEvent;
}

export const initialState: DebateState = {
  phase: 'idle',
  maxRounds: 4,
  currentRound: 0,
  survivalCount: 0,
  specialistOutputs: {},
  antagonistOutputs: {},
  utterances: [],
};

let _counter = 0;
const mkId = (prefix: string) => `${prefix}-${++_counter}`;

function describeCommitment(c: CommitmentLevel): string {
  return {
    committed: 'committed',
    leading: 'leading',
    candidate: 'candidate',
    considered: 'considered',
  }[c];
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1).trimEnd() + '…';
}

/** Build a transcript-ready utterance from a specialist output. */
function utteranceFromSpecialist(
  round: number,
  role: Role,
  output: SpecialistOutput,
): Utterance {
  const primary = output.primary_diagnosis;
  const commit = output.differential[0]?.commitment;
  const support = output.differential[0]?.supporting_evidence?.[0];
  const pcChange = (output as SpecialistRoundNOutput).position_change;

  let kind: UtteranceKind = 'claim';
  if (round > 0) {
    if (pcChange === 'primary_diagnosis_changed') kind = 'flip';
    else if (pcChange === 'confidence_lowered') kind = 'concede';
    else kind = 'reinforce';
  }

  const body = support
    ? `Primary: ${primary}. ${truncate(support, 140)}`
    : `Primary: ${primary}.`;

  const meta = commit ? `${role} · ${describeCommitment(commit)}` : role;

  return {
    id: mkId(`sp-${round}-${role}`),
    round,
    from: role,
    kind,
    text: body,
    meta,
  };
}

/** Build a transcript utterance from an antagonist output. */
function utteranceFromAntagonist(round: number, output: AntagonistOutput): Utterance {
  const res = output.result;
  if (res.type === 'challenge') {
    return {
      id: mkId(`ant-${round}`),
      round,
      from: 'antagonist',
      kind: 'challenge',
      text: `${res.reason_leading_diagnosis_fails} Consider ${res.proposed_alternative}.`,
      meta: `challenging ${res.challenged_diagnosis}`,
    };
  }
  return {
    id: mkId(`ant-${round}`),
    round,
    from: 'antagonist',
    kind: 'pass',
    text: res.explanation,
    meta: 'no credible challenge',
  };
}

/** Build a transcript utterance from a consensus output. */
function utteranceFromConsensus(consensus: ConsensusOutput): Utterance {
  if (consensus.output.type === 'converged') {
    return {
      id: mkId('consensus'),
      round: consensus.final_round,
      from: 'consensus',
      kind: 'converge',
      text: consensus.output.integrated_reasoning.synthesis,
      meta: `converged · ${consensus.output.primary_diagnosis}`,
    };
  }
  return {
    id: mkId('consensus'),
    round: consensus.final_round,
    from: 'consensus',
    kind: 'deadlock',
    text: consensus.output.reason_for_deadlock || consensus.output.recommended_next_action,
    meta: `deadlocked · ${consensus.output.competing_hypotheses.length} hypotheses`,
  };
}

/** Which specialist (if any) the antagonist's challenge "targets" visually. */
function challengeTarget(
  challenged: string,
  specialistsAtRound: Partial<Record<Role, SpecialistOutput>>,
): AgentId | undefined {
  const normalize = (s: string) => s.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const challengedNorm = normalize(challenged);
  for (const role of SPECIALIST_ROLES) {
    const out = specialistsAtRound[role];
    if (out && normalize(out.primary_diagnosis) === challengedNorm) return role;
  }
  return undefined;
}

export function reduceEvent(state: DebateState, event: DebateEvent): DebateState {
  const next = { ...state, lastEvent: event };

  switch (event.event) {
    case 'debate_started':
      return {
        ...next,
        phase: 'debating',
        caseId: event.case_id,
        maxRounds: event.max_rounds,
        anonIdByRole: event.anon_id_by_role,
        currentRound: 0,
        survivalCount: 0,
        specialistOutputs: {},
        antagonistOutputs: {},
        utterances: [],
        consensus: undefined,
        outcome: undefined,
        finalRound: undefined,
        error: undefined,
      };

    case 'round_started':
      return { ...next, currentRound: event.round };

    case 'specialist_output': {
      const prev = next.specialistOutputs[event.round] ?? {};
      const utt = utteranceFromSpecialist(event.round, event.role, event.output);
      return {
        ...next,
        specialistOutputs: {
          ...next.specialistOutputs,
          [event.round]: { ...prev, [event.role]: event.output },
        },
        utterances: [...next.utterances, utt],
        activeUtteranceId: utt.id,
      };
    }

    case 'antagonist_output': {
      const res = event.output.result;
      const specialistsAtRound = next.specialistOutputs[event.round - 1] ?? {};
      const target =
        res.type === 'challenge'
          ? challengeTarget(res.challenged_diagnosis, specialistsAtRound)
          : undefined;
      const utt = utteranceFromAntagonist(event.round, event.output);
      if (target) utt.target = target;
      return {
        ...next,
        antagonistOutputs: { ...next.antagonistOutputs, [event.round]: event.output },
        survivalCount: event.survival_count,
        utterances: [...next.utterances, utt],
        activeUtteranceId: utt.id,
      };
    }

    case 'round_completed':
      return {
        ...next,
        leadingDiagnosis: event.leading_diagnosis,
        leadingCommitment: event.leading_commitment,
        survivalCount: event.survival_count,
      };

    case 'consensus_started':
      return { ...next, outcome: event.outcome, finalRound: event.final_round };

    case 'consensus_output': {
      const utt = utteranceFromConsensus(event.output);
      return {
        ...next,
        consensus: event.output,
        utterances: [...next.utterances, utt],
        activeUtteranceId: utt.id,
      };
    }

    case 'debate_complete':
      return { ...next, phase: 'complete', outcome: event.outcome, finalRound: event.final_round };

    case 'error':
      return { ...next, phase: 'error', error: event.message };
  }
}

/** Build a live differential ranking from the most recent specialist outputs.
 *  Weights are proportional to commitment level; primary of each specialist is
 *  weighted most, others in the differential at reduced weight. */
export function deriveDifferential(state: DebateState): DifferentialEntry[] {
  // Use the most recently-populated round's specialist outputs; otherwise empty.
  const rounds = Object.keys(state.specialistOutputs)
    .map(Number)
    .sort((a, b) => b - a);
  if (!rounds.length) return [];
  let latest: Partial<Record<Role, SpecialistOutput>> = {};
  for (const r of rounds) {
    latest = state.specialistOutputs[r];
    if (Object.keys(latest).length === 3) break;
  }

  const weights = new Map<string, number>();
  const commitmentScore: Record<CommitmentLevel, number> = {
    committed: 1.0,
    leading: 0.7,
    candidate: 0.4,
    considered: 0.15,
  };

  for (const role of SPECIALIST_ROLES) {
    const out = latest[role];
    if (!out) continue;
    out.differential.forEach((d, i) => {
      // First entry of each specialist's differential gets full commitment
      // weight; subsequent entries get progressively less.
      const positionFactor = 1 / (i + 1);
      const score = (commitmentScore[d.commitment] ?? 0.1) * positionFactor;
      weights.set(d.diagnosis_name, (weights.get(d.diagnosis_name) ?? 0) + score);
    });
  }

  const total = Array.from(weights.values()).reduce((a, b) => a + b, 0) || 1;
  const entries: DifferentialEntry[] = Array.from(weights.entries())
    .map(([name, w]) => ({ id: name, name, weight: w / total }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 6);

  if (entries.length) entries[0].color = 'lead';
  return entries;
}
