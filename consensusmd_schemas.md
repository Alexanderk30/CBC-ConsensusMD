# ConsensusMD — JSON Schemas for Agent I/O

**Purpose.** This is the contract between agents. Each schema defines exactly what a given agent receives as input and what it must produce as output. These schemas are enforced at the API level via structured output / tool use, which means the model cannot return malformed data — any validation error surfaces immediately rather than silently corrupting the debate loop.

**Status.** Reference spec. Paste directly into your backend as JSON Schema files, or convert to Pydantic models / Zod schemas as preferred.

**Schema draft.** JSON Schema draft 2020-12 throughout.

---

## Overview — the four agent roles

| Role | Rounds | Input schema | Output schema |
|---|---|---|---|
| Specialist (blind) | Round 0 only | `PatientCase` | `SpecialistRound0Output` |
| Specialist (debate) | Rounds 1..N | `SpecialistDebateInput` | `SpecialistRoundNOutput` |
| Antagonist | Rounds 1..N | `AntagonistInput` | `AntagonistOutput` |
| Consensus | Final pass only | `ConsensusInput` | `ConsensusOutput` |

---

## Shared types

These types are referenced by multiple schemas.

### CommitmentLevel

```json
{
  "type": "string",
  "enum": ["committed", "leading", "candidate", "considered"],
  "description": "Structural commitment level. ANCHORS: 'committed' = diagnosis is staked; alternatives actively ruled out by specific findings. 'leading' = most likely given available information, but alternatives remain credible. 'candidate' = worth considering, meaningful uncertainty, other diagnoses roughly as likely. 'considered' = not impossible, but not believed to be the answer."
}
```

### Diagnosis

A single diagnostic proposition with evidence anchoring. This is the atomic unit of specialist output.

```json
{
  "$id": "Diagnosis",
  "type": "object",
  "required": [
    "diagnosis_name",
    "icd10_approximate",
    "commitment",
    "supporting_evidence",
    "refuting_evidence",
    "alternative_explanation_considered"
  ],
  "additionalProperties": false,
  "properties": {
    "diagnosis_name": {
      "type": "string",
      "description": "Preferred diagnosis name. Use standard medical terminology."
    },
    "icd10_approximate": {
      "type": "string",
      "description": "Approximate ICD-10 code. Used for matching against the criteria library. 'N/A' if unknown."
    },
    "commitment": { "$ref": "#/$defs/CommitmentLevel" },
    "supporting_evidence": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "string",
        "description": "Specific finding from the patient case that supports this diagnosis. Must reference concrete case data (symptoms, exam findings, labs, history), not general reasoning."
      }
    },
    "refuting_evidence": {
      "type": "array",
      "items": {
        "type": "string",
        "description": "Specific finding from the patient case that argues against this diagnosis, if any. Empty array allowed."
      }
    },
    "alternative_explanation_considered": {
      "type": "string",
      "description": "The most plausible alternative diagnosis considered, and why the current diagnosis was preferred over it. Required — no empty strings. If no alternative was seriously considered, state that explicitly."
    },
    "criteria_check": {
      "$ref": "#/$defs/CriteriaCheck",
      "description": "Diagnosis-specific structured criteria, populated when the diagnosis is in the criteria library. Omit entirely if not applicable."
    }
  },
  "allOf": [
    {
      "if": {
        "properties": { "commitment": { "const": "committed" } }
      },
      "then": {
        "properties": {
          "supporting_evidence": { "minItems": 2 }
        },
        "required": ["alternative_explanation_considered"],
        "description": "'committed' level requires at least two independent supporting findings and explicit alternative evaluation."
      }
    }
  ]
}
```

**Design note.** The `allOf` with the conditional `if/then` is the validation rule that prevents a specialist from claiming `committed` on the basis of a single finding. This is the bite of the "evidence-anchored" design — the schema literally rejects under-justified commitments.

### CriteriaCheck

