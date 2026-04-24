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

export interface UtteranceHeadline {
  // Scene-bubble summary: what the agent thinks (position), how strongly
  // (commitment), and up to 3 short bullets of core reasoning. Transcript
  // still uses the full `text`.
  position?: string;
  commitment?: CommitmentLevel;
  action?: string;
  bullets?: string[];
}

export interface Utterance {
  id: string;
  round: number;
  from: AgentId | 'consensus';
  target?: AgentId;
  kind: UtteranceKind;
  text: string;
  meta?: string;
  headline?: UtteranceHeadline;
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

/** Condense an LLM-generated sentence/clause into a short bullet. Strips
 *  markdown bold, collapses whitespace, trims trailing punctuation, caps at
 *  ~80 chars so the scene bubble stays legible. */
function shortBullet(s: string, max = 80): string {
  const cleaned = s
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.;:,]+$/, '');
  return truncate(cleaned, max);
}

/** Pull up to N short reasoning bullets out of raw LLM narrative. Prefers
 *  numbered-list markers; falls back to sentence splits. */
function extractBullets(text: string, n: number, max = 80): string[] {
  const t = text.replace(/\s+/g, ' ').trim();
  // Numbered markers "1. ...", "2. ..." (anywhere, not just line start)
  const listScan = /(?:^|[\s:—])(\d+)\.\s+/g;
  const starts: number[] = [];
  let hit: RegExpExecArray | null;
  while ((hit = listScan.exec(t)) !== null) {
    starts.push(hit.index + hit[0].indexOf(hit[1]));
  }
  if (starts.length >= 2) {
    const items: string[] = [];
    for (let i = 0; i < starts.length && items.length < n; i++) {
      const start = starts[i];
      const end = i + 1 < starts.length ? starts[i + 1] : t.length;
      const piece = t.slice(start, end).replace(/^\d+\.\s*/, '');
      // Many LLMs write "Name: explanation" — prefer the Name if present.
      const labelMatch = piece.match(/^([^:]{3,60})[:\s]/);
      items.push(shortBullet(labelMatch ? labelMatch[1] : piece, max));
    }
    return items.filter(Boolean);
  }
  // Fallback: sentence split
  const sentences = t.split(/(?<=[.!?])\s+/).filter((s) => s.length > 10);
  return sentences.slice(0, n).map((s) => shortBullet(s, max));
}

/** Render a list of strings as inline numbered items ("1. X 2. Y 3. Z").
 *  FormattedText detects 2+ numbered markers and renders them as an
 *  em-dashed bullet list, so this works for sections with 1+ items. */
function listInline(items: string[]): string {
  return items.map((s, i) => `${i + 1}. ${s}`).join(' ');
}

/** Assemble the full specialist reasoning shell for the transcript.
 *  Every field from the specialist output that carries clinical meaning
 *  surfaces here — the scene bubble's `headline` is the condensed echo. */
function specialistFullText(output: SpecialistOutput, round: number): string {
  const primary = output.primary_diagnosis;
  const top = output.differential[0];
  const commit = top?.commitment;
  const supporting = top?.supporting_evidence ?? [];
  const refuting = top?.refuting_evidence ?? [];
  const altConsidered = top?.alternative_explanation_considered;
  const nextStep = output.recommended_next_step;

  const parts: string[] = [];
  parts.push(
    commit
      ? `**Primary:** ${primary} — *${describeCommitment(commit)}*`
      : `**Primary:** ${primary}`,
  );
  if (supporting.length) {
    parts.push(`**Supporting evidence:** ${listInline(supporting)}`);
  }
  if (refuting.length) {
    parts.push(`**Refuting evidence:** ${listInline(refuting)}`);
  }
  if (altConsidered) {
    parts.push(`**Alternative considered:** ${altConsidered}`);
  }
  if (nextStep) {
    parts.push(`**Next step:** ${nextStep}`);
  }
  if (round > 0) {
    const r = output as SpecialistRoundNOutput;
    if (r.position_change) {
      parts.push(`**Position change:** ${r.position_change.replace(/_/g, ' ')}`);
    }
    if (r.response_to_challenge?.position_justification) {
      parts.push(`**Response to challenge:** ${r.response_to_challenge.position_justification}`);
    }
  }
  return parts.join('\n\n');
}

