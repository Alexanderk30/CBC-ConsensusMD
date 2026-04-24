// Scripted debate sequences for dry-run / dev mode.
//
// These let the frontend animate a full converge or deadlock arc without
// hitting Anthropic/OpenRouter — handy for iterating on visuals and for
// recording the demo video without burning API cost.
//
// Each sequence is a list of [delayMs, event] pairs. The delay is the pause
// AFTER the previous event fires, giving each beat a controllable tempo.

import type { DebateEvent, Role, AnonId, Diagnosis, CommitmentLevel } from '../types';

type TimedEvent = [number, DebateEvent];

const ANON: Record<Role, AnonId> = {
  probabilistic: 'A',
  mechanistic: 'B',
  eliminative: 'C',
};

// Shorthand to build a minimally-valid Diagnosis entry for the UI. The
// backend Pydantic schemas never see these — we dispatch the event straight
// into the reducer.
function dx(
  name: string,
  commitment: CommitmentLevel,
  support: string[],
  icd10 = 'I26.99',
): Diagnosis {
  return {
    diagnosis_name: name,
    icd10_approximate: icd10,
    commitment,
    supporting_evidence: support,
    refuting_evidence: [],
    alternative_explanation_considered: 'considered in differential',
  };
}

function specialist(
  round: number,
  role: Role,
  primary: string,
  commitment: CommitmentLevel,
  supporting: string[],
  alternates: Array<[string, CommitmentLevel]> = [],
  extra: { position_change?: string } = {},
): DebateEvent {
  const differential: Diagnosis[] = [
    dx(primary, commitment, supporting),
    ...alternates.map(([n, c]) => dx(n, c, ['alternate under consideration'])),
  ];
  // Ensure at least 2 entries in differential
  if (differential.length < 2) {
    differential.push(dx('Alternative', 'considered', ['ruled in the differential']));
  }
  const base = {
    event: 'specialist_output' as const,
    round,
    role,
    output: {
      differential,
      primary_diagnosis: primary,
      recommended_next_step: 'proceed with confirmatory testing',
      reasoning_frame: role,
      reasoning: {} as Record<string, unknown>,
      ...(round > 0
        ? {
            position_change: extra.position_change ?? 'maintained',
            response_to_challenge: {
              challenge_addressed: true,
              position_justification: 'position unchanged on re-examination',
            },
          }
        : {}),
    },
  };
  return base as DebateEvent;
}

// ───────────────────────────────────────────────────────────────────
// CONVERGE: postpartum-PE case. Specialists converge on PE; OPHIS
// challenges once, then passes twice → consensus converged at round 3.
// ───────────────────────────────────────────────────────────────────