Diagnosis-specific structured criteria, pulled from the criteria library. Optional in general, but required when the diagnosis is in the library.

```json
{
  "$id": "CriteriaCheck",
  "type": "object",
  "oneOf": [
    { "$ref": "#/$defs/WellsScoreCheck" },
    { "$ref": "#/$defs/HEARTScoreCheck" },
    { "$ref": "#/$defs/McDonaldCriteriaCheck" },
    { "$ref": "#/$defs/AddisonPatternCheck" },
    { "$ref": "#/$defs/StemiCriteriaCheck" },
    { "$ref": "#/$defs/NarrativeCriteriaCheck" }
  ]
}
```

See the companion criteria library document for the full set of structured criteria. `NarrativeCriteriaCheck` is the fallback for diagnoses not in the library:

```json
{
  "$id": "NarrativeCriteriaCheck",
  "type": "object",
  "required": ["check_type", "criteria_met", "criteria_not_met", "net_assessment"],
  "additionalProperties": false,
  "properties": {
    "check_type": { "const": "narrative" },
    "criteria_met": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Each item is a criterion the specialist asserts is met, with the case-specific finding that meets it."
    },
    "criteria_not_met": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Each item is a criterion the specialist cannot confirm from the available data. Important: should be non-empty in most real cases."
    },
    "net_assessment": {
      "type": "string",
      "enum": ["supports_strongly", "supports_weakly", "equivocal", "argues_against"]
    }
  }
}
```

---

## Input schemas

### PatientCase

The patient case fed to every specialist (Round 0) and referenced throughout the debate.

```json
{
  "$id": "PatientCase",
  "type": "object",
  "required": [
    "case_id",
    "demographics",
    "chief_complaint",
    "history_of_present_illness",
    "past_medical_history",
    "medications",
    "social_history",
    "family_history",
    "vitals",
    "physical_exam",
    "initial_workup"
  ],
  "additionalProperties": false,
  "properties": {
    "case_id": { "type": "string", "description": "Unique identifier for the case." },
    "demographics": {
      "type": "object",
      "required": ["age", "sex"],
      "properties": {
        "age": { "type": "integer", "minimum": 0, "maximum": 120 },
        "sex": { "type": "string", "enum": ["M", "F", "other"] },
        "relevant_context": { "type": "string", "description": "E.g., 'postpartum day 18', 'G2P1'" }
      }
    },
    "chief_complaint": { "type": "string" },
    "history_of_present_illness": { "type": "string" },
    "past_medical_history": { "type": "array", "items": { "type": "string" } },
    "medications": { "type": "array", "items": { "type": "string" } },
    "social_history": { "type": "string" },
    "family_history": { "type": "string" },
    "vitals": {
      "type": "object",
      "required": ["hr", "bp_systolic", "bp_diastolic", "rr", "spo2", "temp_c"],
      "properties": {
        "hr": { "type": "number" },
        "bp_systolic": { "type": "number" },
        "bp_diastolic": { "type": "number" },
        "rr": { "type": "number" },
        "spo2": { "type": "number", "minimum": 0, "maximum": 100 },
        "temp_c": { "type": "number" },
        "orthostatic_vitals": { "type": "string", "description": "If obtained." }
      }
    },
    "physical_exam": { "type": "string" },
    "initial_workup": {
      "type": "object",
      "description": "Labs, EKG, imaging as available at presentation. Structure depends on case.",
      "additionalProperties": true
    }
  }
}
```

### SpecialistDebateInput (Rounds 1..N)

What a specialist sees in rounds after Round 0. This is where the information-isolation policy is enforced schema-side.

