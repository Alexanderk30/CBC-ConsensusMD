# ConsensusMD

Multi-agent adversarial diagnostic consultation system. Three frontier
models reason about a clinical case using three different reasoning frames
(probabilistic / mechanistic / eliminative). A Claude Opus antagonist
stress-tests the leading diagnosis each round. The system converges (two
consecutive rounds with no credible challenge) or deadlocks (4 rounds) —
a consensus agent then produces either an integrated diagnosis or a
structured referral with competing hypotheses.

Built for the Claude Builders Club Hackathon (April 22–26, 2026).
**Clinician-facing decision support prototype. Not a patient-facing
diagnostic tool.**

> **Live demo:** https://cbc-lazarus-production.up.railway.app/
> **Judges:** see [JUDGES.md](./JUDGES.md) for a 60-second tour.

---

## Quickstart

```bash
# Install
python3 -m pip install -e .[dev,runtime]

# Copy the env template and fill in keys
cp .env.template .env   # edit with your ANTHROPIC_API_KEY + OPENROUTER_API_KEY

# Run tests
python3 -m pytest tests/ -q

# Run a case end-to-end (hits real APIs; ~3-5 min on Opus)
python3 scripts/run_case.py cases/demo/case_02_stemi.json

# Start the FastAPI server (frontend connects via WebSocket)
uvicorn backend.main:app --reload --port 8000
```

## Architecture

```
backend/
├── main.py                # FastAPI app entry
├── schemas.py             # Pydantic v2 models (full spec in consensusmd_schemas.md)
├── prompts.py             # Five system prompts (from consensusmd_prompts_v2.md)
├── agents/base.py         # Unified call_agent(): Anthropic + OpenRouter routing,
│                          # fallback retry, prompt caching, tool_use quirk workaround
├── orchestrator/
│   ├── state.py           # DebateState — information-isolation boundary
│   └── debate.py          # run_debate — main control loop + event streaming
├── api/websocket.py       # WebSocket endpoint
└── evaluation/runner.py   # Batch eval harness for held-out cases

cases/demo/                # 5 demo cases + ground-truth sidecars
cases/pubmed/              # Held-out PubMed evaluation fixtures
scripts/                   # run_case.py, smoke_test_agents.py
tests/                     # 75 passing unit tests (schemas, state, workarounds)
```

**Model assignments (locked):**

| Role | Provider | Model |
|---|---|---|
| Probabilistic specialist | OpenRouter | GPT-5.5 (env-overridable) |
| Mechanistic specialist | OpenRouter | Gemini 3.1 Pro Preview |
| Eliminative specialist | Anthropic | Claude Sonnet 4.6 |
| Antagonist | Anthropic | Claude Opus 4.7 |
| Consensus | Anthropic | Claude Opus 4.7 |

### Why these specific model assignments

ConsensusMD uses four distinct frontier models across five roles. The
assignments were made based on specific characteristics of each model,
not on general reasoning strength. The rationale for each:

**GPT-5.5 as probabilistic specialist.** GPT-5.5 has demonstrated strong
performance on benchmarks requiring numerical reasoning and base-rate-style
probabilistic inference. The probabilistic specialist's output schema requires
explicit base-rate estimates and risk-factor modifiers — a reasoning structure
that aligns with the model's tendencies on structured quantitative tasks.
Empirically, we observed that GPT-5.5 produced the most consistently
structured base-rate justifications during early testing.

**Gemini 3.1 Pro as mechanistic specialist.** Gemini's benchmark performance
on scientific reasoning tasks — particularly those requiring causal chains
through biological processes — informed this choice. The mechanistic
specialist's output schema requires a unifying pathophysiological mechanism
and an explicit causal chain linking that mechanism to specific findings.
This structured causal reasoning matched Gemini's observed strengths in
early testing. Google DeepMind's research focus on biomedical applications
also suggested Gemini would have strong exposure to mechanistic medical
content during training.