export const CONVERGE_SEQUENCE: TimedEvent[] = [
  [0, { event: 'debate_started', case_id: 'demo-01-postpartum-pe', max_rounds: 4, anon_id_by_role: ANON }],
  [900, { event: 'round_started', round: 1 }],

  // Round 1 — all three specialists independently propose PE
  [1400, specialist(1, 'probabilistic', 'Pulmonary embolism', 'leading', [
    'Postpartum state — ~20x baseline VTE risk in first 6 weeks',
    'Pleuritic chest pain + tachycardia fits Wells criteria',
    'SpO₂ 94% on RA with clear lungs suggests V/Q mismatch',
  ], [['Postpartum cardiomyopathy', 'candidate'], ['Anxiety / panic', 'considered']])],

  [1600, specialist(1, 'mechanistic', 'Pulmonary embolism', 'leading', [
    'Virchow triad present: stasis (bedrest), hypercoagulability (postpartum), endothelial change (delivery)',
    'Pleuritic pain localized to inspiration — consistent with pleural inflammation',
    'Absence of leg swelling doesn\'t rule out PE — ~50% of cases lack clinical DVT',
  ], [['Viral pleurisy', 'candidate']])],

  [1700, specialist(1, 'eliminative', 'Pulmonary embolism', 'leading', [
    'Cannot-miss list: PE, PPCM, dissection, sepsis, MI',
    'EKG sinus tach without RV strain does not exclude PE',
    'Panic/anxiety cannot account for persistent hypoxemia',
  ], [['Postpartum cardiomyopathy', 'candidate'], ['Infectious pleurisy', 'considered']])],

  // Antagonist challenges — calls out missing D-dimer + CTPA
  [2000, { event: 'antagonist_output', round: 1, survival_count: 0, output: {
    round_number: 1,
    result: {
      type: 'challenge',
      challenged_diagnosis: 'Pulmonary embolism',
      proposed_alternative: 'Postpartum anxiety with benign sinus tachycardia',
      supporting_finding: 'Patient started sertraline 2 weeks ago for postpartum anxiety; sleep poor',
      reason_leading_diagnosis_fails: 'No D-dimer, no CTPA, no compression US — the team is anchoring on priors without the test that actually rules PE in or out',
      challenge_novelty: 'new_attack',
    },
  } }],

  [2400, { event: 'round_completed', round: 1, leading_diagnosis: 'Pulmonary embolism', leading_commitment: 'leading', survival_count: 0 }],

  // Round 2 — specialists respond to challenge, reinforce
  [1100, { event: 'round_started', round: 2 }],

  [1400, specialist(2, 'probabilistic', 'Pulmonary embolism', 'leading', [
    'Posterior probability with Wells ≥4 + postpartum >0.4 — anxiety priors don\'t rescue this',
    'Panic attacks rarely sustain SpO₂ <95% on RA',
    'Agree with antagonist on confirmatory workup — D-dimer + CTPA',
  ], [['Postpartum cardiomyopathy', 'candidate']], { position_change: 'maintained' })],

  [1600, specialist(2, 'mechanistic', 'Pulmonary embolism', 'leading', [
    'Sertraline does not produce pleuritic pain or V/Q mismatch — anxiety is not a mechanism for hypoxemia',
    'Mechanistic pathway for PE holds; anxiety is a concurrent finding, not an alternative explanation',
  ], [['Anxiety (concurrent)', 'considered']], { position_change: 'maintained' })],

  [1500, specialist(2, 'eliminative', 'Pulmonary embolism', 'leading', [
    'Anxiety cannot be the diagnosis while hypoxemia is unexplained — cannot-miss list still intact',
    'Agree workup: empiric anticoagulation consideration pending CTPA',
  ], [], { position_change: 'maintained' })],

  // Antagonist: no credible challenge (1st pass)
  [2200, { event: 'antagonist_output', round: 2, survival_count: 1, output: {
    round_number: 2,
    result: {
      type: 'no_credible_challenge',
      explanation: 'The team absorbed the challenge — confirmatory workup is now explicit. Anxiety does not explain SpO₂ 94% on RA with pleuritic pain. No remaining finding points to a different diagnosis.',
      alternatives_attempted: ['Postpartum anxiety', 'Viral pleurisy', 'Postpartum cardiomyopathy'],
    },
  } }],

  [2400, { event: 'round_completed', round: 2, leading_diagnosis: 'Pulmonary embolism', leading_commitment: 'leading', survival_count: 1 }],

  // Round 3 — specialists hold, antagonist passes again → converge
  [1100, { event: 'round_started', round: 3 }],

  [1400, specialist(3, 'probabilistic', 'Pulmonary embolism', 'committed', [
    'Pre-test probability + Wells + postpartum window remains dominant',
    'Plan: CTPA with empiric heparin pending imaging — standard of care',
  ], [], { position_change: 'confidence_raised' })],

  [1500, specialist(3, 'mechanistic', 'Pulmonary embolism', 'committed', [
    'All key findings (pleuritic pain, hypoxemia, tachycardia) unified by embolic V/Q mismatch',
    'No alternative mechanism explains the constellation',
  ], [], { position_change: 'confidence_raised' })],

  [1500, specialist(3, 'eliminative', 'Pulmonary embolism', 'committed', [
    'Cannot-miss list survived two passes — PE remains the only diagnosis consistent with all findings',
    'Concurrent anxiety noted but does not alter the primary call',
  ], [], { position_change: 'confidence_raised' })],

  [2200, { event: 'antagonist_output', round: 3, survival_count: 2, output: {
    round_number: 3,
    result: {
      type: 'no_credible_challenge',
      explanation: 'No further credible alternative. The diagnostic case is airtight: confirmatory workup is ordered, empiric anticoagulation is appropriate, and no unexplained finding remains.',
      alternatives_attempted: ['Postpartum cardiomyopathy', 'Viral pleurisy', 'Anxiety'],
    },
  } }],

  [2400, { event: 'round_completed', round: 3, leading_diagnosis: 'Pulmonary embolism', leading_commitment: 'committed', survival_count: 2 }],

  // Consensus — converged
  [1600, { event: 'consensus_started', outcome: 'converged', final_round: 3 }],

  [2000, { event: 'consensus_output', output: {
    outcome: 'converged',
    final_round: 3,
    output: {
      type: 'converged',
      primary_diagnosis: 'Pulmonary embolism (high pre-test probability)',
      commitment: 'committed',
      integrated_reasoning: {
        probabilistic_view: 'Postpartum + Wells criteria → pre-test probability >40%',
        mechanistic_view: 'Virchow triad satisfied; V/Q mismatch explains SpO₂ + pleuritic pain',
        eliminative_view: 'Anxiety and PPCM cannot produce unexplained hypoxemia with pleuritic pain',
        synthesis: 'Three independent reasoning frames converged on pulmonary embolism. The antagonist surfaced a critical gap — confirmatory imaging had not been ordered — and the team absorbed it. With CTPA + empiric anticoagulation on the plan, no remaining finding points elsewhere.',
      },
      supporting_evidence_consolidated: [
        'Postpartum day 18 — peak VTE risk window',
        'Pleuritic right-sided chest pain, SpO₂ 94% RA, HR 112',
        'Clear lungs, no JVD, no leg swelling (not required to exclude PE)',
      ],
      distinguishing_test: {
        test_name: 'CT pulmonary angiography',
        expected_finding: 'Filling defect in pulmonary arterial tree',
        rationale: 'Gold standard for PE in a hemodynamically stable patient with moderate-high pre-test probability',
      },
      residual_uncertainty: 'If CTPA is negative, consider V/Q scan or repeat imaging; PPCM is the next-most-likely diagnosis if dyspnea persists with normal imaging.',
      antagonist_challenges_addressed: [
        { challenge: 'Postpartum anxiety alternative', how_resolved: 'Anxiety cannot account for hypoxemia; concurrent finding, not primary' },
      ],
    },
  } }],

  [2400, { event: 'debate_complete', outcome: 'converged', final_round: 3 }],
];