```json
{
  "$id": "SpecialistDebateInput",
  "type": "object",
  "required": [
    "patient_case",
    "own_previous_output",
    "current_leading_diagnosis",
    "other_specialists_conclusions",
    "antagonist_challenge",
    "round_number"
  ],
  "additionalProperties": false,
  "properties": {
    "patient_case": { "$ref": "#/$defs/PatientCase" },
    "own_previous_output": {
      "$ref": "#/$defs/SpecialistRoundNOutput",
      "description": "This specialist's own output from the previous round. Full reasoning included."
    },
    "current_leading_diagnosis": {
      "type": "object",
      "required": ["diagnosis_name", "commitment"],
      "properties": {
        "diagnosis_name": { "type": "string" },
        "commitment": { "$ref": "#/$defs/CommitmentLevel" }
      },
      "description": "System-computed leading diagnosis. NOT attributed to any specialist."
    },
    "other_specialists_conclusions": {
      "type": "array",
      "minItems": 2,
      "maxItems": 2,
      "items": {
        "type": "object",
        "required": ["primary_diagnosis", "commitment"],
        "additionalProperties": false,
        "properties": {
          "primary_diagnosis": { "type": "string" },
          "commitment": { "$ref": "#/$defs/CommitmentLevel" }
        }
      },
      "description": "Other specialists' primary diagnoses and commitment levels ONLY. No reasoning. No attribution by model name. No ordering by confidence."
    },
    "antagonist_challenge": {
      "oneOf": [
        { "$ref": "#/$defs/AntagonistChallenge" },
        { "type": "null" }
      ],
      "description": "The antagonist's current-round challenge, unattributed. Null if no credible challenge was found."
    },
    "round_number": { "type": "integer", "minimum": 1 }
  }
}
```

### AntagonistInput

What the antagonist sees each round. This is the schema that fixes the "round 2 has nothing new to attack" problem — the antagonist has explicit access to deltas and its own prior challenge history.

```json
{
  "$id": "AntagonistInput",
  "type": "object",
  "required": [
    "patient_case",
    "current_leading_diagnosis",
    "all_specialist_conclusions",
    "position_deltas",
    "previous_challenges",
    "round_number"
  ],
  "additionalProperties": false,
  "properties": {
    "patient_case": { "$ref": "#/$defs/PatientCase" },
    "current_leading_diagnosis": {
      "type": "object",
      "required": ["diagnosis_name", "commitment", "supporting_evidence_summary"],
      "properties": {
        "diagnosis_name": { "type": "string" },
        "commitment": { "$ref": "#/$defs/CommitmentLevel" },
        "supporting_evidence_summary": {
          "type": "array",
          "items": { "type": "string" },
          "description": "Deduplicated list of supporting findings across specialists. No reasoning, no attribution."
        }
      }
    },
    "all_specialist_conclusions": {
      "type": "array",
      "minItems": 3,
      "maxItems": 3,
      "items": {
        "type": "object",
        "required": ["primary_diagnosis", "commitment"],
        "properties": {
          "primary_diagnosis": { "type": "string" },
          "commitment": { "$ref": "#/$defs/CommitmentLevel" }
        }
      },
      "description": "All three specialists' conclusions, unattributed."
    },
    "position_deltas": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["specialist_anonymous_id", "change_type"],
        "properties": {
          "specialist_anonymous_id": {
            "type": "string",
            "enum": ["A", "B", "C"],
            "description": "Stable anonymous ID per specialist across rounds, NOT mapped to model names. The antagonist sees A/B/C but does not know which is which underlying model."
          },
          "change_type": {
            "type": "string",
            "enum": [
              "maintained",
              "confidence_raised",
              "confidence_lowered",
              "primary_diagnosis_changed",
              "differential_reordered"
            ]
          },
          "previous_primary": { "type": "string" },
          "current_primary": { "type": "string" }
        }
      },
      "description": "Round-over-round movement for each specialist. Empty array in Round 1 (no previous round to delta from)."
    },
    "previous_challenges": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["round", "challenge_alternative", "specialist_response_summary"],
        "properties": {
          "round": { "type": "integer" },
          "challenge_alternative": { "type": "string" },
          "specialist_response_summary": {
            "type": "string",
            "enum": ["moved_toward_challenge", "partially_moved", "no_movement", "moved_away_from_challenge"]
          }
        }
      },
      "description": "Antagonist's own prior challenges and how specialists responded. Populated starting Round 2."
    },
    "round_number": { "type": "integer", "minimum": 1 }
  }
}
```

