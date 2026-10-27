-- ============================================================
-- GIS Database Init Script — Land Registration System
-- Group 4 GIS Enhancement
-- ============================================================

-- Enable PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;

-- ============================================================
-- Main land parcels table
-- ============================================================
CREATE TABLE IF NOT EXISTS land_parcels (
  parcel_id          TEXT PRIMARY KEY,
  survey_number      TEXT,
  district           TEXT,
  owner_did          TEXT,
  boundary           GEOMETRY(POLYGON, 4326),   -- Full GeoJSON stored here
  area_sqm           FLOAT,
  land_use_type      TEXT,                       -- satellite-verified type
  declared_type      TEXT,                       -- citizen-declared type
  polygon_hash       TEXT,                       -- SHA-256 of GeoJSON (also on blockchain)
  satellite_verified BOOLEAN DEFAULT FALSE,
  confidence         FLOAT,
  created_at         TIMESTAMP DEFAULT NOW(),
  updated_at         TIMESTAMP DEFAULT NOW()
);

-- Spatial GIST index — essential for fast ST_Intersects queries
CREATE INDEX IF NOT EXISTS idx_boundary ON land_parcels USING GIST(boundary);

-- Regular index on survey_number for lookups
CREATE INDEX IF NOT EXISTS idx_survey_number ON land_parcels(survey_number);

-- ============================================================
-- Boundary conflict log table
-- ============================================================
CREATE TABLE IF NOT EXISTS boundary_conflicts (
  id                  SERIAL PRIMARY KEY,
  parcel_id           TEXT NOT NULL,
  conflicting_id      TEXT NOT NULL,
  overlap_area_sqm    FLOAT,
  detected_at         TIMESTAMP DEFAULT NOW(),
  resolved            BOOLEAN DEFAULT FALSE,
  UNIQUE(parcel_id, conflicting_id)
);

-- ============================================================
-- Spatial helper: find all parcels intersecting an input geometry
-- (excludes parcels that only share a boundary edge via ST_Touches)
-- ============================================================
CREATE OR REPLACE FUNCTION find_intersecting_parcels(
  input_geom GEOMETRY,
  exclude_id TEXT DEFAULT NULL
)
RETURNS TABLE (
  parcel_id     TEXT,
  survey_number TEXT,
  owner_did     TEXT,
  geojson       JSON,
  overlap_area  FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    lp.parcel_id,
    lp.survey_number,
    lp.owner_did,
    ST_AsGeoJSON(lp.boundary)::JSON,
    ST_Area(ST_Intersection(lp.boundary, input_geom)::GEOGRAPHY)
  FROM land_parcels lp
  WHERE ST_Intersects(lp.boundary, input_geom)
    AND NOT ST_Touches(lp.boundary, input_geom)
    AND (exclude_id IS NULL OR lp.parcel_id != exclude_id);
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Helper: calculate polygon area in square meters from GeoJSON text
-- ============================================================
CREATE OR REPLACE FUNCTION geojson_area_sqm(geojson_text TEXT)
RETURNS FLOAT AS $$
BEGIN
  RETURN ST_Area(ST_SetSRID(ST_GeomFromGeoJSON(geojson_text), 4326)::GEOGRAPHY);
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Trigger: auto-compute area_sqm on insert/update
-- ============================================================
CREATE OR REPLACE FUNCTION update_area_sqm()
RETURNS TRIGGER AS $$
BEGIN
  NEW.area_sqm := ST_Area(NEW.boundary::GEOGRAPHY);
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_area ON land_parcels;
CREATE TRIGGER trg_update_area
  BEFORE INSERT OR UPDATE ON land_parcels
  FOR EACH ROW EXECUTE FUNCTION update_area_sqm();

-- Confirm setup
SELECT 'PostGIS GIS database initialised successfully' AS status;
