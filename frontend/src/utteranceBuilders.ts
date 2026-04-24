// Utterance assembly — pure functions that convert server-shaped outputs
// (specialist / antagonist / consensus) into the `Utterance` rows that
// the Transcript renders and the DebateScene derives its headline from.
//
// Split out of events.ts so the reducer module stays focused on state
// transitions. Nothing here depends on DebateState — every helper takes
// its own inputs and returns a value.

import type {
  AntagonistOutput,
  CommitmentLevel,
  ConsensusOutput,
  Role,
  SpecialistOutput,
  SpecialistRoundNOutput,
} from './types';
import type { Utterance, UtteranceKind } from './events';

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
export function shortBullet(s: string, max = 80): string {
  const cleaned = s
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.;:,]+$/, '');
  return truncate(cleaned, max);
}

/** Pull up to N short reasoning bullets out of raw LLM narrative. Prefers
 *  numbered-list markers; falls back to sentence splits. */
export function extractBullets(text: string, n: number, max = 80): string[] {
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
export function utteranceFromSpecialist(
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
      action:
        kind === 'flip'
          ? 'changed primary'
          : kind === 'concede'
            ? 'lowered confidence'
            : kind === 'reinforce'
              ? 'maintained'
              : undefined,
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
export function utteranceFromAntagonist(round: number, output: AntagonistOutput): Utterance {
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
export function utteranceFromConsensus(consensus: ConsensusOutput): Utterance {
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