**Why the anonymous specialist IDs matter.** The antagonist seeing "A maintained, B moved toward challenge, C flipped" is richer than "specialists mixed." But if A/B/C were attributed to specific models, the antagonist could pattern-match ("Opus always holds firm, Gemini always flips") and weaken its attacks. Stable-but-anonymous IDs give signal without leaking identity.

### ConsensusInput

What the consensus agent sees. This is the only agent with full context.

```json
{
  "$id": "ConsensusInput",
  "type": "object",
  "required": [
    "patient_case",
    "all_specialist_histories",
    "antagonist_history",
    "convergence_outcome",
    "final_round_number"
  ],
  "additionalProperties": false,
  "properties": {
    "patient_case": { "$ref": "#/$defs/PatientCase" },
    "all_specialist_histories": {
      "type": "array",
      "minItems": 3,
      "maxItems": 3,
      "items": {
        "type": "object",
        "required": ["specialist_role", "rounds"],
        "properties": {
          "specialist_role": {
            "type": "string",
            "enum": ["probabilistic", "mechanistic", "eliminative"],
            "description": "Specialist role identity is revealed to the consensus agent, but not underlying model name."
          },
          "rounds": {
            "type": "array",
            "items": {
              "oneOf": [
                { "$ref": "#/$defs/SpecialistRound0Output" },
                { "$ref": "#/$defs/SpecialistRoundNOutput" }
              ]
            }
          }
        }
      }
    },
    "antagonist_history": {
      "type": "array",
      "items": { "$ref": "#/$defs/AntagonistOutput" }
    },
    "convergence_outcome": {
      "type": "string",
      "enum": ["converged", "deadlocked"]
    },
    "final_round_number": { "type": "integer" }
  }
}
```

---

## Output schemas

### SpecialistRound0Output

Blind round. The specialist knows nothing about debate, other agents, or challenge.

```json
{
  "$id": "SpecialistRound0Output",
  "type": "object",
  "required": [
    "differential",
    "primary_diagnosis",
    "recommended_next_step",
    "reasoning_frame",
    "reasoning"
  ],
  "additionalProperties": false,
  "properties": {
    "differential": {
      "type": "array",
      "minItems": 2,
      "maxItems": 6,
      "items": { "$ref": "#/$defs/Diagnosis" },
      "description": "Ordered differential, most likely first. Must include at least 2 diagnoses — a specialist that refuses to name any alternatives is not doing its job."
    },
    "primary_diagnosis": {
      "type": "string",
      "description": "Must exactly match the diagnosis_name of the first item in differential. This is a redundancy check."
    },
    "recommended_next_step": {
      "type": "string",
      "description": "The single most important test or action to distinguish among the differential. Not a wishlist — one thing."
    },
    "reasoning_frame": {
      "type": "string",
      "enum": ["probabilistic", "mechanistic", "eliminative"],
      "description": "Which reasoning frame this specialist is operating under. Must match the specialist's assigned role."
    },
    "reasoning": {
      "type": "object",
      "description": "Reasoning structure varies by reasoning_frame. Enforced via oneOf.",
      "oneOf": [
        { "$ref": "#/$defs/ProbabilisticReasoning" },
        { "$ref": "#/$defs/MechanisticReasoning" },
        { "$ref": "#/$defs/EliminativeReasoning" }
      ]
    }
  }
}
```

### Reasoning frame sub-schemas

This is where reasoning-style differentiation becomes **real**, not decorative. Each specialist's reasoning must conform to its frame's schema. A probabilistic specialist that forgot to produce base rates fails validation.

