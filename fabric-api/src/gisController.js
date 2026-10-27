'use strict';

/**
 * GIS Controller — 6 REST endpoints that bridge:
 *   - PostGIS spatial database (full GeoJSON polygons)
 *   - Hyperledger Fabric blockchain (polygon hashes + conflict records)
 *   - Turf.js overlap detection
 */

const express = require('express');
const crypto = require('crypto');
const fabricClient = require('./fabricClient');
const { upsertParcel, getParcelsInBBox, getParcelById, updateLandUse } = require('./postgisClient');
const { detectOverlap } = require('./overlapDetector');

const router = express.Router();

// ────────────────────────────────────────────────────────────────────
// Utility: SHA-256 hash of a GeoJSON object (canonical JSON string)
// ────────────────────────────────────────────────────────────────────
function hashGeoJSON(geoJSON) {
  const canonical = JSON.stringify(geoJSON, Object.keys(geoJSON).sort());
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

// ────────────────────────────────────────────────────────────────────
// Utility: compute bounding box from GeoJSON Polygon coordinates
// ────────────────────────────────────────────────────────────────────
function getBoundingBox(geoJSON) {
  const coords = geoJSON.coordinates
    ? geoJSON.coordinates[0]                     // Geometry
    : geoJSON.geometry.coordinates[0];            // Feature
  const lons = coords.map(c => c[0]);
  const lats = coords.map(c => c[1]);
  return {
    minX: Math.min(...lons), minY: Math.min(...lats),
    maxX: Math.max(...lons), maxY: Math.max(...lats)
  };
}

// ────────────────────────────────────────────────────────────────────
// POST /api/gis/store-boundary
// Receive GeoJSON polygon → PostGIS (full data) + Fabric (hash only)
// ────────────────────────────────────────────────────────────────────
router.post('/store-boundary', async (req, res) => {
  try {
    const { parcelId, surveyNumber, district, ownerDid, geoJSON, declaredType } = req.body;

    if (!parcelId || !geoJSON) {
      return res.status(400).json({ error: 'parcelId and geoJSON are required' });
    }

    // Normalise: accept Feature or plain Geometry
    const geometry = geoJSON.type === 'Feature' ? geoJSON.geometry : geoJSON;

    // Compute SHA-256 hash of the full GeoJSON
    const polygonHash = hashGeoJSON(geometry);

    // Compute area (server-side approximation via bounding box; real area from PostGIS)
    const bbox = getBoundingBox(geometry);

    // 1. Store full polygon in PostGIS
    const postgisRow = await upsertParcel({
      parcelId,
      surveyNumber:  surveyNumber || '',
      district:      district     || '',
      ownerDid:      ownerDid     || '',
      geoJSON:       geometry,
      areaSqm:       0,            // PostGIS will calculate real area on query
      landUseType:   declaredType || null,
      declaredType:  declaredType || null,
      polygonHash
    });

    // 2. Store hash on blockchain
    await fabricClient.connect('admin-registration');
    const txResult = await fabricClient.submitTransaction(
      'admin-registration',
      'storeLandBoundary',
      parcelId,
      polygonHash,
      JSON.stringify(bbox),
      String(postgisRow?.area_sqm || 0)
    );

    res.json({
      success: true,
      parcelId,
      polygonHash,
      boundingBox:  bbox,
      txId:         JSON.parse(txResult.result || '{}').txId || txResult.txId,
      postgisRecord: postgisRow,
      message: 'Boundary stored in PostGIS and hash anchored on blockchain'
    });

  } catch (error) {
    console.error('store-boundary error:', error);
    res.status(500).json({ error: error.message || 'Failed to store boundary' });
  }
});

// ────────────────────────────────────────────────────────────────────
// POST /api/gis/check-overlap
// Check if an incoming GeoJSON polygon conflicts with existing parcels
// ────────────────────────────────────────────────────────────────────
router.post('/check-overlap', async (req, res) => {
  try {
    const { geoJSON, excludeParcelId } = req.body;

    if (!geoJSON) {
      return res.status(400).json({ error: 'geoJSON is required' });
    }

    const geometry = geoJSON.type === 'Feature' ? geoJSON.geometry : geoJSON;
    const result = await detectOverlap(geometry, excludeParcelId || null);

    // If overlap found, flag conflicts on blockchain
    if (result.hasOverlap && req.body.parcelId) {
      await fabricClient.connect('admin-registration');
      for (const conflict of result.conflicts) {
        try {
          await fabricClient.submitTransaction(
            'admin-registration',
            'flagBoundaryConflict',
            req.body.parcelId,
            conflict.parcelId,
            String(conflict.overlapAreaSqm)
          );
        } catch (flagErr) {
          console.warn('Could not flag conflict on chain:', flagErr.message);
        }
      }
    }

    res.json({ success: true, ...result });

  } catch (error) {
    console.error('check-overlap error:', error);
    res.status(500).json({ error: error.message || 'Failed to check overlap' });
  }
});

// ────────────────────────────────────────────────────────────────────
// GET /api/gis/parcel/:id
// Return parcel GeoJSON from PostGIS merged with blockchain record
// ────────────────────────────────────────────────────────────────────
router.get('/parcel/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Fetch from PostGIS
    const postgisRow = await getParcelById(id);

    // Fetch hash record from blockchain
    await fabricClient.connect('admin-registration');
    let chainRecord = null;
    try {
      const raw = await fabricClient.evaluateTransaction(
        'admin-registration',
        'verifyBoundaryHash',
        id,
        postgisRow?.polygon_hash || ''
      );
      chainRecord = JSON.parse(raw);
    } catch (_) {
      // Not yet on chain — still return PostGIS data
    }

    if (!postgisRow && !chainRecord) {
      return res.status(404).json({ error: `Parcel ${id} not found` });
    }

    res.json({
      success: true,
      data: {
        ...postgisRow,
        blockchain: chainRecord
      }
    });

  } catch (error) {
    console.error('get-parcel error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch parcel' });
  }
});

