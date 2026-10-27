# 🏛️ GIS-Enhanced Blockchain Land Registration — Phased Project Plan

> **What this is:** A GIS layer added on top of the existing Hyperledger Fabric land registration system.  
> **Existing system:** Fabric 3-org network + Node.js chaincode + Express API + Next.js frontend — **already working**.  
> **What we add:** PostGIS spatial database · 5 new chaincode functions · GIS REST API · Satellite verification service · Overlap detection · Map UI.

---

## 🔍 Current Project State (What Already Exists)

| Component | Status | Location |
|---|---|---|
| Hyperledger Fabric 3-org network | ✅ Exists | `fabric-samples/test-network/` |
| Land registration chaincode (JS) | ✅ Exists | `chaincode/land-registration/lib/land-registration-contract.js` |
| Express REST API | ✅ Exists | `fabric-api/` |
| Next.js frontend (User + Official portals) | ✅ Exists | `client/` |
| `setorg1/2/3.sh` env scripts | ✅ Exists | project root |
| PostGIS spatial database | ❌ Missing | Need to create |
| GIS chaincode functions (5 new) | ❌ Missing | Add to existing contract |
| GIS REST API endpoints (6 new) | ❌ Missing | Add to `fabric-api/` |
| Satellite verification service (FastAPI) | ❌ Missing | New Python microservice |
| Turf.js overlap detection module | ❌ Missing | New Node.js module |
| Map UI (Leaflet.js) with drawing tool | ❌ Missing | Add to `client/` |
| Test suite (Jest + Pytest) | ❌ Missing | New test files |
| Caliper benchmark | ❌ Missing | New benchmark config |

---

## ⚠️ Bugs to Fix in Existing Code Before Adding GIS

> Fix these first — they will cause integration failures.

