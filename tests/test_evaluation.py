"""Tests for backend.evaluation.runner — fuzzy primary-diagnosis matching."""
from __future__ import annotations

from backend.evaluation.runner import _fuzzy_primary_match


def test_fuzzy_match_identical():
    assert _fuzzy_primary_match("Pulmonary embolism", "Pulmonary embolism")


def test_fuzzy_match_qualifier_addition():
    assert _fuzzy_primary_match(
        "Pulmonary embolism",
        "Acute pulmonary embolism, postpartum",
    )


def test_fuzzy_match_case_and_punctuation_insensitive():
    assert _fuzzy_primary_match(
        "PRIMARY ADRENAL INSUFFICIENCY (ADDISON'S DISEASE)",
        "primary adrenal insufficiency — Addison disease",
    )


def test_fuzzy_match_rejects_unrelated_diagnoses():
    assert not _fuzzy_primary_match("Pulmonary embolism", "Pericarditis")


def test_fuzzy_match_rejects_only_stopword_overlap():
    # Very short words (<3 chars) should be ignored; "of a" shouldn't match.
    assert not _fuzzy_primary_match("Aortic dissection", "Pulmonary embolism")


def test_fuzzy_match_partial_overlap_below_threshold():
    # Only 1 of 3 significant words shared -> below 60% threshold.
    assert not _fuzzy_primary_match(
        "primary adrenal insufficiency",
        "acute stress reaction",
    )
