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
} from './types';
import type { AgentId, AnonId } from './types';
import { SPECIALIST_ROLES } from './agents';
import {
  utteranceFromAntagonist,
  utteranceFromConsensus,
  utteranceFromSpecialist,
} from './utteranceBuilders';

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
  // Agents currently in-flight for an API call — derived from the event
  // stream (round_started populates; each output event removes the role
  // that produced it). Drives the "thinking" pulse on AgentNode so the
  // UI shows activity during the silent gaps while specialists are
  // running in parallel server-side.
  thinking: AgentId[];
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
  thinking: [],
};

/** Which specialist (if any) the antagonist's challenge "targets" visually.
 *  Tolerant of LLM phrasing drift between the antagonist's `challenged_diagnosis`
 *  and a specialist's `primary_diagnosis` ("MS" vs "Multiple sclerosis (RRMS)",
 *  parenthetical qualifiers, hyphenation) by falling back from exact normalized
 *  match to substring containment to leading-token overlap. The red ring on
 *  the targeted node is the only visual signal that a challenge is live, so
 *  silently failing to find a target would lose that signal. */
function challengeTarget(
  challenged: string,
  specialistsAtRound: Partial<Record<Role, SpecialistOutput>>,
): AgentId | undefined {
  const normalize = (s: string) =>
    s.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const challengedNorm = normalize(challenged);
  if (!challengedNorm) return undefined;

  // Pass 1: exact normalized match.
  for (const role of SPECIALIST_ROLES) {
    const out = specialistsAtRound[role];
    if (out && normalize(out.primary_diagnosis) === challengedNorm) return role;
  }

  // Pass 2: substring containment in either direction. Catches the common
  // pattern where one side carries a parenthetical qualifier the other drops.
  for (const role of SPECIALIST_ROLES) {
    const out = specialistsAtRound[role];
    if (!out) continue;
    const primaryNorm = normalize(out.primary_diagnosis);
    if (!primaryNorm) continue;
    if (challengedNorm.includes(primaryNorm) || primaryNorm.includes(challengedNorm)) {
      return role;
    }
  }

  // Pass 3: leading-token overlap (first significant word matches). Catches
  // abbreviation/expansion cases where neither side is a substring of the
  // other but they share a discriminating noun (e.g. "Pulmonary embolism" vs
  // "PE with hemodynamic stability"). Two-token minimum on either side keeps
  // accidental matches on common stopwords (e.g. "Acute") from firing.
  const challengedTokens = challengedNorm.split(' ');
  for (const role of SPECIALIST_ROLES) {
    const out = specialistsAtRound[role];
    if (!out) continue;
    const primaryTokens = normalize(out.primary_diagnosis).split(' ');
    if (primaryTokens.length < 2 || challengedTokens.length < 2) continue;
    if (primaryTokens[0] === challengedTokens[0] && primaryTokens[1] === challengedTokens[1]) {
      return role;
    }
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
        thinking: [],
        error: undefined,
      };

    case 'round_started': {
      // At round start, every agent expected to contribute this round is
      // marked as in-flight until their output event clears them.
      //   Round 0 → blind specialists only, no antagonist.
      //   Round ≥1 → antagonist + specialists (either may speak first,
      //              depending on server ordering).
      const thinking: AgentId[] =
        event.round === 0
          ? [...SPECIALIST_ROLES]
          : [...SPECIALIST_ROLES, 'antagonist'];
      return { ...next, currentRound: event.round, thinking };
    }

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
        thinking: next.thinking.filter((r) => r !== event.role),
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
        thinking: next.thinking.filter((r) => r !== 'antagonist'),
      };
    }

    case 'round_completed':
      return {
        ...next,
        leadingDiagnosis: event.leading_diagnosis,
        leadingCommitment: event.leading_commitment,
        survivalCount: event.survival_count,
        // Safety — if any role never emitted (backend bug / aborted round)
        // we don't want its thinking pulse stuck on forever.
        thinking: [],
      };

    case 'consensus_started':
      return { ...next, outcome: event.outcome, finalRound: event.final_round, thinking: [] };

    case 'consensus_output': {
      const utt = utteranceFromConsensus(event.output);
      return {
        ...next,
        consensus: event.output,
        utterances: [...next.utterances, utt],
        activeUtteranceId: utt.id,
        thinking: [],
      };
    }

    case 'debate_complete':
      return {
        ...next,
        phase: 'complete',
        outcome: event.outcome,
        finalRound: event.final_round,
        thinking: [],
      };

    case 'error':
      return { ...next, phase: 'error', error: event.message, thinking: [] };
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

  // Aggregate weights keyed by a case-insensitive, whitespace-normalized
  // form of the diagnosis so specialists writing "Pulmonary Embolism" vs
  // "Pulmonary embolism" don't produce two distinct rows. Preserve the
  // first casing we see for display; subsequent identical diagnoses merge
  // into that row regardless of capitalization or extra spaces.
  const merged = new Map<string, { weight: number; displayName: string }>();
  const commitmentScore: Record<CommitmentLevel, number> = {
    committed: 1.0,
    leading: 0.7,
    candidate: 0.4,
    considered: 0.15,
  };
  // Canonical key: lowercase + whitespace-collapse + strip a trailing
  // parenthetical abbreviation. The last rule handles LLM phrasing drift
  // where one specialist writes "Segmental arterial mediolysis (SAM)" and
  // another writes "Segmental arterial mediolysis" — both should merge into
  // one row. Trailing-only to avoid accidentally merging things like
  // "HELLP (pregnancy-associated)" with "HELLP" + something else later.
  const canonicalize = (name: string) =>
    name
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/\s*\([^)]{1,10}\)\s*$/, '')
      .trim();

  for (const role of SPECIALIST_ROLES) {
    const out = latest[role];
    if (!out) continue;
    out.differential.forEach((d, i) => {
      // First entry of each specialist's differential gets full commitment
      // weight; subsequent entries get progressively less.
      const positionFactor = 1 / (i + 1);
      const score = (commitmentScore[d.commitment] ?? 0.1) * positionFactor;
      const key = canonicalize(d.diagnosis_name);
      const existing = merged.get(key);
      if (existing) {
        existing.weight += score;
      } else {
        merged.set(key, { weight: score, displayName: d.diagnosis_name.trim() });
      }
    });
  }

  const total = Array.from(merged.values()).reduce((a, b) => a + b.weight, 0) || 1;
  const entries: DifferentialEntry[] = Array.from(merged.entries())
    .map(([key, { weight, displayName }]) => ({
      id: key,
      name: displayName,
      weight: weight / total,
    }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 6);

  if (entries.length) entries[0].color = 'lead';
  return entries;
}