**Claude Sonnet 4.6 as eliminative specialist.** Anthropic's safety-focused
calibration work makes Claude models particularly well-suited to the
"what cannot be missed" reasoning frame. The eliminative specialist needs
to raise uncomfortable possibilities (cancer, severe infections, vascular
catastrophes) without hedging, and it needs to enumerate dangerous
alternatives without false reassurance. Sonnet's balance of reasoning
depth and response speed also fits the eliminative role's practical
requirement of quickly enumerating danger scenarios across multiple systems.

**Claude Opus 4.7 as antagonist and consensus.** Opus is the strongest
reasoning model in the Claude family as of this implementation. The
adversarial role requires the most robust reasoning capacity in the
system — it has to identify weaknesses in the specialists' conclusions
and produce grounded challenges without being deflected by surface
plausibility. The consensus role similarly requires synthesizing full
debate context, integrating multiple reasoning frames, and producing
calibrated final output. Using the same model for both roles also
creates some operational efficiency — adversarial analysis and
synthesis both benefit from the same model's reasoning patterns.

### Honest notes on the assignments

Two honest acknowledgments worth making:

**The assignments are principled but not rigorously evidence-based.**
We did not run systematic comparisons of each model in each possible
role. Our choices reflected our best judgment about each model's
characteristics and training emphasis. A more rigorous design process
would test all 24 possible model-to-role assignments (4 models × 6
role permutations among the three specialist frames) and measure which
produced the strongest reasoning quality in each frame. This is a
legitimate next step if the project continues.

**Heterogeneous models are the core design choice; specific assignments
are secondary.** The architectural claim is that using three different
frontier models is stronger than using three instances of the same model.
The specific assignments above could shift without breaking the
architecture — for instance, Gemini could reasonably handle eliminative
reasoning, and Sonnet could reasonably handle mechanistic reasoning.
What matters is that the three specialists are genuinely different
models, not that they are specifically these three.

**Information isolation (architectural invariant):**
- Specialists never see each other's reasoning — only `primary_diagnosis` + commitment level.
- The antagonist never sees any specialist reasoning; only conclusions, anonymous A/B/C deltas, and its own prior challenges.
- Consensus is the only agent with full context.

**Convergence rule:** `survival_count >= 2` (two consecutive `no_credible_challenge` from the antagonist) terminates the debate as converged. `current_round >= max_rounds` without that terminates as deadlocked. Deadlock is a valid, useful output.

---

## WebSocket API — Frontend Contract

**Endpoint:** `ws://localhost:8000/ws/debate`

**Client → server** (single message, right after connect):

```json
{"action": "start_debate", "case_id": "demo-02-stemi"}
```

Or, with an inline `PatientCase` payload:

```json
{"action": "start_debate", "case": { /* PatientCase JSON */ }}
```

Optional: `"max_rounds": 4` (default 4).

**Server → client** — streamed JSON events, one per `send_json`. Every event has an `event` field.

| `event` | Payload fields | Emitted when |
|---|---|---|
| `debate_started` | `case_id`, `max_rounds`, `anon_id_by_role` | Once, at start |
| `round_started` | `round` | Start of each round (0..N) |
| `specialist_output` | `round`, `role`, `output` (full `SpecialistRound0Output` or `SpecialistRoundNOutput`) | After each specialist completes |
| `antagonist_output` | `round`, `output` (full `AntagonistOutput`), `survival_count` | After the antagonist call |
| `round_completed` | `round`, `leading_diagnosis`, `leading_commitment`, `survival_count`, optional `note` | End of each round |
| `consensus_started` | `outcome`, `final_round` | Just before consensus call |
| `consensus_output` | `output` (full `ConsensusOutput`) | After consensus |
| `debate_complete` | `outcome`, `final_round` | Terminal event |
| `error` | `message` | Any failure |

**Schema references** — all `output` payloads conform to the Pydantic models in `backend/schemas.py`:

- `SpecialistRound0Output` — has `differential`, `primary_diagnosis`, `recommended_next_step`, `reasoning_frame`, and a discriminated `reasoning` object (`ProbabilisticReasoning` / `MechanisticReasoning` / `EliminativeReasoning`).
- `SpecialistRoundNOutput` — extends Round 0 with `position_change` + `response_to_challenge`.
- `AntagonistOutput.result` — discriminated: `AntagonistChallenge` (`type: "challenge"`) or `NoCredibleChallenge` (`type: "no_credible_challenge"`).
- `ConsensusOutput.output` — discriminated: `ConvergedOutput` (`type: "converged"`) or `DeadlockOutput` (`type: "deadlocked"`).

