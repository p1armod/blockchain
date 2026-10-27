#!/usr/bin/env bash
# e2e-test.sh — End-to-end test runner for the GIS Land Registration system
# Tests every service: fabric-api (3001), satellite (8000), PostGIS (via fabric-api)

BASE="http://localhost:3001"
SAT="http://localhost:8000"
PASS=0
FAIL=0

check() {
  local label="$1"
  local actual="$2"
  local expected="$3"
  if echo "$actual" | grep -q "$expected"; then
    echo "  ✅ $label"
    ((PASS++))
  else
    echo "  ❌ $label"
    echo "     Expected to contain: $expected"
    echo "     Got: $actual"
    ((FAIL++))
  fi
}

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║  GIS Land Registration — End-to-End Test Suite       ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# ── SECTION 1: Infrastructure ─────────────────────────────────────────────
echo "── [1] Infrastructure Health Checks"
check "fabric-api /health" \
  "$(curl -s $BASE/health)" "OK"

check "satellite /health" \
  "$(curl -s $SAT/health)" "satellite-verification"

check "PostGIS via fabric-api (will test via GIS endpoint)" \
  "$(curl -s "$BASE/api/gis/parcels-in-area?minLon=77&minLat=16&maxLon=79&maxLat=18" 2>&1)" \
  "success"

# ── SECTION 2: Auth ───────────────────────────────────────────────────────
echo ""
echo "── [2] Authentication"
LOGIN=$(curl -s -X POST "$BASE/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin-registration","password":"adminpw"}')

check "Login returns JWT token" "$LOGIN" '"token"'
check "Login returns user info" "$LOGIN" '"username":"admin-registration"'

TOKEN=$(echo "$LOGIN" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('token',''))" 2>/dev/null)
AUTH_HEADER="Authorization: Bearer $TOKEN"

ME=$(curl -s "$BASE/api/auth/me" -H "$AUTH_HEADER")
check "GET /api/auth/me returns user" "$ME" "admin-registration"

# ── SECTION 3: Land Application Flow ─────────────────────────────────────
echo ""
echo "── [3] Land Application CRUD"
APP_ID="APP-E2E-$(date +%s)"
APP_RESP=$(curl -s -X POST "$BASE/api/land/applications" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" \
  -d "{
    \"applicationId\":\"$APP_ID\",
    \"userData\":{
      \"fullName\":\"Test User E2E\",
      \"aadhaarNumber\":\"123456789012\",
      \"phoneNumber\":\"9876543210\",
      \"email\":\"test@e2e.com\",
      \"address\":\"123 Test Street, Hyderabad\",
      \"landArea\":\"500\",
      \"landLocation\":\"Secunderabad\",
      \"landType\":\"agricultural\",
      \"surveyNumber\":\"SY-E2E-001\",
      \"district\":\"Hyderabad\",
      \"state\":\"Telangana\"
    }
  }")

check "POST /api/land/applications succeeds" "$APP_RESP" '"success"'
APP_ID_RESP=$(echo "$APP_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('applicationId', d.get('data',{}).get('applicationId','')))" 2>/dev/null)
echo "     Application ID: ${APP_ID_RESP:-$APP_ID}"

if [ -n "$APP_ID" ]; then
  GET_RESP=$(curl -s "$BASE/api/land/applications/$APP_ID" -H "$AUTH_HEADER")
  check "GET /api/land/applications/:id" "$GET_RESP" "$APP_ID"

  HIST_RESP=$(curl -s "$BASE/api/land/applications/$APP_ID/history" -H "$AUTH_HEADER")
  check "GET /api/land/applications/:id/history" "$HIST_RESP" "transactionId"
fi

# ── SECTION 4: GIS Boundary (Chaincode + PostGIS) ─────────────────────────
echo ""
echo "── [4] GIS Boundary Storage (Chaincode v2.0 + PostGIS)"
PARCEL_ID="P-E2E-$(date +%s)"
GEOJSON='{"type":"Polygon","coordinates":[[[78.0,17.0],[78.1,17.0],[78.1,17.1],[78.0,17.1],[78.0,17.0]]]}'