```json
{
  "$id": "ProbabilisticReasoning",
  "type": "object",
  "required": ["frame", "base_rate_estimates", "risk_factor_modifiers", "posterior_ranking"],
  "additionalProperties": false,
  "properties": {
    "frame": { "const": "probabilistic" },
    "base_rate_estimates": {
      "type": "array",
      "minItems": 2,
      "items": {
        "type": "object",
        "required": ["diagnosis", "estimated_prevalence", "population_context"],
        "properties": {
          "diagnosis": { "type": "string" },
          "estimated_prevalence": {
            "type": "string",
            "description": "Rough prevalence in the relevant population. E.g., '1-2% of postpartum women', 'common in primary care'. Order-of-magnitude estimate."
          },
          "population_context": {
            "type": "string",
            "description": "Which population the base rate applies to."
          }
        }
      }
    },
    "risk_factor_modifiers": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["factor", "effect_on_probability"],
        "properties": {
          "factor": { "type": "string" },
          "effect_on_probability": {
            "type": "string",
            "enum": ["strongly_increases", "increases", "minimal", "decreases", "strongly_decreases"]
          }
        }
      }
    },
    "posterior_ranking": {
      "type": "string",
      "description": "Narrative linking base rates × modifiers to the final ranking."
    }
  }
}
```

```json
{
  "$id": "MechanisticReasoning",
  "type": "object",
  "required": ["frame", "unifying_mechanism", "causal_chain", "unexplained_findings"],
  "additionalProperties": false,
  "properties": {
    "frame": { "const": "mechanistic" },
    "unifying_mechanism": {
      "type": "string",
      "description": "The pathophysiological mechanism that best unifies the presenting findings."
    },
    "causal_chain": {
      "type": "array",
      "minItems": 2,
      "items": {
        "type": "object",
        "required": ["step", "explains_findings"],
        "properties": {
          "step": { "type": "string", "description": "One link in the causal chain." },
          "explains_findings": {
            "type": "array",
            "items": { "type": "string" },
            "description": "Which specific patient findings this step accounts for."
          }
        }
      }
    },
    "unexplained_findings": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Findings the proposed mechanism does not explain. Non-empty in most real cases. Forces honesty."
    }
  }
}
```

```json
{
  "$id": "EliminativeReasoning",
  "type": "object",
  "required": ["frame", "cannot_miss_diagnoses", "ruling_out_evidence"],
  "additionalProperties": false,
  "properties": {
    "frame": { "const": "eliminative" },
    "cannot_miss_diagnoses": {
      "type": "array",
      "minItems": 2,
      "items": {
        "type": "object",
        "required": ["diagnosis", "danger_level", "plausibility_in_this_case"],
        "properties": {
          "diagnosis": { "type": "string" },
          "danger_level": {
            "type": "string",
            "enum": ["immediately_life_threatening", "time_critical", "serious", "significant"]
          },
          "plausibility_in_this_case": {
            "type": "string",
            "enum": ["cannot_exclude", "possible", "unlikely", "effectively_excluded"]
          }
        }
      },
      "description": "Ranked list of dangerous diagnoses that must be considered regardless of probability."
    },
    "ruling_out_evidence": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["diagnosis", "test_or_finding_needed"],
        "properties": {
          "diagnosis": { "type": "string" },
          "test_or_finding_needed": { "type": "string" }
        }
      },
      "description": "For each cannot-miss diagnosis, what test or finding would be needed to rule it out."
    }
  }
}
```

**Why these sub-schemas matter.** When a judge sees three specialists' outputs side by side, they are visibly different *artifacts* — base rates vs. causal chains vs. danger rankings. The "it's all the same model" objection fails by direct inspection. This is Move 3 from the anti-chatbot addendum, made concrete.

### SpecialistRoundNOutput

Debate round output. Same as Round 0 plus update fields.

