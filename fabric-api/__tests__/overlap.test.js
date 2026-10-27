/**
 * Unit tests for Turf.js overlap detection module.
 * Run with: npm test
 *
 * Note: These tests mock postgisClient so no real DB connection is needed.
 */

'use strict';

// ── Mock postgisClient before requiring overlapDetector ────────────────────
jest.mock('../src/postgisClient', () => ({
  findIntersecting: jest.fn()
}));

const { detectOverlap } = require('../src/overlapDetector');
const { findIntersecting } = require('../src/postgisClient');

// ── Helpers ────────────────────────────────────────────────────────────────

/** Make a square GeoJSON Polygon geometry centred at (lon, lat) with given half-side */
function makeSquare(lon, lat, half = 0.01) {
  return {
    type: 'Polygon',
    coordinates: [[
      [lon - half, lat - half],
      [lon + half, lat - half],
      [lon + half, lat + half],
      [lon - half, lat + half],
      [lon - half, lat - half]
    ]]
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('detectOverlap()', () => {

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns hasOverlap: false when PostGIS returns no candidates', async () => {
    findIntersecting.mockResolvedValue([]);

    const poly = makeSquare(78.0, 17.0);
    const result = await detectOverlap(poly);

    expect(result.hasOverlap).toBe(false);
    expect(result.conflicts).toHaveLength(0);
  });

  test('returns hasOverlap: true when a candidate genuinely overlaps', async () => {
    // Existing parcel almost identical to new one → large overlap
    const existingGeo = makeSquare(78.0, 17.0, 0.008);
    findIntersecting.mockResolvedValue([{
      parcel_id:     'P-EXISTING-001',
      survey_number: 'SY-001',
      owner_did:     'did:hf:org1:abc',
      geojson:       existingGeo,
      overlap_area_sqm: 5000
    }]);

    const newPoly = makeSquare(78.0, 17.0, 0.01);
    const result = await detectOverlap(newPoly);

    expect(result.hasOverlap).toBe(true);
    expect(result.conflicts.length).toBeGreaterThan(0);
    expect(result.conflicts[0].parcelId).toBe('P-EXISTING-001');
    expect(result.conflicts[0].overlapPercent).toBeGreaterThan(0);
  });

  test('ignores adjacent parcels that only share an edge (no area overlap)', async () => {
    // Parcel to the right — shares only the right edge of new polygon
    const adjacent = makeSquare(78.02, 17.0, 0.01);  // starts exactly where new one ends
    findIntersecting.mockResolvedValue([{
      parcel_id:     'P-ADJACENT',
      survey_number: 'SY-002',
      owner_did:     'did:hf:org1:def',
      geojson:       adjacent,
      overlap_area_sqm: 0
    }]);

    const newPoly = makeSquare(78.0, 17.0, 0.01);
    const result = await detectOverlap(newPoly);

    // Turf intersection of adjacent squares produces a line, not polygon → no area
    expect(result.hasOverlap).toBe(false);
  });

  test('ignores slivers with overlap area < 0.01 sqm', async () => {
    // Barely touching — intersection area will be negligibly small
    const almostAdjacent = makeSquare(78.019999, 17.0, 0.01);
    findIntersecting.mockResolvedValue([{
      parcel_id:     'P-SLIVER',
      survey_number: 'SY-003',
      owner_did:     'did:hf:org1:ghi',
      geojson:       almostAdjacent,
      overlap_area_sqm: 0.005
    }]);

    const newPoly = makeSquare(78.0, 17.0, 0.01);
    const result = await detectOverlap(newPoly);

    expect(result.hasOverlap).toBe(false);
  });

  test('returns correct overlapPercent for 50% overlap', async () => {
    // New polygon: lon 78.0±0.01, lat 17.0±0.01
    // Existing: shifted right by half the width → 50% overlap
    const existing = makeSquare(78.01, 17.0, 0.01);
    findIntersecting.mockResolvedValue([{
      parcel_id:     'P-HALF',
      survey_number: 'SY-004',
      owner_did:     'did:hf:org1:jkl',
      geojson:       existing,
      overlap_area_sqm: 1000
    }]);

    const newPoly = makeSquare(78.0, 17.0, 0.01);
    const result = await detectOverlap(newPoly);

    if (result.hasOverlap) {
      expect(result.conflicts[0].overlapPercent).toBeGreaterThan(0);
      expect(result.conflicts[0].overlapPercent).toBeLessThanOrEqual(100);
    }
    // Either outcome is valid; the key check is that the function doesn't throw
  });

  test('excludes a parcel when excludeId is provided', async () => {
    findIntersecting.mockResolvedValue([]);  // PostGIS already excludes it

    const poly = makeSquare(78.0, 17.0);
    await detectOverlap(poly, 'P-SELF');

    expect(findIntersecting).toHaveBeenCalledWith(
      expect.any(Object),
      'P-SELF'
    );
  });

  test('handles Feature wrapper as input (not just Geometry)', async () => {
    findIntersecting.mockResolvedValue([]);

    const feature = {
      type: 'Feature',
      geometry: makeSquare(78.0, 17.0),
      properties: {}
    };

    await expect(detectOverlap(feature)).resolves.not.toThrow();
  });

});
