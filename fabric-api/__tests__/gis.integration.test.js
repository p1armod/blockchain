/**
 * Integration tests for GIS REST API endpoints.
 * Run with: npm test
 *
 * Mocks: postgisClient, overlapDetector, fabricClient, @turf/turf
 * (so no live Fabric network or PostGIS is needed)
 */

'use strict';

// Mock @turf/turf before any module loads it (ESM compat fix)
jest.mock('@turf/turf', () => ({
  area: jest.fn(() => 5000),
  feature: jest.fn((g, p = {}) => ({ type: 'Feature', geometry: g, properties: p })),
  featureCollection: jest.fn((f) => ({ type: 'FeatureCollection', features: f })),
  intersect: jest.fn(() => null),
}));

jest.mock('../src/postgisClient');
jest.mock('../src/overlapDetector');
jest.mock('../src/fabricClient');

const request  = require('supertest');
const app      = require('../index');
const pg       = require('../src/postgisClient');
const overlap  = require('../src/overlapDetector');
const fabric   = require('../src/fabricClient');

const SAMPLE_GEOJSON = {
  type: 'Polygon',
  coordinates: [[
    [78.0, 17.0], [78.1, 17.0], [78.1, 17.1], [78.0, 17.1], [78.0, 17.0]
  ]]
};

// ── /api/gis/store-boundary ────────────────────────────────────────────────

describe('POST /api/gis/store-boundary', () => {

  beforeEach(() => {
    jest.clearAllMocks();
    pg.upsertParcel.mockResolvedValue({ parcel_id: 'P-TEST-001', area_sqm: 1234 });
    fabric.connect.mockResolvedValue({});
    fabric.submitTransaction.mockResolvedValue({ result: '{}', txId: 'TX-ABC123' });
  });

  test('stores polygon and returns polygonHash (64 hex chars)', async () => {
    const res = await request(app)
      .post('/api/gis/store-boundary')
      .send({ parcelId: 'P-TEST-001', geoJSON: SAMPLE_GEOJSON, declaredType: 'agricultural' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.polygonHash).toMatch(/^[0-9a-f]{64}$/);
    expect(res.body.parcelId).toBe('P-TEST-001');
  });

  test('returns 400 when parcelId is missing', async () => {
    const res = await request(app)
      .post('/api/gis/store-boundary')
      .send({ geoJSON: SAMPLE_GEOJSON });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  test('returns 400 when geoJSON is missing', async () => {
    const res = await request(app)
      .post('/api/gis/store-boundary')
      .send({ parcelId: 'P-TEST-002' });

    expect(res.status).toBe(400);
  });

  test('accepts GeoJSON Feature wrapper (not just Geometry)', async () => {
    const feature = { type: 'Feature', geometry: SAMPLE_GEOJSON, properties: {} };
    const res = await request(app)
      .post('/api/gis/store-boundary')
      .send({ parcelId: 'P-TEST-003', geoJSON: feature });

    expect(res.status).toBe(200);
    expect(res.body.polygonHash).toHaveLength(64);
  });

});

// ── /api/gis/check-overlap ────────────────────────────────────────────────

describe('POST /api/gis/check-overlap', () => {

  beforeEach(() => {
    jest.clearAllMocks();
    fabric.connect.mockResolvedValue({});
    fabric.submitTransaction.mockResolvedValue({ result: '{}', txId: 'TX-CONFLICT' });
  });

  test('returns hasOverlap: false when no conflicts', async () => {
    overlap.detectOverlap.mockResolvedValue({ hasOverlap: false, conflicts: [] });

    const res = await request(app)
      .post('/api/gis/check-overlap')
      .send({ geoJSON: SAMPLE_GEOJSON });

    expect(res.status).toBe(200);
    expect(res.body.hasOverlap).toBe(false);
    expect(res.body.conflicts).toHaveLength(0);
  });

  test('returns hasOverlap: true with conflict details', async () => {
    overlap.detectOverlap.mockResolvedValue({
      hasOverlap: true,
      conflicts: [{
        parcelId: 'P-CONFLICT-001',
        surveyNumber: 'SY-001',
        overlapAreaSqm: 500,
        overlapPercent: 23.4
      }]
    });

    const res = await request(app)
      .post('/api/gis/check-overlap')
      .send({ geoJSON: SAMPLE_GEOJSON, parcelId: 'P-NEW' });

    expect(res.status).toBe(200);
    expect(res.body.hasOverlap).toBe(true);
    expect(res.body.conflicts[0].parcelId).toBe('P-CONFLICT-001');
    expect(res.body.conflicts[0].overlapPercent).toBe(23.4);
  });

  test('returns 400 when geoJSON is missing', async () => {
    const res = await request(app)
      .post('/api/gis/check-overlap')
      .send({});

    expect(res.status).toBe(400);
  });

});

// ── /api/gis/parcels-in-area ───────────────────────────────────────────────

describe('GET /api/gis/parcels-in-area', () => {

  beforeEach(() => {
    jest.clearAllMocks();
    pg.getParcelsInBBox.mockResolvedValue([
      { parcel_id: 'P-001', survey_number: 'SY-001', land_use_type: 'agricultural' },
      { parcel_id: 'P-002', survey_number: 'SY-002', land_use_type: 'forest' }
    ]);
  });

  test('returns parcels within bounding box', async () => {
    const res = await request(app)
      .get('/api/gis/parcels-in-area')
      .query({ minLon: 78.0, minLat: 17.0, maxLon: 78.5, maxLat: 17.5 });

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(2);
    expect(res.body.data).toHaveLength(2);
  });

  test('returns 400 when bbox params missing', async () => {
    const res = await request(app)
      .get('/api/gis/parcels-in-area')
      .query({ minLon: 78.0 });   // missing other params

    expect(res.status).toBe(400);
  });

});

// ── /api/gis/update-landuse/:id ───────────────────────────────────────────

describe('PUT /api/gis/update-landuse/:id', () => {

  beforeEach(() => {
    jest.clearAllMocks();
    pg.updateLandUse.mockResolvedValue({ parcel_id: 'P-001', land_use_type: 'forest', confidence: 0.92 });
    fabric.connect.mockResolvedValue({});
    fabric.submitTransaction.mockResolvedValue({ result: '{}', txId: 'TX-UPDATE' });
  });

  test('updates land-use type and returns txId', async () => {
    const res = await request(app)
      .put('/api/gis/update-landuse/P-001')
      .send({ verifiedType: 'forest', confidence: 0.92 });

    expect(res.status).toBe(200);
    expect(res.body.verifiedType).toBe('forest');
    expect(res.body.confidence).toBe(0.92);
  });

  test('returns 400 when verifiedType is missing', async () => {
    const res = await request(app)
      .put('/api/gis/update-landuse/P-001')
      .send({ confidence: 0.9 });

    expect(res.status).toBe(400);
  });

});

// ── /api/gis/boundary-history/:id ─────────────────────────────────────────

describe('GET /api/gis/boundary-history/:id', () => {

  beforeEach(() => {
    jest.clearAllMocks();
    fabric.connect.mockResolvedValue({});
    fabric.evaluateTransaction.mockResolvedValue(JSON.stringify([
      { txId: 'TX-001', timestamp: '2026-01-01T00:00:00.000Z', value: { polygonHash: 'abc' } },
      { txId: 'TX-002', timestamp: '2026-06-01T00:00:00.000Z', value: { polygonHash: 'def' } }
    ]));
  });

  test('returns boundary change history from blockchain', async () => {
    const res = await request(app).get('/api/gis/boundary-history/P-001');

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(2);
    expect(res.body.history[0].txId).toBe('TX-001');
  });

});
