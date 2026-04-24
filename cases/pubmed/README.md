# PubMed evaluation cases

Held-out diagnostic cases sourced from the published literature. Each case
is a paired `{case_id}.json` (patient input) + `{case_id}_ground_truth.json`
(expected outcome, competing hypotheses, scoring rubric, source citation).

These cases are **evaluation fixtures** — they probe system calibration
(outcome-match, hypothesis coverage, workup recommendation). They do not
appear in the user-facing picker; the `/cases` endpoint reads from
`cases/demo/` only.

## Index

| ID | Source | URL | Archetype | Final diagnosis |
|---|---|---|---|---|
| `eval-01-sam-vasculopathy` | Minten et al., *Acta Gastroenterol Belg* 2022 | https://pubmed.ncbi.nlm.nih.gov/35770291/ | deadlock | Segmental arterial mediolysis (SAM) |

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

`backend/evaluation/runner.py` currently globs `case_*.json` in the target
directory. PubMed cases use the `eval_*` prefix, so running
`python3 -m backend.evaluation.runner cases/pubmed` today would find zero
pairs. Either:

- Rename these to `case_*.json` (loses the PubMed-vs-demo signal in the
  filename), or
- Broaden the glob to `{case,eval}_*.json` in `_pair_case_files`.

The latter is a two-character change and preserves the naming separation.