// ────────────────────────────────────────────────────────────────────
// GET /api/gis/parcels-in-area?minLon=&minLat=&maxLon=&maxLat=
// Return all parcels within a bounding box (for map rendering)
// ────────────────────────────────────────────────────────────────────
router.get('/parcels-in-area', async (req, res) => {
  try {
    const { minLon, minLat, maxLon, maxLat } = req.query;

    if (!minLon || !minLat || !maxLon || !maxLat) {
      return res.status(400).json({ error: 'minLon, minLat, maxLon, maxLat are required query params' });
    }

    const parcels = await getParcelsInBBox([
      parseFloat(minLon), parseFloat(minLat),
      parseFloat(maxLon), parseFloat(maxLat)
    ]);

    res.json({ success: true, count: parcels.length, data: parcels });

  } catch (error) {
    console.error('parcels-in-area error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch parcels' });
  }
});

// ────────────────────────────────────────────────────────────────────
// PUT /api/gis/update-landuse/:id
// Store satellite verification result in PostGIS + on blockchain
// ────────────────────────────────────────────────────────────────────
router.put('/update-landuse/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { verifiedType, confidence } = req.body;

    if (!verifiedType || confidence === undefined) {
      return res.status(400).json({ error: 'verifiedType and confidence are required' });
    }

    // 1. Update PostGIS
    const updated = await updateLandUse(id, verifiedType, parseFloat(confidence));

    // 2. Update blockchain
    await fabricClient.connect('admin-registration');
    const txResult = await fabricClient.submitTransaction(
      'admin-registration',
      'updateLandUseType',
      id,
      verifiedType,
      String(confidence)
    );

    res.json({
      success: true,
      parcelId: id,
      verifiedType,
      confidence,
      postgisRecord: updated,
      txId: txResult.txId,
      message: 'Land-use type updated in PostGIS and on blockchain'
    });

  } catch (error) {
    console.error('update-landuse error:', error);
    res.status(500).json({ error: error.message || 'Failed to update land-use type' });
  }
});

// ────────────────────────────────────────────────────────────────────
// GET /api/gis/boundary-history/:id
// Return tamper-proof boundary change history from blockchain
// ────────────────────────────────────────────────────────────────────
router.get('/boundary-history/:id', async (req, res) => {
  try {
    const { id } = req.params;

    await fabricClient.connect('admin-registration');
    const raw = await fabricClient.evaluateTransaction(
      'admin-registration',
      'getBoundaryHistory',
      id
    );
    const history = JSON.parse(raw);

    res.json({ success: true, parcelId: id, count: history.length, history });

  } catch (error) {
    console.error('boundary-history error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch boundary history' });
  }
});

module.exports = router;
