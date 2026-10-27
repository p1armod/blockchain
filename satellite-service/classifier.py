"""
Land-use classifier using NDVI band analysis.
In production: connect to Copernicus / Google Earth Engine to fetch real Sentinel-2 imagery.
For demo / testing: deterministic NDVI simulation based on coordinates.
"""

import math
from typing import Dict, Any

# NDVI thresholds → land-use categories
LAND_USE_THRESHOLDS = [
    ("water_body",   -1.00,  0.00),
    ("barren",        0.00,  0.10),
    ("built_up",      0.10,  0.20),
    ("agricultural",  0.20,  0.50),
    ("forest",        0.50,  1.00),
]


def ndvi_to_class(ndvi: float) -> str:
    """Map an NDVI value to a land-use category string."""
    for name, low, high in LAND_USE_THRESHOLDS:
        if low <= ndvi < high:
            return name
    return "agricultural"  # fallback


def simulate_ndvi(min_lon: float, min_lat: float, max_lon: float, max_lat: float) -> float:
    """
    Deterministic NDVI simulation for demo/testing.
    Uses centre-point coordinates to produce a stable value in [-0.1, 0.9].
    In production, replace with real Sentinel-2 band fetching.
    """
    centre_lat = (min_lat + max_lat) / 2
    centre_lon = (min_lon + max_lon) / 2
    # Deterministic but spatially varying
    raw = math.sin(centre_lat * 17.3) * math.cos(centre_lon * 13.7)
    # Normalise to [-0.1, 0.9] — covers all land-use classes
    return round(raw * 0.5 + 0.4, 4)


def get_ndvi_point(lat: float, lng: float) -> float:
    """NDVI for a single coordinate point."""
    return simulate_ndvi(lng - 0.005, lat - 0.005, lng + 0.005, lat + 0.005)


def classify(min_lon: float, min_lat: float, max_lon: float, max_lat: float) -> Dict[str, Any]:
    """
    Main classification pipeline.
    Returns: { classifiedType, confidence, ndvi }
    """
    ndvi = simulate_ndvi(min_lon, min_lat, max_lon, max_lat)
    land_type = ndvi_to_class(ndvi)

    # Higher |NDVI| distance from threshold boundary → higher confidence
    confidence = round(min(0.85 + abs(ndvi - 0.3) * 0.15, 0.99), 2)

    return {
        "classifiedType": land_type,
        "confidence":     confidence,
        "ndvi":           ndvi
    }