STORE_RESP=$(curl -s -X POST "$BASE/api/gis/store-boundary" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" \
  -d "{
    \"parcelId\":\"$PARCEL_ID\",
    \"geoJSON\":$GEOJSON,
    \"declaredType\":\"agricultural\",
    \"surveyNumber\":\"SY-E2E-GIS-001\",
    \"district\":\"Hyderabad\"
  }")

check "POST /api/gis/store-boundary success" "$STORE_RESP" '"success":true'
check "store-boundary returns polygonHash" "$STORE_RESP" '"polygonHash"'
HASH=$(echo "$STORE_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('polygonHash',''))" 2>/dev/null)
echo "     Polygon hash: ${HASH:0:16}..."

# ── SECTION 5: GIS Parcel Retrieval ───────────────────────────────────────
echo ""
echo "── [5] GIS Parcel Retrieval"
PARCEL_RESP=$(curl -s "$BASE/api/gis/parcel/$PARCEL_ID" -H "$AUTH_HEADER")
check "GET /api/gis/parcel/:id" "$PARCEL_RESP" "$PARCEL_ID"

AREA_RESP=$(curl -s "$BASE/api/gis/parcels-in-area?minLon=77.5&minLat=16.5&maxLon=78.5&maxLat=17.5")
check "GET /api/gis/parcels-in-area" "$AREA_RESP" '"success":true'
COUNT=$(echo "$AREA_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('count',0))" 2>/dev/null)
echo "     Parcels in area: $COUNT"

# ── SECTION 6: GIS Overlap Detection ──────────────────────────────────────
echo ""
echo "── [6] Overlap Detection"
# Overlapping parcel (same area → should detect conflict)
OVERLAP_RESP=$(curl -s -X POST "$BASE/api/gis/check-overlap" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" \
  -d "{
    \"parcelId\":\"P-E2E-NEW-001\",
    \"geoJSON\":$GEOJSON
  }")

check "POST /api/gis/check-overlap returns response" "$OVERLAP_RESP" '"hasOverlap"'
HAS_OVERLAP=$(echo "$OVERLAP_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('hasOverlap','?'))" 2>/dev/null)
echo "     Overlap detected: $HAS_OVERLAP"
check "Overlap detection flagged true" "$OVERLAP_RESP" '"hasOverlap":true'

# ── SECTION 7: GIS Boundary History ───────────────────────────────────────
echo ""
echo "── [7] Blockchain Boundary History"
HIST_RESP=$(curl -s "$BASE/api/gis/boundary-history/$PARCEL_ID" -H "$AUTH_HEADER")
check "GET /api/gis/boundary-history/:id" "$HIST_RESP" '"success":true'

# ── SECTION 8: Land-Use Update ────────────────────────────────────────────
echo ""
echo "── [8] Satellite-Verified Land-Use Update"
LU_RESP=$(curl -s -X PUT "$BASE/api/gis/update-landuse/$PARCEL_ID" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" \
  -d '{"verifiedType":"forest","confidence":0.87}')

check "PUT /api/gis/update-landuse/:id" "$LU_RESP" '"success":true'

# ── SECTION 9: Satellite Service ──────────────────────────────────────────
echo ""
echo "── [9] Satellite Service Endpoints"
NDVI_RESP=$(curl -s "$SAT/api/satellite/ndvi/17.385/78.4867")
check "GET /api/satellite/ndvi/:lat/:lng" "$NDVI_RESP" '"ndvi"'
check "NDVI response has landType" "$NDVI_RESP" '"landType"'

VERIFY_RESP=$(curl -s -X POST "$SAT/api/satellite/verify-land-use" \
  -H "Content-Type: application/json" \
  -d '{"min_lon":78.0,"min_lat":17.0,"max_lon":78.1,"max_lat":17.1,"declared_type":"agricultural","parcel_id":"P-SAT-TEST"}')

check "POST /api/satellite/verify-land-use" "$VERIFY_RESP" '"classifiedType"'
check "verify-land-use returns confidence" "$VERIFY_RESP" '"confidence"'

COMPARE_RESP=$(curl -s -X POST "$SAT/api/satellite/compare" \
  -H "Content-Type: application/json" \
  -d '{"min_lon":78.0,"min_lat":17.0,"max_lon":78.1,"max_lat":17.1,"declared_type":"agricultural"}')

check "POST /api/satellite/compare" "$COMPARE_RESP" '"match"'
check "compare returns detectedType" "$COMPARE_RESP" '"detectedType"'

# ── Summary ───────────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════╗"
printf  "║  Results: ✅ %2d passed  ❌ %2d failed                 ║\n" $PASS $FAIL
echo "╚══════════════════════════════════════════════════════╝"
echo ""
[ $FAIL -eq 0 ] && exit 0 || exit 1
