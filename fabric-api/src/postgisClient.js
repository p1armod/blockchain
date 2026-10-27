'use strict';

/**
 * PostGIS client — thin pool wrapper around `pg`.
 * Provides spatial query helpers for the GIS controller.
 */

const { Pool } = require('pg');

const pool = new Pool({
  host:     process.env.POSTGIS_HOST     || 'localhost',
  port:     parseInt(process.env.POSTGIS_PORT || '5432'),
  database: process.env.POSTGIS_DB       || 'land_gis',
  user:     process.env.POSTGIS_USER     || 'gis_user',
  password: process.env.POSTGIS_PASSWORD || 'gis_password',
});

pool.on('error', (err) => {
  console.error('PostGIS pool error:', err.message);
});

/**
 * Insert or update a land parcel in PostGIS.
 * @param {Object} parcel - { parcelId, surveyNumber, district, ownerDid, geoJSON, areaSqm, landUseType, polygonHash }
 */
async function upsertParcel(parcel) {
  const { parcelId, surveyNumber, district, ownerDid, geoJSON, areaSqm, landUseType, declaredType, polygonHash } = parcel;
  const geoStr = typeof geoJSON === 'string' ? geoJSON : JSON.stringify(geoJSON);

  const query = `
    INSERT INTO land_parcels
      (parcel_id, survey_number, district, owner_did, boundary, area_sqm, land_use_type, declared_type, polygon_hash, updated_at)
    VALUES
      ($1, $2, $3, $4, ST_SetSRID(ST_GeomFromGeoJSON($5), 4326), $6, $7, $8, $9, NOW())
    ON CONFLICT (parcel_id) DO UPDATE SET
      survey_number = EXCLUDED.survey_number,
      boundary      = EXCLUDED.boundary,
      area_sqm      = EXCLUDED.area_sqm,
      land_use_type = EXCLUDED.land_use_type,
      declared_type = EXCLUDED.declared_type,
      polygon_hash  = EXCLUDED.polygon_hash,
      updated_at    = NOW()
    RETURNING *;
  `;
  const { rows } = await pool.query(query, [
    parcelId, surveyNumber, district, ownerDid, geoStr,
    areaSqm, landUseType, declaredType, polygonHash
  ]);
  return rows[0];
}

/**
 * Find all parcels whose boundary intersects with the given GeoJSON geometry.
 * Excludes parcels that only share a boundary edge (ST_Touches).
 * @param {Object} geoJSON - GeoJSON geometry object (Polygon)
 * @param {string} excludeParcelId - Skip this parcel (e.g., the one being submitted)
 */
async function findIntersecting(geoJSON, excludeParcelId = null) {
  const geoStr = typeof geoJSON === 'string' ? geoJSON : JSON.stringify(geoJSON);
  const query = `
    SELECT
      parcel_id,
      survey_number,
      owner_did,
      declared_type,
      area_sqm,
      ST_AsGeoJSON(boundary)::json AS geojson,
      ST_Area(
        ST_Intersection(boundary, ST_SetSRID(ST_GeomFromGeoJSON($1), 4326))::geography
      ) AS overlap_area_sqm
    FROM land_parcels
    WHERE ST_Intersects(boundary, ST_SetSRID(ST_GeomFromGeoJSON($1), 4326))
      AND NOT ST_Touches(boundary, ST_SetSRID(ST_GeomFromGeoJSON($1), 4326))
      ${excludeParcelId ? 'AND parcel_id != $2' : ''}
    ORDER BY overlap_area_sqm DESC;
  `;
  const params = excludeParcelId ? [geoStr, excludeParcelId] : [geoStr];
  const { rows } = await pool.query(query, params);
  return rows;
}

/**
 * Get all parcels within a bounding box for map rendering.
 * @param {number[]} bbox - [minLon, minLat, maxLon, maxLat]
 */
async function getParcelsInBBox(bbox) {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const query = `
    SELECT
      parcel_id,
      survey_number,
      district,
      owner_did,
      area_sqm,
      land_use_type,
      declared_type,
      polygon_hash,
      satellite_verified,
      confidence,
      ST_AsGeoJSON(boundary)::json AS geojson
    FROM land_parcels
    WHERE ST_Intersects(
      boundary,
      ST_MakeEnvelope($1, $2, $3, $4, 4326)
    )
    LIMIT 500;
  `;
  const { rows } = await pool.query(query, [minLon, minLat, maxLon, maxLat]);
  return rows;
}

/**
 * Get a single parcel by ID.
 */
async function getParcelById(parcelId) {
  const { rows } = await pool.query(
    `SELECT *, ST_AsGeoJSON(boundary)::json AS geojson FROM land_parcels WHERE parcel_id = $1`,
    [parcelId]
  );
  return rows[0] || null;
}

/**
 * Update the satellite-verified land-use type.
 */
async function updateLandUse(parcelId, landUseType, confidence) {
  const { rows } = await pool.query(
    `UPDATE land_parcels
     SET land_use_type = $2, confidence = $3, satellite_verified = TRUE, updated_at = NOW()
     WHERE parcel_id = $1
     RETURNING *`,
    [parcelId, landUseType, confidence]
  );
  return rows[0] || null;
}

module.exports = { pool, upsertParcel, findIntersecting, getParcelsInBBox, getParcelById, updateLandUse };
