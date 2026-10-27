"""
FastAPI Satellite Land-Use Verification Service
Group 4 — GIS Enhancement Layer

Endpoints:
  POST /api/satellite/verify-land-use  → classify land-use from bounding box
  POST /api/satellite/compare          → compare declared vs detected type
  GET  /api/satellite/ndvi/{lat}/{lng} → NDVI value at a point
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import classifier

app = FastAPI(
    title="Satellite Land-Use Verification Service",
    description="Classifies land-use type from satellite imagery (Sentinel-2 / NDVI) for the GIS-Enhanced Land Registration System.",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class BoundingBox(BaseModel):
    min_lon: float
    min_lat: float
    max_lon: float
    max_lat: float
    declared_type: Optional[str] = None
    parcel_id: Optional[str] = None


@app.get("/health")
def health():
    return {"status": "OK", "service": "satellite-verification"}


@app.post("/api/satellite/verify-land-use")
def verify_land_use(bbox: BoundingBox):
    """
    Accept a bounding box, fetch/simulate satellite imagery,
    return land-use classification + NDVI + confidence score.
    """
    try:
        result = classifier.classify(bbox.min_lon, bbox.min_lat, bbox.max_lon, bbox.max_lat)
        mismatch = (
            bbox.declared_type is not None
            and bbox.declared_type.lower().replace("-", "_").replace(" ", "_")
               != result["classifiedType"]
        )
        return {
            **result,
            "parcelId":     bbox.parcel_id,
            "declaredType": bbox.declared_type,
            "mismatch":     mismatch,
            "boundingBox":  {"minLon": bbox.min_lon, "minLat": bbox.min_lat,
                             "maxLon": bbox.max_lon, "maxLat": bbox.max_lat}
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/satellite/compare")
def compare(bbox: BoundingBox):
    """
    Compare declared land-use vs satellite-detected type.
    Returns match flag + detected type + confidence.
    """
    if not bbox.declared_type:
        raise HTTPException(status_code=400, detail="declared_type is required for comparison")

    result = classifier.classify(bbox.min_lon, bbox.min_lat, bbox.max_lon, bbox.max_lat)
    declared_norm = bbox.declared_type.lower().replace("-", "_").replace(" ", "_")
    match = declared_norm == result["classifiedType"]

    return {
        "parcelId":     bbox.parcel_id,
        "declaredType": bbox.declared_type,
        "detectedType": result["classifiedType"],
        "match":        match,
        "confidence":   result["confidence"],
        "ndvi":         result["ndvi"]
    }


@app.get("/api/satellite/ndvi/{lat}/{lng}")
def get_ndvi(lat: float, lng: float):
    """Return NDVI index value for a specific coordinate point."""
    ndvi = classifier.get_ndvi_point(lat, lng)
    land_type = classifier.ndvi_to_class(ndvi)
    return {"lat": lat, "lng": lng, "ndvi": round(ndvi, 4), "landType": land_type}
