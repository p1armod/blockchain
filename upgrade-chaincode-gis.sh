#!/bin/bash
# upgrade-chaincode-gis.sh
# Upgrades the land-registration chaincode to v2.0 with GIS functions.
# Run this from the project root after the Fabric network is up.
#
# Usage: bash upgrade-chaincode-gis.sh
#
# Prerequisites:
#   - fabric-samples/test-network channel 'mychannel' must be running
#   - peer binary must be on PATH (source fabric-samples/test-network/scripts/envVar.sh)

set -e

CHANNEL="mychannel"
CC_NAME="land-registration"
CC_PATH="$(pwd)/chaincode/land-registration"
CC_LANG="javascript"
CC_VERSION="2.0"
CC_SEQUENCE="2"      # Increment this each time you upgrade
ORDERER="localhost:7050"
ORDERER_CA="$(pwd)/fabric-samples/test-network/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem"
PEER0_ORG1_CA="$(pwd)/fabric-samples/test-network/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt"

# --- Set Org1 peer environment ---
export CORE_PEER_TLS_ENABLED=true
export CORE_PEER_LOCALMSPID="Org1MSP"
export CORE_PEER_TLS_ROOTCERT_FILE="$PEER0_ORG1_CA"
export CORE_PEER_MSPCONFIGPATH="$(pwd)/fabric-samples/test-network/organizations/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp"
export CORE_PEER_ADDRESS="localhost:7051"
export FABRIC_CFG_PATH="$(pwd)/fabric-samples/config/"

echo "============================================"
echo " GIS Chaincode Upgrade — v${CC_VERSION}"
echo "============================================"
echo ""

# 1. Package
echo "[1/5] Packaging chaincode..."
peer lifecycle chaincode package "${CC_NAME}_v${CC_VERSION}.tar.gz" \
  --path "$CC_PATH" \
  --lang "$CC_LANG" \
  --label "${CC_NAME}_${CC_VERSION}"

# 2. Install on peer0.org1
echo "[2/5] Installing on peer0.org1..."
peer lifecycle chaincode install "${CC_NAME}_v${CC_VERSION}.tar.gz"

# 3. Get package ID
echo "[3/5] Getting package ID..."
PACKAGE_ID=$(peer lifecycle chaincode queryinstalled 2>&1 | grep "${CC_NAME}_${CC_VERSION}" | awk '{print $3}' | sed 's/,//')
echo "Package ID: $PACKAGE_ID"

if [ -z "$PACKAGE_ID" ]; then
  echo "ERROR: Could not find package ID. Check that the chaincode was installed."
  exit 1
fi

# 4. Approve for Org1
echo "[4/5] Approving for Org1MSP..."
peer lifecycle chaincode approveformyorg \
  --channelID "$CHANNEL" \
  --name "$CC_NAME" \
  --version "$CC_VERSION" \
  --package-id "$PACKAGE_ID" \
  --sequence "$CC_SEQUENCE" \
  --tls \
  --cafile "$ORDERER_CA" \
  --orderer "$ORDERER"

# 5. Commit
echo "[5/5] Committing chaincode definition..."
peer lifecycle chaincode commit \
  --channelID "$CHANNEL" \
  --name "$CC_NAME" \
  --version "$CC_VERSION" \
  --sequence "$CC_SEQUENCE" \
  --tls \
  --cafile "$ORDERER_CA" \
  --orderer "$ORDERER" \
  --peerAddresses "$CORE_PEER_ADDRESS" \
  --tlsRootCertFiles "$PEER0_ORG1_CA"

echo ""
echo "============================================"
echo " ✅ Chaincode v${CC_VERSION} committed!"
echo " GIS functions now live: storeLandBoundary,"
echo " verifyBoundaryHash, updateLandUseType,"
echo " flagBoundaryConflict, getBoundaryHistory"
echo "============================================"