```json
{
  "$id": "SpecialistRoundNOutput",
  "allOf": [
    { "$ref": "#/$defs/SpecialistRound0Output" },
    {
      "type": "object",
      "required": ["position_change", "response_to_challenge"],
      "properties": {
        "position_change": {
          "type": "string",
          "enum": [
            "maintained",
            "confidence_raised",
            "confidence_lowered",
            "differential_reordered",
            "primary_diagnosis_changed"
          ],
          "description": "Compared to this specialist's previous round output."
        },
        "response_to_challenge": {
          "type": "object",
          "required": ["challenge_addressed", "position_justification"],
          "properties": {
            "challenge_addressed": {
              "type": "boolean",
              "description": "Did the specialist substantively engage with the antagonist's challenge? If null antagonist_challenge in input, this can be false."
            },
            "position_justification": {
              "type": "string",
              "description": "If position changed: why. If maintained: what made the challenge unpersuasive."
            }
          }
        }
      }
    }
  ]
}
```

### AntagonistOutput

The schema that operationalizes "credible challenge" through structural form. The antagonist either produces a complete challenge with all three required components, OR explicitly declares no credible challenge. No third option.

```json
{
  "$id": "AntagonistOutput",
  "type": "object",
  "required": ["round_number", "result"],
  "additionalProperties": false,
  "properties": {
    "round_number": { "type": "integer", "minimum": 1 },
    "result": {
      "oneOf": [
        { "$ref": "#/$defs/AntagonistChallenge" },
        { "$ref": "#/$defs/NoCredibleChallenge" }
      ]
    }
  }
}
```

```json
{
  "$id": "AntagonistChallenge",
  "type": "object",
  "required": [
    "type",
    "challenged_diagnosis",
    "proposed_alternative",
    "supporting_finding",
    "reason_leading_diagnosis_fails",
    "challenge_novelty"
  ],
  "additionalProperties": false,
  "properties": {
    "type": { "const": "challenge" },
    "challenged_diagnosis": {
      "type": "string",
      "description": "The current leading diagnosis being challenged."
    },
    "proposed_alternative": {
      "type": "string",
      "description": "The specific alternative diagnosis being proposed. Must be a concrete diagnosis, not 'something else' or 'further workup'."
    },
    "supporting_finding": {
      "type": "string",
      "description": "The specific finding in the patient case that supports the alternative over the leading diagnosis. Must reference concrete case data."
    },
    "reason_leading_diagnosis_fails": {
      "type": "string",
      "description": "The specific reason the leading diagnosis does not adequately explain the supporting finding. Not a generic criticism — must be mechanistic or evidentiary."
    },
    "challenge_novelty": {
      "type": "string",
      "enum": ["new_attack", "refinement_of_previous", "different_alternative_same_weakness"],
      "description": "Is this challenge materially different from previous rounds'? Forces self-audit."
    }
  }
}
```

```json
{
  "$id": "NoCredibleChallenge",
  "type": "object",
  "required": ["type", "explanation"],
  "additionalProperties": false,
  "properties": {
    "type": { "const": "no_credible_challenge" },
    "explanation": {
      "type": "string",
      "description": "Brief statement of why no credible alternative can be constructed. E.g., 'No finding in the case supports an alternative that the leading diagnosis does not also explain.' 'All alternatives attempted were ruled out by the EKG pattern.'"
    },
    "alternatives_attempted": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Diagnoses the antagonist considered and rejected as alternatives this round. Shows work."
    }
  }
}
```

**Why this schema is the architectural load-bearing piece.** The convergence rule (`survival_count >= 2`) is only meaningful if "no credible challenge" is a structurally defined thing. This schema is the definition. When the antagonist returns `NoCredibleChallenge`, the system increments `survival_count`. When it returns `AntagonistChallenge`, the system resets `survival_count` to 0. Two `NoCredibleChallenge` returns in a row = converged. Deterministic.

### ConsensusOutput

The demo's money shot. Produces either the converged diagnosis with full reasoning, or the deadlock output.