// ───────────────────────────────────────────────────────────────────
// DEADLOCK: neuro case. Four rounds of challenges, specialists split
// on MS vs Lyme, antagonist never passes → deadlocked referral.
// ───────────────────────────────────────────────────────────────────

export const DEADLOCK_SEQUENCE: TimedEvent[] = [
  [0, { event: 'debate_started', case_id: 'demo-04-neuro-deadlock', max_rounds: 4, anon_id_by_role: ANON }],
  [900, { event: 'round_started', round: 1 }],

  [1400, specialist(1, 'probabilistic', 'Multiple sclerosis (relapsing-remitting)', 'leading', [
    '34F with optic-neuritis-like episode + sensory deficit — classic RRMS demographic',
    'Two discrete episodes separated in time and space',
    'ESR/CRP elevation modest, not typical of acute infection',
  ], [['Neuro-Lyme', 'candidate'], ['Functional / anxiety-driven', 'considered']])],

  [1600, specialist(1, 'mechanistic', 'Neuroborreliosis (Lyme)', 'leading', [
    'Outdoor exposure in Vermont + self-reported EM-like rash',
    'Migratory arthralgia + transient neuro findings fit Lyme dissemination',
    'Elevated CRP/ESR consistent with spirochetal inflammation',
  ], [['Multiple sclerosis', 'candidate']])],

  [1700, specialist(1, 'eliminative', 'Multiple sclerosis', 'candidate', [
    'Cannot-miss list: MS, Lyme, Sjögren, B12 deficiency, functional',
    'B12 + TSH normal, no clear cardinal finding distinguishing MS from Lyme without MRI or Lyme serology',
  ], [['Neuro-Lyme', 'candidate']])],

  [2000, { event: 'antagonist_output', round: 1, survival_count: 0, output: {
    round_number: 1,
    result: {
      type: 'challenge',
      challenged_diagnosis: 'Multiple sclerosis (relapsing-remitting)',
      proposed_alternative: 'Neuroborreliosis (early disseminated Lyme)',
      supporting_finding: 'Patient self-reported a "red splotch" on her thigh during camping in upstate NY/VT — consistent with erythema migrans',
      reason_leading_diagnosis_fails: 'MS cannot explain the migratory arthralgia or the elevated CRP; Lyme can explain both plus the transient neuro findings',
      challenge_novelty: 'new_attack',
    },
  } }],

  [2400, { event: 'round_completed', round: 1, leading_diagnosis: 'Multiple sclerosis (relapsing-remitting)', leading_commitment: 'candidate', survival_count: 0 }],

  // Round 2 — no convergence; challenge continues
  [1100, { event: 'round_started', round: 2 }],

  [1400, specialist(2, 'probabilistic', 'Multiple sclerosis (relapsing-remitting)', 'leading', [
    'Base rate for MS in 30s female >> base rate for neuro-Lyme even in endemic area',
    'EM rash by patient report is nonspecific — many rashes claimed as EM are not',
  ], [['Neuro-Lyme', 'candidate']], { position_change: 'maintained' })],

  [1600, specialist(2, 'mechanistic', 'Neuroborreliosis', 'leading', [
    'Joint involvement + elevated inflammatory markers is not explained by MS',
    'Temporal coincidence with tick exposure is not a coincidence in an endemic region',
  ], [['Multiple sclerosis', 'candidate']], { position_change: 'maintained' })],

  [1500, specialist(2, 'eliminative', 'Workup-dependent (MS vs Lyme)', 'candidate', [
    'Neither diagnosis can be elevated to "leading" without MRI brain/spine and Lyme serology',
    'Both remain cannot-miss — treatment for one without ruling out the other is harmful',
  ], [], { position_change: 'differential_reordered' })],

  // R2 OPHIS flips — now challenges the Lyme advocate. Shows the skeptic
  // attacks BOTH sides of a genuine clinical split, not a fixed enemy.
  [2200, { event: 'antagonist_output', round: 2, survival_count: 0, output: {
    round_number: 2,
    result: {
      type: 'challenge',
      challenged_diagnosis: 'Neuroborreliosis',
      proposed_alternative: 'Lyme cannot be elevated without two-tier serology',
      supporting_finding: 'Patient self-reported rash without clinical photograph; no tick attachment confirmed; no documented expanding erythema',
      reason_leading_diagnosis_fails: 'An EM-like rash by patient recall is not a diagnosis. Treating empirically for Lyme before serology anchors on a single unconfirmed finding.',
      challenge_novelty: 'new_attack',
    },
  } }],

  [2400, { event: 'round_completed', round: 2, leading_diagnosis: 'Multiple sclerosis (relapsing-remitting)', leading_commitment: 'candidate', survival_count: 0 }],

  // Round 3 — still no convergence
  [1100, { event: 'round_started', round: 3 }],

  [1500, specialist(3, 'probabilistic', 'Multiple sclerosis (relapsing-remitting)', 'candidate', [
    'Posterior too close to call without MRI + serology — will not commit further',
  ], [['Neuro-Lyme', 'candidate']], { position_change: 'confidence_lowered' })],

  [1500, specialist(3, 'mechanistic', 'Neuroborreliosis', 'candidate', [
    'Mechanistic weight of Lyme remains — but recognize priors argue against without serologic confirmation',
  ], [['Multiple sclerosis', 'candidate']], { position_change: 'confidence_lowered' })],

  [1500, specialist(3, 'eliminative', 'Workup-dependent', 'candidate', [
    'No elimination possible from current data. Both diagnoses survive.',
  ], [], { position_change: 'maintained' })],

  // R3 OPHIS flips again — challenges the eliminative "workup-dependent"
  // stance itself. Refusing to call IS a call, and the wrong one under
  // acute pressure. Targets Sonnet.
  [2200, { event: 'antagonist_output', round: 3, survival_count: 0, output: {
    round_number: 3,
    result: {
      type: 'challenge',
      challenged_diagnosis: 'Workup-dependent',
      proposed_alternative: 'Empiric parallel workup — MRI + serology, not serial hedging',
      supporting_finding: 'The "workup-dependent" stance defers action, but the two treatment paths are incompatible — delay favors Lyme progression',
      reason_leading_diagnosis_fails: 'Refusing to commit is itself a commitment to wait. With a possible spirochetal CNS infection, that posture has a cost.',
      challenge_novelty: 'new_attack',
    },
  } }],

  [2400, { event: 'round_completed', round: 3, leading_diagnosis: 'Split', leading_commitment: 'candidate', survival_count: 0 }],

  // Round 4 — final round, still no convergence → deadlock
  [1100, { event: 'round_started', round: 4 }],

  [1500, specialist(4, 'probabilistic', 'Multiple sclerosis (relapsing-remitting)', 'candidate', [
    'Maintaining priors-based call pending MRI',
  ], [['Neuro-Lyme', 'candidate']], { position_change: 'maintained' })],

  [1500, specialist(4, 'mechanistic', 'Neuroborreliosis', 'candidate', [
    'Maintaining mechanistic call pending Lyme serology',
  ], [['Multiple sclerosis', 'candidate']], { position_change: 'maintained' })],

  [1500, specialist(4, 'eliminative', 'Workup-dependent', 'candidate', [
    'Deadlock is the honest call — this requires imaging + serology before a safe diagnosis',
  ], [], { position_change: 'maintained' })],

  [2200, { event: 'antagonist_output', round: 4, survival_count: 0, output: {
    round_number: 4,
    result: {
      type: 'challenge',
      challenged_diagnosis: 'Multiple sclerosis (relapsing-remitting)',
      proposed_alternative: 'Neuroborreliosis',
      supporting_finding: 'Final-round stance: the case remains unresolved on clinical grounds',
      reason_leading_diagnosis_fails: 'Neither hypothesis dominates. Force-converging here would be overconfidence.',
      challenge_novelty: 'refinement_of_previous',
    },
  } }],

  [2400, { event: 'round_completed', round: 4, leading_diagnosis: 'Split · MS vs Lyme', leading_commitment: 'candidate', survival_count: 0 }],

  // Consensus — deadlocked referral
  [1600, { event: 'consensus_started', outcome: 'deadlocked', final_round: 4 }],

  [2200, { event: 'consensus_output', output: {
    outcome: 'deadlocked',
    final_round: 4,
    output: {
      type: 'deadlocked',
      competing_hypotheses: [
        {
          diagnosis: 'Multiple sclerosis (relapsing-remitting)',
          supporting_evidence: ['Two discrete neuro episodes separated in time/space', 'Demographics fit', 'Transient sensory deficit + optic involvement'],
          distinguishing_test: 'MRI brain & spine with contrast; CSF oligoclonal bands',
          why_not_ruled_out: 'Persistent joint involvement and elevated inflammatory markers are not typical',
        },
        {
          diagnosis: 'Neuroborreliosis (early disseminated Lyme)',
          supporting_evidence: ['Endemic-area tick exposure', 'Self-reported EM-like rash', 'Migratory arthralgia + transient neuro findings'],
          distinguishing_test: 'Two-tier Lyme serology (ELISA → Western blot); consider CSF Lyme PCR',
          why_not_ruled_out: 'Base rate for MS in demographic is higher; EM by patient report is nonspecific',
        },
      ],
      recommended_next_action: 'Obtain MRI brain & spine with contrast AND two-tier Lyme serology in parallel. Do not initiate immunomodulators for MS before Lyme is excluded.',
      referral_urgency: 'urgent',
      reason_for_deadlock: 'The clinical data alone cannot distinguish MS from neuroborreliosis; both are cannot-miss, and the treatment pathways are incompatible. Deadlock here is the safe finding.',
    },
  } }],

  [2400, { event: 'debate_complete', outcome: 'deadlocked', final_round: 4 }],
];

