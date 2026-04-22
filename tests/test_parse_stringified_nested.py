"""Tests for the _parse_stringified_nested tool_use repair helper."""
from backend.agents.base import _parse_stringified_nested


def test_stringified_object_at_allowlisted_key_is_parsed():
    data = {"reasoning": '{"frame": "probabilistic", "base_rate_estimates": []}'}
    result = _parse_stringified_nested(data)
    assert isinstance(result["reasoning"], dict)
    assert result["reasoning"]["frame"] == "probabilistic"
    assert result["reasoning"]["base_rate_estimates"] == []


def test_stringified_object_at_non_allowlisted_key_is_left_alone():
    data = {"posterior_ranking": '{"fake": "json"}'}
    result = _parse_stringified_nested(data)
    assert result["posterior_ranking"] == '{"fake": "json"}'


def test_malformed_json_at_allowlisted_key_is_left_alone():
    data = {"reasoning": "{malformed"}
    result = _parse_stringified_nested(data)
    assert result["reasoning"] == "{malformed"


def test_recursion_into_nested_dicts_and_lists():
    data = {"output": {"integrated_reasoning": '{"synthesis": "..."}'}}
    result = _parse_stringified_nested(data)
    assert isinstance(result["output"]["integrated_reasoning"], dict)
    assert result["output"]["integrated_reasoning"]["synthesis"] == "..."


def test_json_like_string_at_non_allowlisted_key_preserved_verbatim():
    data = {"supporting_finding": '["hypoxia","tachycardia"]'}
    result = _parse_stringified_nested(data)
    assert result["supporting_finding"] == '["hypoxia","tachycardia"]'