```json
{
  "$id": "ConsensusOutput",
  "type": "object",
  "required": ["outcome", "final_round", "output"],
  "additionalProperties": false,
  "properties": {
    "outcome": {
      "type": "string",
      "enum": ["converged", "deadlocked"]
    },
    "final_round": { "type": "integer" },
    "output": {
      "oneOf": [
        { "$ref": "#/$defs/ConvergedOutput" },
        { "$ref": "#/$defs/DeadlockOutput" }
      ]
    }
  }
}
```

```json
{
  "$id": "ConvergedOutput",
  "type": "object",
  "required": [
    "type",
    "primary_diagnosis",
    "commitment",
    "integrated_reasoning",
    "supporting_evidence_consolidated",
    "distinguishing_test",
    "residual_uncertainty"
  ],
  "additionalProperties": false,
  "properties": {
    "type": { "const": "converged" },
    "primary_diagnosis": { "type": "string" },
    "commitment": { "$ref": "#/$defs/CommitmentLevel" },
    "integrated_reasoning": {
      "type": "object",
      "required": ["probabilistic_view", "mechanistic_view", "eliminative_view", "synthesis"],
      "properties": {
        "probabilistic_view": {
          "type": "string",
          "description": "How the probabilistic specialist's reasoning contributes to the final answer."
        },
        "mechanistic_view": {
          "type": "string",
          "description": "How the mechanistic specialist's reasoning contributes to the final answer."
        },
        "eliminative_view": {
          "type": "string",
          "description": "How the eliminative specialist's reasoning contributes — including dangerous alternatives considered and how they were ruled out."
        },
        "synthesis": {
          "type": "string",
          "description": "The consensus agent's integrated view. This is the paragraph a clinician would read."
        }
      }
    },
    "supporting_evidence_consolidated": {
      "type": "array",
      "minItems": 2,
      "items": { "type": "string" }
    },
    "distinguishing_test": {
      "type": "object",
      "required": ["test_name", "expected_finding", "rationale"],
      "properties": {
        "test_name": { "type": "string" },
        "expected_finding": { "type": "string" },
        "rationale": { "type": "string" }
      },
      "description": "The single most important test to confirm the diagnosis. Not a full workup — the one thing that distinguishes the leading diagnosis from the nearest competitor."
    },
    "residual_uncertainty": {
      "type": "string",
      "description": "What the consensus agent is NOT confident about, even after convergence. Non-empty — forces honesty. 'None identified' is not acceptable."
    },
    "antagonist_challenges_addressed": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "challenge": { "type": "string" },
          "how_resolved": { "type": "string" }
        }
      },
      "description": "Shows the work — which challenges came up and how they were resolved."
    }
  }
}
```

```json
{
  "$id": "DeadlockOutput",
  "type": "object",
  "required": [
    "type",
    "competing_hypotheses",
    "recommended_next_action",
    "referral_urgency"
  ],
  "additionalProperties": false,
  "properties": {
    "type": { "const": "deadlocked" },
    "competing_hypotheses": {
      "type": "array",
      "minItems": 2,
      "maxItems": 4,
      "items": {
        "type": "object",
        "required": ["diagnosis", "supporting_evidence", "distinguishing_test"],
        "properties": {
          "diagnosis": { "type": "string" },
          "supporting_evidence": {
            "type": "array",
            "items": { "type": "string" }
          },
          "distinguishing_test": {
            "type": "string",
            "description": "The test or finding that would confirm or rule out this specific hypothesis."
          },
          "why_not_ruled_out": {
            "type": "string",
            "description": "What kept this hypothesis alive through the debate."
          }
        }
      }
    },
    "recommended_next_action": {
      "type": "string",
      "description": "What the clinician should do next. E.g., 'Neurology referral with MRI brain/spine with contrast and Lyme serology before evaluation.'"
    },
    "referral_urgency": {
      "type": "string",
      "enum": ["emergent", "urgent", "routine"],
      "description": "How quickly the referral should happen."
    },
    "reason_for_deadlock": {
      "type": "string",
      "description": "Brief explanation of why the system could not converge. E.g., 'Three credible hypotheses with overlapping presentations; distinguishing tests are all specialty-referral tests.'"
    }
  }
}
```

