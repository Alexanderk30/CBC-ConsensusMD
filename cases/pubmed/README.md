# PubMed evaluation cases

Held-out diagnostic cases sourced from the published literature. Each case
is a paired `{case_id}.json` (patient input) + `{case_id}_ground_truth.json`
(expected outcome, competing hypotheses, scoring rubric, source citation).

These cases are **evaluation fixtures** — they probe system calibration
(outcome-match, hypothesis coverage, workup recommendation). They do not
appear in the user-facing picker; the `/cases` endpoint reads from
`cases/demo/` only.

## Index

| ID | Source | URL | Archetype | Final diagnosis | System result |
|---|---|---|---|---|---|
| `eval-01-sam-vasculopathy` | Minten et al., *Acta Gastroenterol Belg* 2022 | https://pubmed.ncbi.nlm.nih.gov/35770291/ | deadlock | Segmental arterial mediolysis (SAM) | see per-case notes |

### Per-case run history

Detailed round-by-round trajectories live in **[EVAL_LOG.md](./EVAL_LOG.md)** —
this README holds the index + case-data provenance; the eval log holds the
forensic narrative (what each round did, where memorization showed up,
what prompt fixes were applied mid-investigation and their observed effect).

**`eval-01-sam-vasculopathy`**

- **2026-04-24 — v1 (easy-mode) run:** converged on SAM at Round 3 / 4,
  survival 2/2. All three specialists reached SAM independently via
  different frames. However, the v1 case shipped with the answer key
  baked into `initial_workup` — the autoimmune panel (ANA, ANCA,
  complement) was already reported as negative and the hepatitis/HIV
  serology was already reported as clean. That directly excluded
  vasculitis in Round 0, making SAM the only surviving etiology.
  Convergence against that version is not a valid calibration signal.

- **2026-04-24 — v2 (calibration) revision:** `initial_workup.labs`
  revised so that ANA/ANCA/complement, hepatitis B/C, and HIV are all
  in a `pending` group rather than returned. This matches the source
  paper's actual ED decision point, where the treating team had to
  commit to a next-step workup *before* those results were available.
  The ground-truth rubric's calibrated behavior — deadlock with PAN /
  Takayasu / SAM all surviving, recommending PET/CT + specialty
  consult — is now the correct target. Confident convergence on SAM
  against v2 is a memorization tell (check Round 0 reasoning for
  "Kalva criteria" citation).

## Ingestion policy

Each case must validate against `backend.schemas.PatientCase`. Published
papers don't always record data in the exact shape the schema requires;
authoring a case from a paper is a **faithful transformation** to fit
the schema, with synthesis flagged in `demographics.relevant_context`
when source data is missing.

Transformation rules:

| Source shape | Canonical shape | Rule |
|---|---|---|
| `"sex": "male"` / `"female"` | `"M"` / `"F"` | Map to schema literal. |
| `physical_exam: { general, cv, pulm, abd, ext, neuro }` | `physical_exam: "<prose>"` | Flatten dict to a single paragraph, `"Section: content. Section: content."`. |
| `vitals_at_presentation: { note: "..." }` (no numeric values recorded) | `vitals: { hr, bp_systolic, bp_diastolic, rr, spo2, temp_c }` | Synthesize plausible values consistent with the source narrative. Document the synthesis in `demographics.relevant_context` ("source paper did not record vitals; values below are synthesized to match [narrative]"). |
| Top-level `allergies: []` | `demographics.allergies: "NKDA"` or omit | Move to `demographics.allergies` as a string, or omit if not mentioned. |

Synthesis guardrails for vitals when the source is silent:
- Match the source's narrative qualifiers exactly ("hemodynamically stable",
  "febrile to 38.5", "tachycardic at 110").
- Prefer mildly abnormal values that fit the clinical picture over
  textbook-normal values — textbook-normal vitals bias agents toward
  excluding cardiovascular/infectious etiologies that the source did
  not in fact rule out.
- Record the synthesis provenance in `demographics.relevant_context`
  so a reader (or the agents via prompt) can tell which numbers came
  from the paper vs. the adapter.

Validation command:

```bash
python3 -c "
import sys; sys.path.insert(0, '.')
from backend.schemas import PatientCase
for p in __import__('pathlib').Path('cases/pubmed').glob('eval_*.json'):
    if '_ground_truth' in p.name: continue
    PatientCase.model_validate_json(p.read_text())
    print(f'✓ {p.name}')
"
```

## Wiring into the eval runner

`backend/evaluation/runner.py` globs `[ce]*_*.json`, which matches both
`case_*.json` (demo) and `eval_*.json` (PubMed) without renaming. To run
just the held-out fixtures:

```bash
python3 -m backend.evaluation.runner cases/pubmed
```
