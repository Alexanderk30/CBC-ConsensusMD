# ConsensusMD frontend

React 19 + TypeScript + Vite. Connects to the FastAPI backend over a
WebSocket at `/ws/debate` and renders the live debate as a single-screen
theatre.

## Run

```bash
npm install
npm run dev          # http://localhost:5173 (proxies /cases and /ws/debate)
npm run build        # tsc -b && vite build → dist/
npm run preview      # serve dist/ for local QA
```

In production the backend serves `dist/` as static at `/` (see
`backend/main.py`). Single-image Railway deploy.

## Layout

```
src/
├── App.tsx                     # Top-level router: picker → intake →
│                               # instructions → debate
├── components/
│   ├── Intake.tsx              # Demo landing — case picker + dry-runs
│   ├── NewCaseIntake.tsx       # 4-step patient-chart wizard
│   ├── Instructions.tsx        # User-facing operating manual
│   ├── DebateTheatre.tsx       # Main debate layout (3-column)
│   ├── DebateScene.tsx         # Center stage: agents + crest + bubbles
│   ├── Transcript.tsx          # Right column: full reasoning shells
│   ├── CasePanel.tsx           # Left column: patient chart
│   ├── AgentRegistry.tsx       # Model-name table
│   ├── Timeline.tsx            # Bottom strip: round-by-round events
│   ├── FloatingVerdict.tsx     # Bottom-right verdict card
│   └── PlaybackControls.tsx    # Auto / Step playback toggle
├── hooks/useDebate.ts          # WebSocket + reducer; single ingest()
│                               # entry point with auto/step queue
├── events.ts                   # DebateEvent reducer + differential
│                               # derivation
├── types.ts                    # PatientCase, DebateEvent unions
├── demo/demoSequences.ts       # Recorded event traces for dry-runs
├── utteranceBuilders.ts        # Turn schema rows into bubble text
└── styles.css                  # Design tokens (cad-* prefix, OKLCH)
```

## Design tokens

The visual system uses an OKLCH palette with `--bone-*` (warm cream
neutrals), `--ink-*` (cool dark slate), `--ichor` (success green), and
`--artery` / `--artery-dim` (alarm red). All panels use `.cad-panel`,
labels use `.cad-label` (uppercase mono), serif body copy uses the
`var(--serif)` family.

See `.impeccable.md` at the repo root for the full design brief.
