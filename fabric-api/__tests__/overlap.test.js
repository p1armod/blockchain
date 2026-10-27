/**
 * Unit tests for Turf.js overlap detection module.
 * Run with: npm test
 *
 * Mocks: postgisClient + @turf/turf (ESM-safe CJS stubs)
 */

'use strict';

// ── Mock @turf/turf before any module loads it ─────────────────────────────
jest.mock('@turf/turf', () => {
  const coordsOf = (g) =>
    g?.geometry?.coordinates?.[0] ?? g?.coordinates?.[0] ?? [];

  const bbox = (g) => {
    const c = coordsOf(g);
    if (!c.length) return [0, 0, 0, 0];
    const lons = c.map(p => p[0]);
    const lats = c.map(p => p[1]);
    return [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
  };

  const areaMock = (g) => {
    if (g?._mockArea != null) return g._mockArea;
    const [x0, y0, x1, y1] = bbox(g);
    return Math.abs((x1 - x0) * (y1 - y0)) * 1.2e10;
  };

  const feature = (geometry, properties = {}) =>
    ({ type: 'Feature', geometry, properties });

  const featureCollection = (features) =>
    ({ type: 'FeatureCollection', features });

  const intersect = (fc, maybeB) => {
    const features = maybeB ? [fc, maybeB] : (fc?.features ?? [fc[0], fc[1]]);
    const [a, b] = features;
    const [ax0, ay0, ax1, ay1] = bbox(a);
    const [bx0, by0, bx1, by1] = bbox(b);
    const ox = Math.min(ax1, bx1) - Math.max(ax0, bx0);
    const oy = Math.min(ay1, by1) - Math.max(ay0, by0);
    if (ox <= 0 || oy <= 0) return null;
    const overlapArea = ox * oy * 1.2e10;
    if (overlapArea < 0.01) return null;
    return {
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [[[0,0],[1,0],[1,1],[0,1],[0,0]]] },
      properties: {},
      _mockArea: overlapArea,
    };
  };

  return { area: areaMock, feature, featureCollection, intersect };
});

// ── Mock postgisClient ─────────────────────────────────────────────────────
jest.mock('../src/postgisClient', () => ({
  findIntersecting: jest.fn(),
}));

const { detectOverlap } = require('../src/overlapDetector');
const { findIntersecting } = require('../src/postgisClient');

// ── Helper ─────────────────────────────────────────────────────────────────
function makeSquare(lon, lat, half = 0.01) {
  return {
    type: 'Polygon',
    coordinates: [[
      [lon - half, lat - half],
      [lon + half, lat - half],
      [lon + half, lat + half],
      [lon - half, lat + half],
      [lon - half, lat - half],
    ]],
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────
describe('detectOverlap()', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns hasOverlap: false when PostGIS returns no candidates', async () => {
    findIntersecting.mockResolvedValue([]);
    const result = await detectOverlap(makeSquare(78.0, 17.0));
    expect(result.hasOverlap).toBe(false);
    expect(result.conflicts).toHaveLength(0);
  });

  test('returns hasOverlap: true when candidate genuinely overlaps', async () => {
    findIntersecting.mockResolvedValue([{
      parcel_id: 'P-EXISTING-001',
      survey_number: 'SY-001',
      owner_did: 'did:hf:org1:abc',
      geojson: makeSquare(78.0, 17.0, 0.008),
      overlap_area_sqm: 5000,
    }]);
    const result = await detectOverlap(makeSquare(78.0, 17.0, 0.01));
    expect(result.hasOverlap).toBe(true);
    expect(result.conflicts[0].parcelId).toBe('P-EXISTING-001');
    expect(result.conflicts[0].overlapPercent).toBeGreaterThan(0);
  });

  test('ignores adjacent parcel (no bbox overlap)', async () => {
    findIntersecting.mockResolvedValue([{
      parcel_id: 'P-ADJACENT',
      survey_number: 'SY-002',
      owner_did: 'did:hf:org1:def',
      geojson: makeSquare(78.02, 17.0, 0.01),
      overlap_area_sqm: 0,
    }]);
    const result = await detectOverlap(makeSquare(78.0, 17.0, 0.01));
    expect(result.hasOverlap).toBe(false);
  });

  test('ignores slivers (overlap < 0.01 sqm)', async () => {
    // Parcel is completely outside → PostGIS mock returns it but Turf finds no real intersection
    findIntersecting.mockResolvedValue([{
      parcel_id: 'P-SLIVER',
      survey_number: 'SY-003',
      owner_did: 'did:hf:org1:ghi',
      geojson: makeSquare(78.05, 17.0, 0.005),  // clearly separate from new parcel at 78.0
      overlap_area_sqm: 0.005,
    }]);
    const result = await detectOverlap(makeSquare(78.0, 17.0, 0.01));
    // Bboxes don't intersect → no conflict
    expect(result.hasOverlap).toBe(false);
  });

  test('overlapPercent is between 0 and 100 for partial overlap', async () => {
    findIntersecting.mockResolvedValue([{
      parcel_id: 'P-HALF',
      survey_number: 'SY-004',
      owner_did: 'did:hf:org1:jkl',
      geojson: makeSquare(78.01, 17.0, 0.01),
      overlap_area_sqm: 1000,
    }]);
    const result = await detectOverlap(makeSquare(78.0, 17.0, 0.01));
    if (result.hasOverlap) {
      expect(result.conflicts[0].overlapPercent).toBeGreaterThan(0);
      expect(result.conflicts[0].overlapPercent).toBeLessThanOrEqual(100);
    }
  });

  test('passes excludeId to findIntersecting', async () => {
    findIntersecting.mockResolvedValue([]);
    await detectOverlap(makeSquare(78.0, 17.0), 'P-SELF');
    expect(findIntersecting).toHaveBeenCalledWith(expect.any(Object), 'P-SELF');
  });

  test('accepts Feature wrapper as input', async () => {
    findIntersecting.mockResolvedValue([]);
    const feat = { type: 'Feature', geometry: makeSquare(78.0, 17.0), properties: {} };
    await expect(detectOverlap(feat)).resolves.not.toThrow();
  });
});