/** Build a transcript-ready utterance from a specialist output. */
function utteranceFromSpecialist(
  round: number,
  role: Role,
  output: SpecialistOutput,
): Utterance {
  const primary = output.primary_diagnosis;
  const commit = output.differential[0]?.commitment;
  const pcChange = (output as SpecialistRoundNOutput).position_change;

  let kind: UtteranceKind = 'claim';
  if (round > 0) {
    if (pcChange === 'primary_diagnosis_changed') kind = 'flip';
    else if (pcChange === 'confidence_lowered') kind = 'concede';
    else kind = 'reinforce';
  }

  const meta = commit ? `${role} · ${describeCommitment(commit)}` : role;

  // Condensed headline for scene bubble: position + top 3 supporting findings.
  const bullets = (output.differential[0]?.supporting_evidence ?? [])
    .slice(0, 3)
    .map((s) => shortBullet(s, 80))
    .filter(Boolean);

  return {
    id: mkId(`sp-${round}-${role}`),
    round,
    from: role,
    kind,
    // Transcript uses the full reasoning shell; bubble uses `headline`.
    text: specialistFullText(output, round),
    meta,
    headline: {
      position: primary,
      commitment: commit,
      bullets,
      action: kind === 'flip' ? 'changed primary' : kind === 'concede' ? 'lowered confidence' : kind === 'reinforce' ? 'maintained' : undefined,
    },
  };
}

/** Assemble the full antagonist reasoning shell for the transcript. */
function antagonistFullText(output: AntagonistOutput): string {
  const res = output.result;
  if (res.type === 'challenge') {
    const parts: string[] = [];
    parts.push(`**Challenged diagnosis:** ${res.challenged_diagnosis}`);
    parts.push(`**Proposed alternative:** ${res.proposed_alternative}`);
    parts.push(`**Supporting finding:** ${res.supporting_finding}`);
    parts.push(`**Reason the leading diagnosis fails:** ${res.reason_leading_diagnosis_fails}`);
    if (res.challenge_novelty) {
      parts.push(`**Challenge novelty:** ${res.challenge_novelty.replace(/_/g, ' ')}`);
    }
    return parts.join('\n\n');
  }
  const parts: string[] = [res.explanation];
  if (res.alternatives_attempted?.length) {
    parts.push(`**Alternatives attempted:** ${res.alternatives_attempted.join(' · ')}`);
  }
  return parts.join('\n\n');
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
      text: antagonistFullText(output),
      meta: `challenging ${res.challenged_diagnosis}`,
      headline: {
        position: res.proposed_alternative,
        action: `challenging ${res.challenged_diagnosis}`,
        bullets: [
          shortBullet(res.supporting_finding, 80),
          shortBullet(res.reason_leading_diagnosis_fails, 80),
        ].filter(Boolean),
      },
    };
  }
  return {
    id: mkId(`ant-${round}`),
    round,
    from: 'antagonist',
    kind: 'pass',
    text: antagonistFullText(output),
    meta: 'no credible challenge',
    headline: {
      position: 'No credible challenge',
      action: 'stood down',
      bullets: extractBullets(res.explanation, 3, 80),
    },
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
      // Antagonist in round N challenges the specialists who spoke in that
      // same round. Fall back to the previous round's positions only if the
      // current round isn't populated yet (defensive; event ordering should
      // always put specialist_output before antagonist_output for the round).
      const specialistsAtRound =
        next.specialistOutputs[event.round] ??
        next.specialistOutputs[event.round - 1] ??
        {};
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