---

## System-derived state (not LLM output)

These are computed by the orchestrator, not by any agent. They govern the control flow of the debate.

### DebateState

```json
{
  "$id": "DebateState",
  "type": "object",
  "required": [
    "case_id",
    "current_round",
    "max_rounds",
    "survival_count",
    "consensus_state",
    "history"
  ],
  "properties": {
    "case_id": { "type": "string" },
    "current_round": { "type": "integer", "minimum": 0 },
    "max_rounds": { "type": "integer", "const": 4 },
    "survival_count": {
      "type": "integer",
      "minimum": 0,
      "description": "Consecutive rounds where antagonist returned no_credible_challenge. Convergence triggers at 2."
    },
    "consensus_state": {
      "type": "string",
      "enum": ["split", "partial", "converged", "deadlocked"],
      "description": "Derived from specialist commitment levels on the leading diagnosis."
    },
    "history": {
      "type": "array",
      "items": { "$ref": "#/$defs/RoundRecord" }
    }
  }
}
```

### Convergence computation (pseudocode)

```
def update_consensus_state(round_outputs):
    specialists = round_outputs.specialist_outputs  # list of 3
    primary_diagnoses = [s.primary_diagnosis for s in specialists]

    # Count commitment levels on the leading diagnosis
    leading = majority(primary_diagnoses)
    if leading is None:
        return "split"

    commitments_on_leading = [
        s.differential[0].commitment
        for s in specialists
        if s.primary_diagnosis == leading
    ]
    high_commitments = sum(1 for c in commitments_on_leading if c in ["committed", "leading"])

    if high_commitments == 3:
        return "converged"
    elif high_commitments == 2:
        return "partial"
    else:
        return "split"


def update_survival_count(antagonist_output, current_count):
    if antagonist_output.result.type == "no_credible_challenge":
        return current_count + 1
    else:
        return 0  # challenge produced, reset


def should_terminate(state):
    if state.survival_count >= 2:
        return "converged"
    if state.current_round >= state.max_rounds:
        return "deadlocked"
    return None
```

---

## What's deliberately NOT in these schemas

- **No verbalized confidence percentages.** No field ever asks an LLM for a 0–1 number. All quantification is categorical, structural, or derived.
- **No model names or provider attribution anywhere in agent I/O.** Specialists are identified by role (probabilistic / mechanistic / eliminative). The antagonist sees anonymous A/B/C IDs. Only the orchestrator knows which model is which, and it never tells the agents.
- **No "reasoning shared between specialists."** Specialists never see each other's reasoning. This is enforced by `SpecialistDebateInput.other_specialists_conclusions` being locked to `primary_diagnosis` and `commitment` only.
- **No free-text "overall confidence" summary anywhere.** Every confidence-adjacent value is structurally constrained.

---

## What to build next

Once these schemas are locked, the next deliverables are:

1. **The criteria library** — the ~15 diagnosis-specific `CriteriaCheck` sub-schemas (Wells, HEART, McDonald, STEMI, Addison pattern, Lyme serology pattern, etc.) keyed by ICD-10. This is where the evidence-anchored design gets its teeth.
2. **The four agent system prompts** — one per role. These are where the reasoning-frame differentiation becomes instruction, not just schema.
3. **The orchestrator control flow** — parallel specialist calls per round, sequential antagonist call, state update, termination check. Maybe 150 lines of Python.
4. **The synthetic case JSON** — the four demo cases encoded as `PatientCase` instances, ready to feed the system.

In that order. The prompts depend on the schemas. The orchestrator depends on the prompts. The cases are parallel work that can happen in the background.