| # | Bug | File | Fix |
|---|---|---|---|
| B1 | `JWT_SECRET` used before declaration in `authenticateToken` | [`authController.js:18`](file:///Users/parmod/Desktop/parmod/MCA/blockchain/pbl/fabric-api/src/authController.js) | Move `const JWT_SECRET = ...` above the middleware |
| B2 | Duplicate `router.post('/logout', ...)` defined twice | [`authController.js:137 & 152`](file:///Users/parmod/Desktop/parmod/MCA/blockchain/pbl/fabric-api/src/authController.js) | Remove second duplicate block |
| B3 | `approveByCollector` checks `status === 'verified'` but real final state is `with_ministry_welfare` | [`land-registration-contract.js:345`](file:///Users/parmod/Desktop/parmod/MCA/blockchain/pbl/chaincode/land-registration/lib/land-registration-contract.js) | Fix the status guard |
| B4 | `landController.js` hardcodes `admin-registration` for verify/survey/approve (lines 104, 138, 206) | [`landController.js`](file:///Users/parmod/Desktop/parmod/MCA/blockchain/pbl/fabric-api/src/landController.js) | Use JWT-decoded username |
| B5 | `_generateAIOCRData` returns hardcoded `"Harika Devi"` | [`land-registration-contract.js:448`](file:///Users/parmod/Desktop/parmod/MCA/blockchain/pbl/chaincode/land-registration/lib/land-registration-contract.js) | Read actual `userData.fullName` |

---

## 🚀 Phased Plan

---

### Phase 1 — Fix Existing Bugs + Network Validation
**Goal:** Clean up the existing codebase bugs and confirm the base Fabric network is healthy before adding anything new.

#### 1.1 — Fix API Bugs

**File:** [`fabric-api/src/authController.js`](file:///Users/parmod/Desktop/parmod/MCA/blockchain/pbl/fabric-api/src/authController.js)

- Move `const JWT_SECRET = process.env.JWT_SECRET || 'land-registration-jwt-secret'` to the **top of the file**, before `authenticateToken` middleware (B1)
- Delete the duplicate `router.post('/logout', ...)` block at line 152 (B2)

**File:** [`fabric-api/src/landController.js`](file:///Users/parmod/Desktop/parmod/MCA/blockchain/pbl/fabric-api/src/landController.js)

- Replace hardcoded `'admin-registration'` in `/verify`, `/survey`, `/approve` routes with the JWT-decoded user from `req.user.username` (B4)
- Add middleware `authenticateToken` from `authController` to protect these routes

**File:** [`chaincode/land-registration/lib/land-registration-contract.js`](file:///Users/parmod/Desktop/parmod/MCA/blockchain/pbl/chaincode/land-registration/lib/land-registration-contract.js)

- Fix `approveByCollector` status guard: change `status !== 'verified'` to allow `with_ministry_welfare` status as well (B3)
- Fix `_generateAIOCRData`: replace `"Harika Devi"` with `application.userData?.fullName || 'Unknown'` (B5)

#### 1.2 — Network Health Check

```bash
# Verify Fabric network is up
cd fabric-samples/test-network && ./fabric.sh

# Run test suite — must be 5/5
cd ../../ && ./test-network.sh

# Start API and confirm health endpoint
cd fabric-api && npm start
curl http://localhost:3001/health   # → { "status": "OK" }
```

#### 1.3 — Re-deploy Chaincode (only if chaincode was changed in 1.1)

```bash
cd fabric-samples/test-network
./network.sh deployCC \
  -ccn land-registration \
  -ccp ../../chaincode/land-registration \
  -ccl javascript \
  -c mychannel \
  -ccv 2.0 \
  -ccs 2
```

**Exit Criteria:** `./test-network.sh` reports `5/5 passed`. API `/health` returns OK.

---

### Phase 2 — PostGIS Spatial Database
**Goal:** PostgreSQL + PostGIS running in Docker with the correct schema and spatial indexes.

#### 2.1 — Docker Setup

Create `docker-compose.gis.yml` in the project root:

```yaml
version: '3.8'
services:
  postgis:
    image: postgis/postgis:15-3.3
    container_name: land-postgis
    environment:
      POSTGRES_DB: land_gis
      POSTGRES_USER: gis_user
      POSTGRES_PASSWORD: gis_password
    ports:
      - "5432:5432"
    volumes:
      - postgis_data:/var/lib/postgresql/data
      - ./gis-db/init.sql:/docker-entrypoint-initdb.d/init.sql

volumes:
  postgis_data:
```

#### 2.2 — Database Schema

Create `gis-db/init.sql`:

```sql
-- Enable PostGIS
CREATE EXTENSION IF NOT EXISTS postgis;

-- Land parcels table
CREATE TABLE IF NOT EXISTS land_parcels (
  parcel_id      TEXT PRIMARY KEY,
  survey_number  TEXT,
  district       TEXT,
  owner_did      TEXT,
  boundary       GEOMETRY(POLYGON, 4326),
  area_sqm       FLOAT,
  land_use_type  TEXT,
  declared_type  TEXT,
  polygon_hash   TEXT,
  satellite_verified BOOLEAN DEFAULT FALSE,
  confidence     FLOAT,
  created_at     TIMESTAMP DEFAULT NOW(),
  updated_at     TIMESTAMP DEFAULT NOW()
);

-- Spatial index for fast overlap queries
CREATE INDEX idx_boundary ON land_parcels USING GIST(boundary);

-- Helper: find intersecting parcels
CREATE OR REPLACE FUNCTION find_intersecting_parcels(input_geom GEOMETRY)
RETURNS TABLE(parcel_id TEXT, survey_number TEXT, owner_did TEXT, overlap_area FLOAT) AS $$
BEGIN
  RETURN QUERY
  SELECT lp.parcel_id, lp.survey_number, lp.owner_did,
         ST_Area(ST_Intersection(lp.boundary, input_geom)::GEOGRAPHY)
  FROM land_parcels lp
  WHERE ST_Intersects(lp.boundary, input_geom)
    AND NOT ST_Touches(lp.boundary, input_geom);  -- exclude merely touching boundaries
END;
$$ LANGUAGE plpgsql;
```

#### 2.3 — Start & Verify

```bash
docker-compose -f docker-compose.gis.yml up -d
docker exec -it land-postgis psql -U gis_user -d land_gis -c "\dt"
# Should show: land_parcels table
```

**Exit Criteria:** PostGIS container running, `land_parcels` table with GIST index created.

---

### Phase 3 — New GIS Chaincode Functions
**Goal:** Add 5 new functions to the existing chaincode. Store polygon hashes and boundary conflict records permanently on-chain.

#### 3.1 — Add Functions to Existing Contract

**File:** [`chaincode/land-registration/lib/land-registration-contract.js`](file:///Users/parmod/Desktop/parmod/MCA/blockchain/pbl/chaincode/land-registration/lib/land-registration-contract.js)

Add the following 5 methods inside the `LandRegistrationContract` class:

```javascript
// Store GeoJSON polygon SHA-256 hash on blockchain
async storeLandBoundary(ctx, parcelId, polygonHash, boundingBoxStr, areaSqm) {
    const cid = ctx.clientIdentity;
    const record = {
        parcelId, polygonHash,
        boundingBox: JSON.parse(boundingBoxStr),
        areaSqm: parseFloat(areaSqm),
        recordedBy: cid.getID(),
        mspId: cid.getMSPID(),
        timestamp: ctx.stub.getTxTimestamp().seconds.toString(),
        type: 'GIS_BOUNDARY'
    };
    const key = ctx.stub.createCompositeKey('boundary', [parcelId]);
    await ctx.stub.putState(key, Buffer.from(JSON.stringify(record)));
    return JSON.stringify(record);
}

// Verify a polygon hash hasn't been tampered
async verifyBoundaryHash(ctx, parcelId, incomingHash) {
    const key = ctx.stub.createCompositeKey('boundary', [parcelId]);
    const data = await ctx.stub.getState(key);
    if (!data || data.length === 0) throw new Error(`No boundary found for parcel ${parcelId}`);
    const record = JSON.parse(data.toString());
    return JSON.stringify({ valid: record.polygonHash === incomingHash, storedHash: record.polygonHash });
}

// Store satellite-verified land-use type
async updateLandUseType(ctx, parcelId, verifiedType, confidence) {
    const key = ctx.stub.createCompositeKey('boundary', [parcelId]);
    const data = await ctx.stub.getState(key);
    if (!data || data.length === 0) throw new Error(`No boundary found for parcel ${parcelId}`);
    const record = JSON.parse(data.toString());
    record.satelliteVerifiedType = verifiedType;
    record.confidence = parseFloat(confidence);
    record.satelliteVerifiedAt = ctx.stub.getTxTimestamp().seconds.toString();
    await ctx.stub.putState(key, Buffer.from(JSON.stringify(record)));
    return JSON.stringify(record);
}

// Flag a boundary conflict between two parcels
async flagBoundaryConflict(ctx, parcelId, conflictingParcelId, overlapAreaSqm) {
    const conflictRecord = {
        parcelId, conflictingParcelId,
        overlapAreaSqm: parseFloat(overlapAreaSqm),
        flaggedBy: ctx.clientIdentity.getID(),
        flaggedAt: ctx.stub.getTxTimestamp().seconds.toString(),
        type: 'BOUNDARY_CONFLICT'
    };
    const key = ctx.stub.createCompositeKey('conflict', [parcelId, conflictingParcelId]);
    await ctx.stub.putState(key, Buffer.from(JSON.stringify(conflictRecord)));
    return JSON.stringify(conflictRecord);
}

// Get full boundary history for a parcel
async getBoundaryHistory(ctx, parcelId) {
    const key = ctx.stub.createCompositeKey('boundary', [parcelId]);
    const iterator = await ctx.stub.getHistoryForKey(key);
    const history = [];
    let result = await iterator.next();
    while (!result.done) {
        history.push({
            txId: result.value.txId,
            timestamp: result.value.timestamp,
            value: JSON.parse(result.value.value.toString())
        });
        result = await iterator.next();
    }
    await iterator.close();
    return JSON.stringify(history);
}
```

#### 3.2 — Re-package and Deploy

```bash
cd fabric-samples/test-network
./network.sh deployCC \
  -ccn land-registration \
  -ccp ../../chaincode/land-registration \
  -ccl javascript \
  -c mychannel \
  -ccv 2.0 \
  -ccs 2
```

#### 3.3 — Test New Functions via CLI

```bash
source setorg1.sh
# Test storeLandBoundary
peer chaincode invoke -o localhost:7050 \
  --ordererTLSHostnameOverride orderer.example.com \
  --tls --cafile $ORDERER_CA \
  -C mychannel -n land-registration \
  --peerAddresses localhost:7051 --tlsRootCertFiles $PEER0_ORG1_CA \
  -c '{"function":"storeLandBoundary","Args":["P-001","abc123hash","{\"minX\":78.0,\"minY\":17.0,\"maxX\":78.1,\"maxY\":17.1}","500"]}'

# Test verifyBoundaryHash
peer chaincode query -C mychannel -n land-registration \
  -c '{"function":"verifyBoundaryHash","Args":["P-001","abc123hash"]}'
```

**Exit Criteria:** All 5 new chaincode functions invoke/query successfully.

---

### Phase 4 — GIS REST API (PostGIS + Blockchain Bridge)
**Goal:** 6 new Express routes that connect the frontend and satellite service to both PostGIS and the blockchain.

#### 4.1 — Install PostGIS Client

```bash
cd fabric-api
npm install pg @turf/turf crypto
```

#### 4.2 — Create PostGIS Client

Create `fabric-api/src/postgisClient.js`:

```javascript
'use strict';
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.POSTGIS_HOST || 'localhost',
  port: process.env.POSTGIS_PORT || 5432,
  database: process.env.POSTGIS_DB || 'land_gis',
  user: process.env.POSTGIS_USER || 'gis_user',
  password: process.env.POSTGIS_PASSWORD || 'gis_password',
});

module.exports = { pool };
```

#### 4.3 — Create GIS Controller

Create `fabric-api/src/gisController.js` with 6 routes:

| Method | Route | What it does |
|---|---|---|
| `POST` | `/api/gis/store-boundary` | Receive GeoJSON → insert into PostGIS → SHA-256 hash → call `storeLandBoundary` chaincode |
| `POST` | `/api/gis/check-overlap` | New GeoJSON polygon → PostGIS `ST_Intersects` → Turf.js overlap % calculation → return conflicts |
| `GET` | `/api/gis/parcel/:id` | Return parcel GeoJSON from PostGIS + blockchain record merged |
| `GET` | `/api/gis/parcels-in-area` | Bounding box query → all parcels within (for map rendering) |
| `PUT` | `/api/gis/update-landuse/:id` | Satellite-verified type → update PostGIS + call `updateLandUseType` chaincode |
| `GET` | `/api/gis/boundary-history/:id` | Call `getBoundaryHistory` chaincode → return full tamper-proof history |

**SHA-256 hashing logic (inside `store-boundary` handler):**
```javascript
const crypto = require('crypto');
const polygonHash = crypto.createHash('sha256')
  .update(JSON.stringify(geoJSON))
  .digest('hex');
```

#### 4.4 — Register GIS Routes

In [`fabric-api/index.js`](file:///Users/parmod/Desktop/parmod/MCA/blockchain/pbl/fabric-api/index.js), add:
```javascript
const gisRoutes = require('./src/gisController');
app.use('/api/gis', gisRoutes);
```

#### 4.5 — Update `.env`

Add to [`fabric-api/.env`](file:///Users/parmod/Desktop/parmod/MCA/blockchain/pbl/fabric-api/.env):
```
POSTGIS_HOST=localhost
POSTGIS_PORT=5432
POSTGIS_DB=land_gis
POSTGIS_USER=gis_user
POSTGIS_PASSWORD=gis_password
```

**Exit Criteria:** All 6 GIS endpoints return correct responses tested via `curl` or Postman.

---

### Phase 5 — Overlap Detection Module (Turf.js)
**Goal:** A reusable Node.js module that performs precise polygon-level overlap detection using Turf.js (used by the `/check-overlap` API and by the satellite service).

#### 5.1 — Install Turf

```bash
cd fabric-api
npm install @turf/intersect @turf/boolean-overlap @turf/area @turf/bbox
```

#### 5.2 — Create Module

Create `fabric-api/src/overlapDetector.js`:

```javascript
'use strict';
const turf = require('@turf/turf');
const { pool } = require('./postgisClient');

/**
 * Detect overlapping land parcels for a new GeoJSON polygon.
 * @param {Object} newPolygon - GeoJSON Feature<Polygon>
 * @returns {{ hasOverlap: boolean, conflicts: Array }}
 */
async function detectOverlap(newPolygon) {
  const bbox = turf.bbox(newPolygon);
  // Pre-filter: only check parcels within bounding box (performance)
  const { rows } = await pool.query(
    `SELECT parcel_id, survey_number, owner_did,
            ST_AsGeoJSON(boundary) as geojson, area_sqm
     FROM land_parcels
     WHERE ST_Intersects(boundary, ST_MakeEnvelope($1,$2,$3,$4, 4326))`,
    bbox
  );

  const conflicts = [];
  for (const row of rows) {
    const existing = JSON.parse(row.geojson);
    const intersection = turf.intersect(newPolygon, existing);
    if (!intersection) continue;

    // Skip parcels that only touch at boundary (no area overlap)
    const overlapAreaSqm = turf.area(intersection);
    if (overlapAreaSqm < 0.01) continue;  // < 1 sq cm threshold

    const newAreaSqm = turf.area(newPolygon);
    const overlapPercent = ((overlapAreaSqm / newAreaSqm) * 100).toFixed(2);

    conflicts.push({
      parcelId: row.parcel_id,
      surveyNumber: row.survey_number,
      ownerDid: row.owner_did,
      overlapAreaSqm: Math.round(overlapAreaSqm),
      overlapPercent: parseFloat(overlapPercent),
      intersectionGeoJSON: intersection  // for red-zone rendering on map
    });
  }

  return { hasOverlap: conflicts.length > 0, conflicts };
}

module.exports = { detectOverlap };
```

#### 5.3 — Wire into API

Use `detectOverlap()` inside the `POST /api/gis/check-overlap` handler in `gisController.js`.

**Exit Criteria:** Given two deliberately overlapping test polygons, `check-overlap` returns `hasOverlap: true` with correct `overlapPercent`.

---

### Phase 6 — Satellite Verification Service (FastAPI)
**Goal:** A standalone Python microservice that takes a land parcel's bounding box, fetches satellite imagery, and returns the land-use classification.

#### 6.1 — Project Structure

```
satellite-service/
├── main.py           ← FastAPI app
├── classifier.py     ← NDVI + CNN logic
├── requirements.txt
└── Dockerfile
```

#### 6.2 — `requirements.txt`

```
fastapi==0.111.0
uvicorn==0.30.0
sentinelsat==1.2.1
rasterio==1.3.10
numpy==1.26.4
Pillow==10.3.0
requests==2.32.3
```

#### 6.3 — Core API (`main.py`)

```python
from fastapi import FastAPI
from pydantic import BaseModel
import classifier

app = FastAPI(title="Satellite Land-Use Verification Service")

class BoundingBox(BaseModel):
    min_lon: float; min_lat: float
    max_lon: float; max_lat: float
    declared_type: str = None

@app.post("/api/satellite/verify-land-use")
async def verify_land_use(bbox: BoundingBox):
    result = classifier.classify(bbox.min_lon, bbox.min_lat, bbox.max_lon, bbox.max_lat)
    mismatch = bbox.declared_type and bbox.declared_type.lower() != result["classifiedType"]
    return { **result, "mismatch": bool(mismatch), "declaredType": bbox.declared_type }

@app.post("/api/satellite/compare")
async def compare(bbox: BoundingBox):
    result = classifier.classify(bbox.min_lon, bbox.min_lat, bbox.max_lon, bbox.max_lat)
    return {
        "declaredType": bbox.declared_type,
        "detectedType": result["classifiedType"],
        "match": bbox.declared_type.lower() == result["classifiedType"],
        "confidence": result["confidence"]
    }

@app.get("/api/satellite/ndvi/{lat}/{lng}")
async def get_ndvi(lat: float, lng: float):
    ndvi = classifier.get_ndvi_point(lat, lng)
    return { "lat": lat, "lng": lng, "ndvi": ndvi }
```

#### 6.4 — NDVI Classifier (`classifier.py`)

```python
import numpy as np

LAND_USE_THRESHOLDS = {
    "water_body": (-1.0, 0.0),
    "barren":     (0.0, 0.1),
    "built_up":   (0.1, 0.2),
    "agricultural":(0.2, 0.5),
    "forest":     (0.5, 1.0),
}

def classify(min_lon, min_lat, max_lon, max_lat):
    # In production: fetch real Sentinel-2 bands from Copernicus API
    # For demo: simulate NDVI based on coordinates
    ndvi = simulate_ndvi(min_lat, min_lon)
    land_type = ndvi_to_class(ndvi)
    confidence = round(0.85 + abs(ndvi) * 0.1, 2)
    return { "classifiedType": land_type, "confidence": min(confidence, 0.99), "ndvi": round(ndvi, 3) }

def ndvi_to_class(ndvi):
    for land_type, (low, high) in LAND_USE_THRESHOLDS.items():
        if low <= ndvi < high:
            return land_type
    return "agricultural"

def simulate_ndvi(lat, lon):
    # Deterministic simulation for testing
    return round(((lat * lon) % 1.0) * 0.8 - 0.1, 3)

def get_ndvi_point(lat, lon):
    return simulate_ndvi(lat, lon)
```

#### 6.5 — Run Service

```bash
cd satellite-service
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
# Test: curl -X POST http://localhost:8000/api/satellite/verify-land-use \
#   -H "Content-Type: application/json" \
#   -d '{"min_lon":78.0,"min_lat":17.0,"max_lon":78.1,"max_lat":17.1,"declared_type":"agricultural"}'
```

**Exit Criteria:** Service returns `classifiedType` and `confidence` for any bounding box. `mismatch` flag works correctly.

---

### Phase 7 — Test Suite
**Goal:** Comprehensive unit, integration, and API tests covering the GIS pipeline.

#### 7.1 — Install Test Dependencies

```bash
# For fabric-api (JS tests)
cd fabric-api
npm install --save-dev jest supertest

# For satellite-service (Python tests)
cd satellite-service
pip install pytest httpx
```

#### 7.2 — Unit Tests: Overlap Detection (`__tests__/overlap.test.js`)

```javascript
const { detectOverlap } = require('../src/overlapDetector');

test('non-overlapping polygons return hasOverlap: false', async () => {
  // Two polygons far apart
});

test('overlapping polygons return correct overlapPercent', async () => {
  // Polygon A and B with known 50% overlap
});

test('adjacent (touching) polygons return hasOverlap: false', async () => {
  // Shared edge only, no area overlap
});

test('tiny overlap < 0.01 sqm is ignored', async () => {});
```

#### 7.3 — Unit Tests: Satellite Classifier (`test_classifier.py`)

```python
from classifier import classify, ndvi_to_class

def test_agricultural_ndvi():
    assert ndvi_to_class(0.35) == "agricultural"

def test_forest_ndvi():
    assert ndvi_to_class(0.65) == "forest"

def test_water_body_ndvi():
    assert ndvi_to_class(-0.05) == "water_body"

def test_classify_returns_confidence():
    result = classify(78.0, 17.0, 78.1, 17.1)
    assert result["confidence"] >= 0.85
    assert result["classifiedType"] in ["agricultural", "forest", "built_up", "barren", "water_body"]
```

#### 7.4 — Integration Test: Full GIS Flow (`__tests__/gis.integration.test.js`)

```javascript
const request = require('supertest');
const app = require('../index');

test('POST /api/gis/store-boundary stores polygon and returns txId', async () => {
  const res = await request(app).post('/api/gis/store-boundary').send({
    parcelId: 'TEST-001',
    geoJSON: { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[78,17],[78.1,17],[78.1,17.1],[78,17.1],[78,17]]] } }
  });
  expect(res.status).toBe(200);
  expect(res.body.txId).toBeDefined();
  expect(res.body.polygonHash).toHaveLength(64); // SHA-256 hex
});

test('POST /api/gis/check-overlap detects injected conflict', async () => {
  // Pre-seed a parcel in PostGIS, then check overlapping polygon
});

test('GET /api/gis/boundary-history/:id returns on-chain history', async () => {});
```

#### 7.5 — Postman Collection

Export as `docs/GIS_API.postman_collection.json` with test assertions for all 6 GIS endpoints + 3 satellite endpoints.

#### 7.6 — Test Data Generator (`satellite-service/generate_test_data.py`)

```python
import random, json, psycopg2

def random_polygon(center_lat, center_lon, size=0.01):
    pts = [[center_lon + random.uniform(-size, size),
            center_lat + random.uniform(-size, size)] for _ in range(4)]
    pts.append(pts[0])
    return {"type": "Polygon", "coordinates": [pts]}

# Generate 500 random parcels
parcels = []
for i in range(500):
    lat = random.uniform(17.0, 17.5)
    lon = random.uniform(78.0, 78.5)
    parcels.append({
        "parcel_id": f"SYNTHETIC-{i:04d}",
        "survey_number": f"SY-{i:04d}",
        "boundary": random_polygon(lat, lon),
        "land_use_type": random.choice(["agricultural", "built_up", "forest", "barren"])
    })

# Inject 50 deliberate overlaps (for testing)
for i in range(50):
    base = parcels[i]
    parcels.append({
        "parcel_id": f"OVERLAP-{i:03d}",
        "survey_number": f"SY-OVL-{i:03d}",
        "boundary": random_polygon(17.1 + i*0.001, 78.1 + i*0.001, size=0.02),
        "land_use_type": "built_up"
    })

print(f"Generated {len(parcels)} parcels (500 random + 50 overlapping)")
# TODO: bulk INSERT into PostGIS
```

**Exit Criteria:** All unit tests pass. Integration test confirms end-to-end flow. 500+ parcels in PostGIS.

---

### Phase 8 — Caliper Benchmarking
**Goal:** Measure `storeLandBoundary` chaincode TPS and latency. Measure overlap detection speed at scale.

#### 8.1 — Install Caliper

```bash
npm install --save-dev @hyperledger/caliper-cli
npx caliper bind --caliper-bind-sut fabric:2.4
```

#### 8.2 — Caliper Config (`caliper/benchmark-config.yaml`)

```yaml
test:
  name: GIS-Boundary-Benchmark
  description: TPS and latency for storeLandBoundary chaincode
  rounds:
    - label: storeLandBoundary
      description: Store polygon hash on blockchain
      txNumber: 100
      rateControl:
        type: fixed-rate
        opts:
          tps: 10
      workload:
        module: workloads/store-boundary.js
```

#### 8.3 — Workload (`caliper/workloads/store-boundary.js`)

```javascript
'use strict';
const { WorkloadModuleBase } = require('@hyperledger/caliper-core');
const crypto = require('crypto');

class StoreBoundaryWorkload extends WorkloadModuleBase {
  async submitTransaction() {
    const parcelId = `P-BENCH-${Date.now()}-${Math.random().toString(36).substr(2,5)}`;
    const hash = crypto.createHash('sha256').update(parcelId).digest('hex');
    await this.sutAdapter.sendRequests({
      contractId: 'land-registration',
      contractFunction: 'storeLandBoundary',
      contractArguments: [parcelId, hash, '{"minX":78.0,"minY":17.0,"maxX":78.1,"maxY":17.1}', '500'],
      readOnly: false
    });
  }
}
module.exports.createWorkloadModule = () => new StoreBoundaryWorkload();
```

#### 8.4 — Overlap Detection Speed Benchmark (`caliper/overlap-speed-benchmark.js`)

Run overlap detection against PostGIS with 100 → 1000 → 10000 parcels. Record ms per query. Generate results table.

#### 8.5 — Generate Report

```bash
npx caliper launch manager \
  --caliper-workspace ./caliper \
  --caliper-benchconfig benchmark-config.yaml \
  --caliper-networkconfig ../fabric-samples/test-network/network-config.yaml
```

Output saved to `docs/BENCHMARK_REPORT.md`.

**Exit Criteria:** Caliper produces TPS graph and latency percentile table. Overlap speed recorded for 3 dataset sizes.

---

### Phase 9 — Map UI (Leaflet.js in Existing Next.js Frontend)
**Goal:** Add the interactive GIS map into the existing `client/` Next.js app. **This is last because it depends on all backend phases being complete and testable.**

#### 9.1 — Install Leaflet in Existing Client

```bash
cd client
npm install leaflet react-leaflet leaflet-draw @types/leaflet
```

#### 9.2 — Files to Create / Modify

| File | Action | What it does |
|---|---|---|
| `client/src/components/MapView.tsx` | **Create** | Leaflet map with OpenStreetMap tiles, zoom, geolocation |
| `client/src/components/BoundaryDrawTool.tsx` | **Create** | Leaflet.draw polygon tool; real-time area display via Turf.js; exports GeoJSON |
| `client/src/components/OverlapAlert.tsx` | **Create** | Red zone overlay + conflict popup when `hasOverlap: true` |
| `client/src/components/ParcelLayer.tsx` | **Create** | Renders all registered parcels as color-coded polygons |
| `client/src/components/SatelliteBadge.tsx` | **Create** | Land-use badge on each parcel (🟢/🟤/🔵/🌲/🟡); mismatch ⚠️ icon |
| `client/src/app/gis-map/page.tsx` | **Create** | New `/gis-map` route; dynamic import of MapView (SSR disabled) |
| `client/src/app/page.tsx` | **Modify** | Add "GIS Map" link to the home page |

#### 9.3 — Map Page Structure

```
/gis-map
├── Top bar: Search (Nominatim geocoding) | Layer toggle (street/satellite) | Filters
├── Left sidebar: Parcel list | Status filter | Land-use filter | Area stats
├── Center: Interactive Leaflet map
│   ├── All parcels as polygons (colored by land-use)
│   ├── Drawing tool (polygon corners)
│   ├── Overlap zone in red with cross-hatch when conflict detected
│   └── Click popup: owner, survey no., area, status, blockchain TxID
└── Bottom panel: Selected parcel details
```

#### 9.4 — Dashboard Views

Add map context to the **existing** role-based dashboards:

| Route | View | Map Feature |
|---|---|---|
| `/user-dashboard` | Citizen | Show own parcels highlighted; draw new boundary during application |
| `/official-dashboard` | Officer | Pending applications pinned on map; click to approve with spatial context |
| `/admin-dashboard` | Admin | Heatmap of registrations; color-code by land-use type |

#### 9.5 — SSR Fix (Required for Leaflet in Next.js)

```typescript
// In gis-map/page.tsx
import dynamic from 'next/dynamic';
const MapView = dynamic(() => import('@/components/MapView'), { ssr: false });
```

**Exit Criteria:**
- User can draw a polygon → see area in real time → submit → polygon appears on map
- All parcels visible as colored polygons with clickable popups
- Overlapping polygon submission shows red conflict zone
- Satellite badge appears on each parcel after verification

---

## 📅 Overall Timeline

```
Day 1:  Phase 1  — Fix Existing Bugs + Network Validation
Day 2:  Phase 2  — PostGIS Database Setup
        Phase 3  — New GIS Chaincode Functions (deploy)
Day 3:  Phase 4  — GIS REST API (6 endpoints)
        Phase 5  — Turf.js Overlap Detection Module
Day 4:  Phase 6  — Satellite Verification FastAPI Service
        Phase 7  — Test Suite (unit + integration + data generation)
Day 5:  Phase 8  — Caliper Benchmarking
        Phase 9  — Map UI (Leaflet.js in existing client/)
Day 6:  Final integration test + demo rehearsal + docs
```

---

## ✅ Checklist Before Final Demo

- [ ] `./test-network.sh` → 5/5 passes (existing system regression-free)
- [ ] PostGIS container running with 500+ synthetic parcels
- [ ] All 5 new chaincode functions query/invoke successfully  
- [ ] All 6 GIS API endpoints respond correctly
- [ ] Satellite service classifies land-use (>85% accuracy on test tiles)
- [ ] Overlap detection catches all 50 injected overlapping parcels (zero false negatives)
- [ ] All unit + integration tests pass
- [ ] Caliper benchmark report generated (TPS + latency graphs)
- [ ] Map shows all parcels; drawing tool works; overlap shown in red
- [ ] End-to-end flow: draw polygon → POST to API → PostGIS insert → hash on blockchain → satellite verify → land-use badge on map

---

## 📦 What Gets Added to the Project (Summary)

```
pbl/
├── docker-compose.gis.yml          ← NEW: PostGIS container
├── gis-db/
│   └── init.sql                    ← NEW: PostGIS schema + spatial index
├── satellite-service/              ← NEW: Python FastAPI microservice
│   ├── main.py
│   ├── classifier.py
│   ├── generate_test_data.py
│   ├── requirements.txt
│   └── test_classifier.py
├── chaincode/land-registration/
│   └── lib/land-registration-contract.js   ← MODIFIED: +5 GIS functions
├── fabric-api/
│   ├── src/
│   │   ├── gisController.js        ← NEW: 6 GIS REST routes
│   │   ├── postgisClient.js        ← NEW: pg pool wrapper
│   │   └── overlapDetector.js      ← NEW: Turf.js overlap logic
│   ├── __tests__/
│   │   ├── overlap.test.js         ← NEW: unit tests
│   │   └── gis.integration.test.js ← NEW: integration tests
│   └── index.js                    ← MODIFIED: mount /api/gis routes
├── caliper/                        ← NEW: Hyperledger Caliper config
│   ├── benchmark-config.yaml
│   └── workloads/store-boundary.js
├── client/
│   └── src/
│       ├── components/
│       │   ├── MapView.tsx          ← NEW
│       │   ├── BoundaryDrawTool.tsx ← NEW
│       │   ├── OverlapAlert.tsx     ← NEW
│       │   ├── ParcelLayer.tsx      ← NEW
│       │   └── SatelliteBadge.tsx  ← NEW
│       └── app/
│           └── gis-map/page.tsx     ← NEW: /gis-map route
└── docs/
    ├── PROJECT_PLAN.md              ← THIS FILE
    ├── GIS_API.md                   ← NEW: API documentation
    ├── GIS_API.postman_collection.json ← NEW
    └── BENCHMARK_REPORT.md          ← NEW: Caliper output
```

---

*Last updated: 2026-10-27 | Group 4 — GIS-Enhanced Blockchain Land Registration*