**Anonymous specialist IDs** — `anon_id_by_role` in `debate_started` maps each role (`probabilistic` / `mechanistic` / `eliminative`) to `A` / `B` / `C`. The mapping is randomized per debate but stable within a debate. For visualization, use these IDs as node identities — do NOT label nodes with model names (that would defeat the architecture's anonymity guarantee for the antagonist).

**Event ordering** — within a round, specialist outputs stream in completion order (they run in parallel), then `round_completed` fires. Across rounds, order is strictly sequential: `round_started(N)` → `antagonist_output(N)` → either `round_completed(N, note="converged_before_specialists")` + `consensus_started` (converged) or `specialist_output × 3` → `round_completed(N)` → next round.

**Error semantics** — on any exception inside `run_debate` (agent call failure after retry, schema validation failure on a response, etc.), the server sends a single `{"event": "error", "message": "..."}` and closes the connection. Partial state up to that point is still valid; re-issue `start_debate` to retry.

---

## HTTP API

- `GET /health` — liveness probe. Returns `{"status": "ok"}`.
- `GET /cases` — list available demo cases with `case_id`, `age_sex`, `chief_complaint`, `archetype`.
- `GET /cases/{case_id}` — full `PatientCase` JSON for one case.

---

## Demo cases

Five cases cover the full demo arc:

| # | Case | Archetype | Expected outcome |
|---|---|---|---|
| 1 | `demo-01-postpartum-pe` | Life-saving catch (PE masquerading as postpartum anxiety) | converged |
| 2 | `demo-02-stemi` | Clean consensus (textbook inferior STEMI) | converged |
| 3 | `demo-03-addisons` | Belief update (Addison's misdiagnosed as depression) | converged |
| 4 | `demo-04-neuro-deadlock` | Deadlock (MS vs. neuroborreliosis vs. functional) | deadlocked |
| 5 | `demo-05-endometriosis` | Belief update (endometriosis under an IBS + dysmenorrhea + anxiety label; 7–10 yr typical diagnostic delay) | converged |

Held-out evaluation fixtures sourced from published case reports live under
`cases/pubmed/`, with round-by-round trajectory analysis in
[`cases/pubmed/EVAL_LOG.md`](cases/pubmed/EVAL_LOG.md).

Ground-truth files (`case_XX_..._ground_truth.json`) are intentionally NOT part of the `PatientCase` schema — they are evaluation-only. Physician review of the clinical content happens separately.

---

## Evaluation

```bash
python3 -m backend.evaluation.runner cases/demo --out eval_report.json
```

Scores convergence-rate, outcome-match rate, converged-case accuracy (fuzzy primary-diagnosis match via normalized bag-of-words), correct-deadlock rate, and mean wall-clock. Runs cases sequentially — parallelizing would hammer providers and complicate failure diagnosis.

---

## Security & secrets

- `.env` and `.env.example` are both gitignored (`.env.*` pattern). Never commit credentials.
- API keys are read only via `os.environ` / `python-dotenv` in `backend/agents/base.py`.
- `GET /cases` and `GET /cases/{id}` read from `cases/demo/` only — the path is not user-parameterized.

---

## Tests

```bash
python3 -m pytest tests/ -q
```

**Coverage** (75 tests):
- `test_schema_validation.py` — 39 tests: every cross-field schema rule, `additionalProperties: false`, Round-0/Round-N boundary.
- `test_debate_state.py` — 31 tests: information isolation, leading-diagnosis algorithm (Q3), termination state machine (Q2), round-over-round deltas (Q5), supporting-evidence normalization (Q4), anonymous-ID stability.
- `test_parse_stringified_nested.py` — 5 tests: the Claude tool_use stringified-object workaround with an allowlist guard.
- `test_evaluation.py` — fuzzy primary-diagnosis matching used by the eval harness.
