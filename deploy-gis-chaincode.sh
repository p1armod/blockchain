#!/bin/bash
# deploy-gis-chaincode.sh — Upgrade to v2.0 (GIS functions), Sequence 3
set -e

PROJECT_ROOT="/Users/parmod/Desktop/parmod/MCA/blockchain/pbl"
PEER="${PROJECT_ROOT}/fabric-samples/bin/peer"
CC_PKG="${PROJECT_ROOT}/land-registration_2.0.tar.gz"
ORDERER_CA="${PROJECT_ROOT}/fabric-samples/test-network/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/tls/ca.crt"
PEER0_ORG1_CA="${PROJECT_ROOT}/fabric-samples/test-network/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt"
PEER0_ORG2_CA="${PROJECT_ROOT}/fabric-samples/test-network/organizations/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt"
PEER0_ORG3_CA="${PROJECT_ROOT}/fabric-samples/test-network/organizations/peerOrganizations/org3.example.com/peers/peer0.org3.example.com/tls/ca.crt"

export FABRIC_CFG_PATH="${PROJECT_ROOT}/fabric-samples/test-network/docker/peercfg"
export CORE_PEER_TLS_ENABLED=true

setOrg1() {
  export CORE_PEER_LOCALMSPID="Org1MSP"
  export CORE_PEER_TLS_ROOTCERT_FILE=$PEER0_ORG1_CA
  export CORE_PEER_MSPCONFIGPATH="${PROJECT_ROOT}/fabric-samples/test-network/organizations/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp"
  export CORE_PEER_ADDRESS=localhost:7051
}

setOrg2() {
  export CORE_PEER_LOCALMSPID="Org2MSP"
  export CORE_PEER_TLS_ROOTCERT_FILE=$PEER0_ORG2_CA
  export CORE_PEER_MSPCONFIGPATH="${PROJECT_ROOT}/fabric-samples/test-network/organizations/peerOrganizations/org2.example.com/users/Admin@org2.example.com/msp"
  export CORE_PEER_ADDRESS=localhost:9051
}

setOrg3() {
  export CORE_PEER_LOCALMSPID="Org3MSP"
  export CORE_PEER_TLS_ROOTCERT_FILE=$PEER0_ORG3_CA
  export CORE_PEER_MSPCONFIGPATH="${PROJECT_ROOT}/fabric-samples/test-network/organizations/peerOrganizations/org3.example.com/users/Admin@org3.example.com/msp"
  export CORE_PEER_ADDRESS=localhost:11051
}

echo "=== [1/6] Installing on Org1 ==="
setOrg1
$PEER lifecycle chaincode install $CC_PKG || echo "already installed"

echo "=== [2/6] Installing on Org2 ==="
setOrg2
$PEER lifecycle chaincode install $CC_PKG || echo "already installed"

echo "=== [3/6] Installing on Org3 ==="
setOrg3
$PEER lifecycle chaincode install $CC_PKG || echo "already installed"

echo "=== [4/6] Getting Package ID ==="
setOrg1
PKG_ID=$($PEER lifecycle chaincode queryinstalled 2>&1 | grep "land_registration_2.0" | head -1 | awk '{print $3}' | sed 's/,//')
echo "Package ID: $PKG_ID"

if [ -z "$PKG_ID" ]; then
  echo "ERROR: Package ID not found!"
  exit 1
fi

POLICY="AND('Org1MSP.member', 'Org2MSP.member', 'Org3MSP.member')"

echo "=== [5/6] Approving for all orgs ==="
setOrg1
$PEER lifecycle chaincode approveformyorg -o localhost:7050 --ordererTLSHostnameOverride orderer.example.com --tls --cafile $ORDERER_CA --channelID mychannel --name land-registration --version 2.0 --package-id $PKG_ID --sequence 3 --signature-policy "$POLICY" && echo "Org1 approved"

setOrg2
$PEER lifecycle chaincode approveformyorg -o localhost:7050 --ordererTLSHostnameOverride orderer.example.com --tls --cafile $ORDERER_CA --channelID mychannel --name land-registration --version 2.0 --package-id $PKG_ID --sequence 3 --signature-policy "$POLICY" && echo "Org2 approved"

setOrg3
$PEER lifecycle chaincode approveformyorg -o localhost:7050 --ordererTLSHostnameOverride orderer.example.com --tls --cafile $ORDERER_CA --channelID mychannel --name land-registration --version 2.0 --package-id $PKG_ID --sequence 3 --signature-policy "$POLICY" && echo "Org3 approved"

echo "=== [6/6] Committing chaincode v2.0 ==="
setOrg1
$PEER lifecycle chaincode commit -o localhost:7050 --ordererTLSHostnameOverride orderer.example.com --tls --cafile $ORDERER_CA --channelID mychannel --name land-registration --version 2.0 --sequence 3 --signature-policy "$POLICY" \
  --peerAddresses localhost:7051  --tlsRootCertFiles $PEER0_ORG1_CA \
  --peerAddresses localhost:9051  --tlsRootCertFiles $PEER0_ORG2_CA \
  --peerAddresses localhost:11051 --tlsRootCertFiles $PEER0_ORG3_CA

echo ""
echo "=== DONE: chaincode v2.0 (GIS) committed on mychannel ==="
