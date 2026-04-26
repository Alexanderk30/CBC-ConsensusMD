# Evaluation log

Narrative, round-by-round observations of PubMed eval runs. Complements
the scoring rubrics in each case's `_ground_truth.json` — this file
captures the forensic and behavioral side: what the system actually
did, what it reveals about prompt/architecture design, and what fixes
were applied mid-investigation along with their observed effect.

Each case gets its own section; entries within a section are dated and
tagged with the prompt / case-data version they run against.

---

## `eval-01-sam-vasculopathy`

Source: Minten et al., *Acta Gastroenterol Belg* 2022 —
https://pubmed.ncbi.nlm.nih.gov/35770291/

Ground-truth outcome: deadlock (PAN / Takayasu / SAM all surviving).
Ground-truth final diagnosis: Segmental arterial mediolysis (SAM), by
exclusion via Kalva clinical criteria.

### Trajectory — v2 case data, 2026-04-24

Run against the v2 case revision (autoimmune panel, hepatitis and HIV
serology all `pending` rather than returned negative — the "answer
key" the v1 case inadvertently shipped with was removed).

**Round 0 — blind specialists**

Gemini 3.1 Pro (mechanistic frame) memorization-patterned toward SAM.
On v2 data the evidence that would justify SAM over vasculitis at the
ED decision point (negative PET/CT, negative autoimmune workup) is
not yet available, so naming SAM here is a pattern-match on
"splanchnic dissection, middle-aged male, no atherosclerosis" rather
than a conclusion the available data supports. This is exactly the
memorization-tell documented in
`eval_metadata.memorization_risk.tell_tale_sign`.

**Round 1 — pre-fix: antagonist amplified memorization**

Antagonist proposed SAM as the challenge alternative. The antagonist
was effectively surfacing Gemini's minority-specialist position
rather than running an independent adversarial check. This compounds
a specialist-level memorization error into a system-level one — the
adversarial layer should be a corrective against specialist
pattern-matching, not an amplifier of it.

**Fix applied mid-run — `ANTAGONIST_PROMPT` ALTERNATIVE INDEPENDENCE**

Commit `c25368d`. New section in the antagonist prompt:

> Your proposed alternative must be a diagnosis you would challenge
> the leading diagnosis with even if no specialist had named it. Do
> not propose an alternative simply because a minority specialist
> leans toward it. Your role is an independent adversarial check on
> the leading diagnosis against the case, not a tie-breaker among the
> specialists.

**Round 1 — post-fix: likely still amplification**

Antagonist independently proposed SAM again. Read generously, the
antagonist reached SAM from the case findings alone. Read skeptically,
the prompt fix doesn't catch this failure mode: SAM is still the
"right" pattern-match target given the finding profile, and an
antagonist can arrive at a memorized answer independently just as
easily as a specialist can. The prompt fix is necessary but not
sufficient; the underlying prior on published-literature finding
profiles is not addressed by a single rule about specialist
independence.

**Round 2 — post-fix: architecture working correctly**

Antagonist independently proposed fibromuscular dysplasia (FMD) with
case-grounded reasoning. This is the calibrated behavior target: FMD
is in the correct differential neighborhood for splanchnic artery
dissection in a middle-aged adult without atherosclerosis, and the
antagonist picked a diagnosis that is (a) supported by the case and
(b) not in any specialist's position at that round. That's exactly
what ALTERNATIVE INDEPENDENCE was meant to produce — an adversarial
alternative that doesn't ride on the specialists' coattails.

**Final outcome:** TBD — update when the run completes.

### Calibration takeaways so far

- The ground truth's memorization-risk tell is real-world observable:
  Gemini hit it in Round 0 on v2 data that explicitly removed the
  answer key. The tell's written form ("cites Kalva criteria or SAM
  by name in Round 0 without being prompted by the findings") held
  under test.
- A single-rule prompt fix — "don't tie-break specialists" — partially
  addresses one failure mode but does not touch the underlying prior
  problem. An antagonist can independently arrive at a memorized
  answer. Fixing this well likely needs either (a) adversarial
  training-data diversity against published-case finding profiles,
  or (b) a stronger structural constraint (e.g., the antagonist must
  challenge with a diagnosis at least one specialist EXCLUDED rather
  than included, forcing genuine alternative search).
- Round 2's FMD proposal is the system's best evidence that the
  architecture can work when the prompt constraints align. The
  antagonist searched the case for a supportable challenge that no
  specialist had surfaced, and found one. That's the whole design
  intent visible in one output.
