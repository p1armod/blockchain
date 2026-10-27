"""
Unit tests for the satellite classifier module.
Run with: pytest test_classifier.py -v
"""

import pytest
from classifier import classify, ndvi_to_class, get_ndvi_point, simulate_ndvi


# ── ndvi_to_class ─────────────────────────────────────────────────────────────

def test_water_body():
    assert ndvi_to_class(-0.05) == "water_body"

def test_barren():
    assert ndvi_to_class(0.05) == "barren"

def test_built_up():
    assert ndvi_to_class(0.15) == "built_up"

def test_agricultural():
    assert ndvi_to_class(0.35) == "agricultural"

def test_forest():
    assert ndvi_to_class(0.65) == "forest"

def test_boundary_value_zero_is_barren():
    assert ndvi_to_class(0.0) == "barren"

def test_boundary_value_0_5_is_forest():
    assert ndvi_to_class(0.5) == "forest"


# ── classify ──────────────────────────────────────────────────────────────────

def test_classify_returns_all_keys():
    result = classify(78.0, 17.0, 78.1, 17.1)
    assert "classifiedType" in result
    assert "confidence"     in result
    assert "ndvi"           in result

def test_classify_confidence_in_range():
    result = classify(78.0, 17.0, 78.1, 17.1)
    assert 0.0 <= result["confidence"] <= 1.0

def test_classify_type_is_valid():
    valid = {"water_body", "barren", "built_up", "agricultural", "forest"}
    result = classify(78.0, 17.0, 78.1, 17.1)
    assert result["classifiedType"] in valid

def test_classify_deterministic():
    """Same bounding box must always return same result."""
    r1 = classify(78.5, 17.5, 78.6, 17.6)
    r2 = classify(78.5, 17.5, 78.6, 17.6)
    assert r1 == r2

def test_classify_different_bboxes_can_differ():
    r1 = classify(78.0, 17.0, 78.1, 17.1)
    r2 = classify(80.0, 20.0, 80.1, 20.1)
    # They may differ — at least verify both succeed
    assert r1["classifiedType"] is not None
    assert r2["classifiedType"] is not None


# ── get_ndvi_point ────────────────────────────────────────────────────────────

def test_get_ndvi_point_returns_float():
    ndvi = get_ndvi_point(17.3, 78.4)
    assert isinstance(ndvi, float)

def test_get_ndvi_point_in_valid_range():
    ndvi = get_ndvi_point(17.3, 78.4)
    assert -1.0 <= ndvi <= 1.0
