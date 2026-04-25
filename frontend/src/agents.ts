// Agent display metadata — maps backend role → visual identity (glyph, name,
// position). The design handoff placed specialists in a diamond around a
// central crest, with the antagonist at the bottom.
//
// Backend model assignments (locked):
//   probabilistic → GPT-5.4 via OpenRouter
//   mechanistic   → Gemini 3.1 Pro via OpenRouter
//   eliminative   → Claude Sonnet 4.6 via Anthropic
//   antagonist    → Claude Opus 4.7 via Anthropic
//   consensus     → Claude Opus 4.7 via Anthropic (off-stage; the crest)
//
// The human user sees these names in the UI. The antagonist never sees
// which underlying model produced which specialist conclusion — that
// anonymity is enforced server-side via the A/B/C mapping.

import type { AgentId, CommitmentLevel } from './types';

export interface AgentMeta {
  id: AgentId;
  name: string;
  role: string;
  glyph: string;
  kind: 'specialist' | 'antagonist';
}

export interface AgentPos {
  x: number;
  y: number;
}

export const AGENTS: Record<AgentId, AgentMeta> = {
  eliminative: {
    id: 'eliminative',
    name: 'SONNET 4.6',
    role: 'Eliminative reasoning',
    glyph: 'Ω',
    kind: 'specialist',
  },
  mechanistic: {
    id: 'mechanistic',
    name: 'GEMINI 3.1 PRO',
    role: 'Mechanistic reasoning',
    glyph: 'Γ',
    kind: 'specialist',
  },
  probabilistic: {
    id: 'probabilistic',
    name: 'GPT-5.4',
    role: 'Probabilistic reasoning',
    glyph: 'Ψ',
    kind: 'specialist',
  },
  antagonist: {
    id: 'antagonist',
    name: 'OPHIS · OPUS 4.7',
    role: 'Adversarial skeptic',
    glyph: '†',
    kind: 'antagonist',
  },
};

// Diamond layout, 900×640 design canvas, 0,0 at center.
export const AGENT_POS: Record<AgentId, AgentPos> = {
  eliminative: { x: 0, y: -210 },
  mechanistic: { x: -290, y: -20 },
  probabilistic: { x: 290, y: -20 },
  antagonist: { x: 0, y: 210 },
};

export const AGENT_ORDER: AgentId[] = [
  'eliminative',
  'mechanistic',
  'probabilistic',
  'antagonist',
];

export const SPECIALIST_ROLES: Array<Exclude<AgentId, 'antagonist'>> = [
  'probabilistic',
  'mechanistic',
  'eliminative',
];

// Commitment → confidence-bar fill [0..1]. Anchored on the four-level
// commitment scheme, not a real probability.
export const COMMITMENT_TO_CONFIDENCE: Record<CommitmentLevel, number> = {
  committed: 0.95,
  leading: 0.75,
  candidate: 0.5,
  considered: 0.25,
};
