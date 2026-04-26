# How Claude was used in this project

ConsensusMD uses Claude in two distinct ways: as a load-bearing
component of the product itself, and as a development collaborator
during the build. This document is an honest disclosure of both, so
hackathon judges can evaluate the work knowing what was AI-driven and
what was not.

---

## 1. Claude as a product component

ConsensusMD is a multi-agent diagnostic consultation system. Three of
its five agent roles are filled by Anthropic models:

| Role | Model | What it does |
|---|---|---|
| Eliminative specialist | **Claude Sonnet 4.6** | Reasons through "what cannot be missed" — enumerates dangerous alternatives, ranks the differential by safety. |
| Antagonist (OPHIS) | **Claude Opus 4.7** | Reads the three specialists' outputs each round and tries to falsify the leading diagnosis. The case must survive this skeptic before it reaches the clinician. |
| Consensus | **Claude Opus 4.7** | Synthesizes the surviving differential into either an integrated diagnosis or a structured referral. |

The other two specialist roles (probabilistic and mechanistic) are
filled by GPT-5.5 and Gemini 3.1 Pro Preview via OpenRouter. The
heterogeneity is deliberate — the architectural claim is that three
genuinely different frontier models pressure-tested by an antagonist
produce a stronger second opinion than three instances of any single
model, however capable.

Why this matters: **the safety property of the system depends on the
antagonist being a strong reasoner.** If OPHIS misses a credible
alternative, a wrong diagnosis can pass through unchallenged. The
choice of Opus 4.7 for the antagonist and consensus roles is the
single most consequential model decision in the project. See the
"Why these specific model assignments" section in `README.md` for
the full rationale, including honest acknowledgment that we did not
run systematic 4×6 model-to-role comparisons.

**Architectural invariant — information isolation.** Specialists
never see each other's reasoning. The antagonist sees only conclusions
plus anonymous A/B/C deltas, never the specialists' reasoning frames.
This invariant is enforced in `backend/orchestrator/state.py` and
verified by tests in `tests/test_debate_state.py`. It is the property
that makes the multi-agent setup more than a stylized prompt chain.

---

## 2. Claude as a development collaborator

The developer (the human author of this submission) built ConsensusMD
in collaboration with **Claude Opus 4.7 running inside Claude Code**.
Claude Code is Anthropic's interactive CLI for software engineering;
the developer drove the project end-to-end while delegating
implementation, refactoring, debugging, and documentation work to
Claude in conversation.

Concretely, Claude was the primary author of:

- **Frontend implementation.** React 19 + TypeScript + Vite. The full
  scene composition (`DebateScene.tsx`, `AgentNode.tsx`,
  `CaduceusCrest.tsx`), the debate theatre layout
  (`DebateTheatre.tsx`), the verdict surfaces
  (`Verdict.tsx`, `FloatingVerdict.tsx`), the four-step patient-intake
  wizard (`NewCaseIntake.tsx`), the live differential rail
  (`Differential.tsx`), the user-facing operating manual
  (`Instructions.tsx`), and the WebSocket + reducer hook
  (`useDebate.ts`).
- **Backend implementation.** FastAPI scaffolding (`backend/main.py`),
  WebSocket handler with disconnect-watcher and clean-close handshake
  (`backend/api/websocket.py`), the debate orchestrator with
  parallel specialist calls and convergence-state machine
  (`backend/orchestrator/debate.py`,
  `backend/orchestrator/state.py`), the unified `call_agent()`
  routing across Anthropic + OpenRouter with fallback retries and
  the Claude `tool_use` stringified-object workaround
  (`backend/agents/base.py`).
- **Schema validation.** Every Pydantic v2 model in
  `backend/schemas.py`, including the cross-field validators that
  refuse phrasing drift between `primary_diagnosis` and
  `differential[0].diagnosis_name`, the discriminated unions over
  reasoning frames and antagonist results, and the
  `extra="forbid"` strictness that catches schema noise from
  provider responses.
- **Test coverage.** All 90 backend tests under `tests/` —
  schema validation (39), debate-state and information-isolation
  invariants (32), the eval harness fuzzy matcher (6), the
  stringified-nested-object workaround (5), the WebSocket message
  contract (5), and the orchestrator integration tests (3).
- **Demo and dry-run infrastructure.** The recorded event sequences
  for the converge and deadlock dry-runs
  (`frontend/src/demo/demoSequences.ts`), the auto-vs-step playback
  control system, and the 3-second card-beat pacing override used
  for the video walkthrough.
