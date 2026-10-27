"""
Synthetic test data generator — 500 random GeoJSON parcels + 50 deliberate overlaps.
Bulk-inserts into PostGIS for performance benchmarking.

Usage:
  python generate_test_data.py

Requirements:
  pip install psycopg2-binary
"""

import random
import math
import json
import os

# Optional: set to True to insert into PostGIS
INSERT_INTO_DB = os.getenv("INSERT_INTO_DB", "false").lower() == "true"

# Andhra Pradesh / Telangana approximate bounding box
LAT_MIN, LAT_MAX = 15.0, 19.5
LON_MIN, LON_MAX = 77.0, 84.0


def random_polygon(centre_lat: float, centre_lon: float, size: float = 0.005) -> dict:
    """Generate a rough rectangular polygon around a centre point."""
    half = size / 2
    coords = [
        [centre_lon - half, centre_lat - half],
        [centre_lon + half, centre_lat - half],
        [centre_lon + half, centre_lat + half],
        [centre_lon - half, centre_lat + half],
        [centre_lon - half, centre_lat - half],   # close ring
    ]
    return {"type": "Polygon", "coordinates": [coords]}


LAND_USE_TYPES = ["agricultural", "built_up", "forest", "barren", "water_body"]

parcels = []

# ── 500 random parcels ────────────────────────────────────────────────────────
for i in range(500):
    lat = random.uniform(LAT_MIN, LAT_MAX)
    lon = random.uniform(LON_MIN, LON_MAX)
    size = random.uniform(0.003, 0.012)   # 300 m – 1.2 km side
    parcels.append({
        "parcel_id":    f"SYNTHETIC-{i:04d}",
        "survey_number": f"SY-{i:04d}",
        "district":     "Test District",
        "owner_did":    f"did:hf:org1:synthetic{i:04d}",
        "geometry":     random_polygon(lat, lon, size),
        "declared_type": random.choice(LAND_USE_TYPES),
    })

# ── 50 deliberate overlaps centred on a small grid ───────────────────────────
# Cluster around lat 17.1 / lon 78.1 so overlaps are predictable
for i in range(50):
    lat = 17.1 + (i // 10) * 0.003
    lon = 78.1 + (i  % 10) * 0.003
    parcels.append({
        "parcel_id":    f"OVERLAP-{i:03d}",
        "survey_number": f"SY-OVL-{i:03d}",
        "district":     "Test District",
        "owner_did":    f"did:hf:org1:overlap{i:03d}",
        "geometry":     random_polygon(lat, lon, size=0.008),  # larger → overlaps neighbours
        "declared_type": "built_up",
    })

print(f"Generated {len(parcels)} parcels ({500} random + {50} overlapping)")

# ── Optional DB insert ────────────────────────────────────────────────────────
if INSERT_INTO_DB:
    import psycopg2
    conn = psycopg2.connect(
        host=os.getenv("POSTGIS_HOST", "localhost"),
        port=os.getenv("POSTGIS_PORT", "5432"),
        dbname=os.getenv("POSTGIS_DB", "land_gis"),
        user=os.getenv("POSTGIS_USER", "gis_user"),
        password=os.getenv("POSTGIS_PASSWORD", "gis_password"),
    )
    cur = conn.cursor()
    inserted = 0
    for p in parcels:
        try:
            cur.execute("""
                INSERT INTO land_parcels
                  (parcel_id, survey_number, district, owner_did, boundary, declared_type)
                VALUES
                  (%s, %s, %s, %s,
                   ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326),
                   %s)
                ON CONFLICT (parcel_id) DO NOTHING
            """, (
                p["parcel_id"], p["survey_number"], p["district"], p["owner_did"],
                json.dumps(p["geometry"]), p["declared_type"]
            ))
            inserted += 1
        except Exception as e:
            print(f"  Skip {p['parcel_id']}: {e}")
    conn.commit()
    cur.close()
    conn.close()
    print(f"Inserted {inserted} parcels into PostGIS.")
else:
    print("Set INSERT_INTO_DB=true to bulk-insert into PostGIS.")
    # Save to JSON for inspection
    with open("test_parcels.json", "w") as f:
        json.dump(parcels, f, indent=2)
    print("Saved to test_parcels.json")
