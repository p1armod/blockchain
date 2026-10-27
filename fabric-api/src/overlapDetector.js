'use strict';

/**
 * Overlap Detection Module — uses Turf.js for precise polygon intersection.
 * Queries PostGIS for candidate parcels (bbox pre-filter), then runs
 * client-side Turf.js intersection for accurate overlap percentage.
 */

const turf = require('@turf/turf');
const { findIntersecting } = require('./postgisClient');

/**
 * Detect overlapping registered parcels for an incoming GeoJSON polygon.
 *
 * @param {Object} newPolygon  - GeoJSON Feature<Polygon> or Geometry<Polygon>
 * @param {string} [excludeId] - Optional parcel ID to exclude (e.g. update scenario)
 * @returns {{ hasOverlap: boolean, conflicts: Array }}
 */
async function detectOverlap(newPolygon, excludeId = null) {
  // Normalise to Feature
  const newFeature = newPolygon.type === 'Feature'
    ? newPolygon
    : turf.feature(newPolygon);

  const newAreaSqm = turf.area(newFeature);

  // Get candidate parcels from PostGIS (ST_Intersects pre-filter)
  const geometry = newFeature.geometry;
  const candidates = await findIntersecting(geometry, excludeId);

  const conflicts = [];

  for (const row of candidates) {
    const existingFeature = turf.feature(row.geojson);

    let intersection;
    try {
      intersection = turf.intersect(turf.featureCollection([newFeature, existingFeature]));
    } catch (e) {
      // Skip self-intersecting or degenerate polygons
      continue;
    }

    if (!intersection) continue;

    const overlapAreaSqm = turf.area(intersection);

    // Ignore slivers < 0.01 sqm (floating-point / adjacent-boundary artefacts)
    if (overlapAreaSqm < 0.01) continue;

    const overlapPercent = parseFloat(((overlapAreaSqm / newAreaSqm) * 100).toFixed(2));

    conflicts.push({
      parcelId:          row.parcel_id,
      surveyNumber:      row.survey_number,
      ownerDid:          row.owner_did,
      overlapAreaSqm:    Math.round(overlapAreaSqm * 100) / 100,
      overlapPercent,
      intersectionGeoJSON: intersection.geometry   // for red-zone rendering on the map
    });
  }

  return {
    hasOverlap: conflicts.length > 0,
    conflicts
  };
}

module.exports = { detectOverlap };