- **Documentation.** `README.md` (architecture, run commands, model
  assignment rationale), `JUDGES.md`, the deployment configuration
  (`Dockerfile`, `.dockerignore`, `.env.template`), the per-case
  evaluation log (`cases/pubmed/EVAL_LOG.md`), and this file.
- **Operational hardening.** The startup env-var guard and degraded
  `/health` response, the WebSocket watchdog timer that surfaces a
  reset-able banner instead of hanging forever, the inline-case
  rendering path that fixed a stray 404 banner on form-submitted
  debates.

Of the 47 commits in the project's git history at time of writing,
43 list Claude (Opus 4.7) as a `Co-Authored-By` — Claude wrote the
diff and the human author reviewed and shipped it.

### How quality was maintained

Trusting Claude with this much of the codebase only works if the work
is verifiable. The mechanisms that kept it honest:

1. **Pydantic strict mode (`extra="forbid"`)** at every schema
   boundary catches both LLM phrasing drift in production and
   accidentally-introduced fields during refactors.
2. **Information-isolation tests** in `tests/test_debate_state.py`
   pin down the architectural invariant that specialists cannot see
   each other's reasoning. If a refactor accidentally leaks state
   across the boundary, the tests fail loudly.
3. **Senior-review passes.** Every significant feature batch was
   followed by a parallel review (Claude reading its own work as a
   fresh agent with no conversational context). Findings were
   triaged: real bugs were fixed (e.g., the chart-panel 404, the
   diagnosis-matching robustness), false positives were rejected
   with reasoning recorded in the commit message.
4. **End-to-end runs against the live deployment** before each
   significant push. Each demo case was run through the real
   provider APIs at least once, with the round-by-round trajectory
   logged in `cases/pubmed/EVAL_LOG.md`.
5. **Production smoke tests.** `/health` is a config probe (it
   reports `degraded` if the API keys are missing); the WebSocket
   handler emits explicit `error` events so failure modes surface
   to the UI rather than silently hanging.

---

## 3. What Claude did NOT do

This is as important as the list above. The following remained
human-driven:

- **The product vision and the architectural concept.** The idea of
  using an adversarial antagonist as a first-class agent — and of
  treating deadlock as a clinical finding rather than a system
  failure — was the developer's call, not Claude's. The framing of
  "uncertainty as the finding" came from the developer.
- **Clinical content review.** The five demo cases (postpartum PE,
  STEMI, Addison's, MS-vs-Lyme deadlock, endometriosis) and the
  PubMed evaluation case (segmental arterial mediolysis) were
  reviewed and curated by the developer for clinical realism. Claude
  drafted case scaffolds; the human author validated the medicine.
- **The agent system prompts.** The five system prompts in
  `backend/prompts.py` originated from a hand-authored specification
  (`consensusmd_prompts_v2.md`) that pre-dated Claude's involvement
  in implementation. Claude was used to refine specific clauses
  (most notably the antagonist's "alternative independence"
  constraint added in commit `c25368d`) but did not author the
  prompts wholesale.
- **Final aesthetic direction.** The "caduceus" visual identity,
  the OKLCH palette choices, and the typographic system were
  developer-led. Claude implemented within those constraints; the
  brief is captured in `.impeccable.md`.
- **Strategic decisions.** Model assignments (which specialist gets
  which model), case archetypes, the 4-round / 2-survival
  convergence rule, and the decision to surface deadlock as a
  structured referral rather than a failure — all human choices.
- **Manual testing and demo recording.** Every live demo run was
  driven by the developer in a real browser. The video walkthrough
  was recorded and narrated by the developer.
- **Submission decisions.** What to ship, what to defer, when to
  push, and the final-hour triage of the senior-review findings —
  all developer-led with Claude advising.

---

## 4. Honest summary

ConsensusMD is a system that *uses* Claude (twice over: as the
antagonist and as the consensus voice) and was *built with* Claude
(as the implementation collaborator inside Claude Code). The
developer's role was the one only a human could play — diagnosing
what the product needed to be, validating the medicine, and deciding
when each piece was ready. Claude's role was implementation,
refactoring, and documentation under that direction.

Both roles matter. We are flagging both transparently because we
think a clinical decision-support prototype owes its evaluators a
clear answer to the question "who built this, and how much of it did
the AI do?"