// ───────────────────────────────────────────────────────────────────
// Replay engine. Dispatches events on a cumulative timer. Returns a
// cancel function so the caller can abort mid-sequence.
// ───────────────────────────────────────────────────────────────────

export function playSequence(
  seq: TimedEvent[],
  onEvent: (e: DebateEvent) => void,
  speed = 1,
): () => void {
  let cancelled = false;
  const timers: ReturnType<typeof setTimeout>[] = [];
  let cumulative = 0;
  for (const [delay, event] of seq) {
    cumulative += delay / speed;
    const t = setTimeout(() => {
      if (!cancelled) onEvent(event);
    }, cumulative);
    timers.push(t);
  }
  return () => {
    cancelled = true;
    timers.forEach(clearTimeout);
  };
}

// ───────────────────────────────────────────────────────────────────
// CONVERGE-SKIP: fast-forward to the convergence moment. Fires the
// debate-started event + just enough agent state for the Differential
// panel to render, then jumps directly to the convergence event. For
// iterating on the convergence animation without waiting three rounds.
// ───────────────────────────────────────────────────────────────────

export const CONVERGE_SKIP_SEQUENCE: TimedEvent[] = [
  [0, { event: 'debate_started', case_id: 'demo-01-postpartum-pe', max_rounds: 4, anon_id_by_role: ANON }],
  [200, { event: 'round_started', round: 1 }],
  // Enough specialist outputs so the differential panel + leading diagnosis
  // look populated (no waiting — fire them in quick succession).
  [150, specialist(1, 'probabilistic', 'Pulmonary embolism', 'committed', [
    'Postpartum state + pleuritic pain + hypoxemia',
    'Wells criteria elevated',
  ])],
  [150, specialist(1, 'mechanistic', 'Pulmonary embolism', 'committed', [
    'Virchow triad satisfied',
    'V/Q mismatch explains findings',
  ])],
  [150, specialist(1, 'eliminative', 'Pulmonary embolism', 'committed', [
    'Cannot-miss survived review',
    'No alternative explains hypoxemia',
  ])],
  [200, { event: 'antagonist_output', round: 1, survival_count: 2, output: {
    round_number: 1,
    result: {
      type: 'no_credible_challenge',
      explanation: 'No credible alternative remains. Case airtight.',
      alternatives_attempted: [],
    },
  } }],
  [250, { event: 'round_completed', round: 1, leading_diagnosis: 'Pulmonary embolism', leading_commitment: 'committed', survival_count: 2 }],
  [400, { event: 'consensus_started', outcome: 'converged', final_round: 1 }],
  // The consensus_output event triggers the convergence animation — this
  // is the moment we're actually iterating on.
  [600, { event: 'consensus_output', output: {
    outcome: 'converged',
    final_round: 1,
    output: {
      type: 'converged',
      primary_diagnosis: 'Pulmonary embolism (high pre-test probability)',
      commitment: 'committed',
      integrated_reasoning: {
        probabilistic_view: 'Postpartum + Wells → pre-test probability >40%',
        mechanistic_view: 'Virchow triad; V/Q mismatch',
        eliminative_view: 'No alternative explains the constellation',
        synthesis: 'Three reasoning frames converged on pulmonary embolism. The antagonist found no credible alternative. CTPA + empiric anticoagulation on the plan.',
      },
      supporting_evidence_consolidated: [
        'Postpartum day 18 — peak VTE risk',
        'Pleuritic right-sided chest pain, SpO₂ 94%, HR 112',
        'Clear lungs, no JVD, no leg swelling',
      ],
      distinguishing_test: {
        test_name: 'CT pulmonary angiography',
        expected_finding: 'Filling defect in pulmonary arterial tree',
        rationale: 'Gold standard for PE in stable patient with moderate-high pre-test probability',
      },
      residual_uncertainty: 'If CTPA negative, consider V/Q scan; PPCM is next-most-likely.',
      antagonist_challenges_addressed: [],
    },
  } }],
  [2800, { event: 'debate_complete', outcome: 'converged', final_round: 1 }],
];

export const DEMO_SEQUENCES = {
  converge: CONVERGE_SEQUENCE,
  deadlock: DEADLOCK_SEQUENCE,
  'converge-skip': CONVERGE_SKIP_SEQUENCE,
} as const;

export type DemoVariant = keyof typeof DEMO_SEQUENCES;
