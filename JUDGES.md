# For hackathon judges

A 60-second orientation to ConsensusMD.

## What it is

Four frontier models reason about a clinical case under adversarial
pressure. Three specialists propose a diagnosis from three different
reasoning frames (probabilistic, mechanistic, eliminative). A skeptic
(OPHIS · Opus 4.7) tries to falsify the leading diagnosis each round.
The case converges only when the skeptic cannot produce a credible
challenge twice in a row. If that never happens by round four, the
output is a structured referral with the competing hypotheses on the
table — uncertainty as a clinical finding, not a failure mode.

## Try it (90 seconds)

**Live demo:** https://cbc-lazarus-production.up.railway.app/

1. Click `? Instructions` from the landing page if you want a tour
   of the UI before running anything.
2. **Easiest path to a converged verdict.** Pick `case_02_stemi`
   from the case list and press `◆ Convene Consortium`. ~3 minutes
   of live model calls. The four agents will agree.
3. **Easiest path to a deadlock.** Pick `case_04_neuro_deadlock` and
   press Convene. ~5 minutes. The system returns competing hypotheses
   and a structured referral instead of a single diagnosis. This is
   the signature safety feature.
4. **No-API walkthrough.** If you do not want to wait on real
   model calls, the `▷ Converge` and `▷ Deadlock` dry-run buttons
   replay a recorded debate locally. Useful for narrating the
   architecture without spending tokens.

## What to look for

- The four agents reason **independently** in round 0 — none of
  them sees the others' outputs. Information isolation is enforced
  in `backend/orchestrator/state.py` and verified in
  `tests/test_debate_state.py`.
- The antagonist's challenge in each subsequent round is built on
  the specialists' aggregated output. The specialists then *defend,
  revise, or pivot* — and you can watch a specialist change its mind
  on the timeline.
- The verdict card differentiates two terminal states: green diamond
  (`◆ Converged`) shows the agreed diagnosis, distinguishing test,
  and residual uncertainty; red diamond (`◇ Deadlocked`) shows the
  competing hypotheses with referral urgency. Both are valid
  outcomes by design.

## Evaluation evidence

- `cases/demo/` — 5 demo cases with ground-truth sidecars covering
  the four archetypes: life-saving catch, clean consensus, belief
  update under challenge, genuine deadlock, and a chronic-onset
  case (endometriosis).
- `cases/pubmed/EVAL_LOG.md` — round-by-round forensic trajectory
  on a held-out PubMed case (segmental arterial mediolysis, *Acta
  Gastroenterol Belg* 2022). Documents where memorization risk was
  observed and what prompt fix was applied.

## Architecture, in one paragraph

FastAPI backend (`backend/main.py`) streams events over a WebSocket
(`backend/api/websocket.py`) to a React frontend. The orchestrator
(`backend/orchestrator/debate.py`) runs up to four rounds of
parallel specialist calls, antagonist challenge, and consensus
synthesis. Pydantic v2 strict schemas (`backend/schemas.py`)
validate every model output and refuse drift — the system is
designed to fail loudly rather than paper over schema noise. Models
are routed through Anthropic for Claude and OpenRouter for GPT and
Gemini. Single-deployment Railway image; 90 passing tests.

## Run locally

```bash
python3 -m pip install -e '.[dev,runtime]'
cp .env.template .env   # add your ANTHROPIC_API_KEY + OPENROUTER_API_KEY
python3 -m pytest tests/ -q
uvicorn backend.main:app --reload --port 8000
# In another terminal:
cd frontend && npm install && npm run dev
```

## How Claude was used

ConsensusMD uses Claude in two distinct ways: as a load-bearing
component of the product (Opus 4.7 as antagonist + consensus, Sonnet
4.6 as eliminative specialist) and as the implementation collaborator
during the build (Claude Code with Opus 4.7). For an honest account
of what was AI-driven and what was developer-driven —
including what Claude did *not* do — see
[CLAUDE_IMPLEMENTATION.md](./CLAUDE_IMPLEMENTATION.md).

## What this is not

- Not a medical device.
- Not patient-facing.
- Not a replacement for a clinician's judgment, examination, or the
  chart they are actually reading.

It is a structured second opinion for the shift when a specialist
is not down the hall.
