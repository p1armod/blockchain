#!/bin/bash
set -e

PROJECT_ROOT="/Users/parmod/Desktop/parmod/MCA/blockchain/pbl"
export PATH="$PROJECT_ROOT/fabric-samples/bin:$PATH"
export FABRIC_CFG_PATH="$PROJECT_ROOT/fabric-samples/test-network/docker/peercfg"
export CORE_PEER_TLS_ENABLED=true

ORDERER_CA="$PROJECT_ROOT/fabric-samples/test-network/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/tls/ca.crt"
ORG1_CA="$PROJECT_ROOT/fabric-samples/test-network/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt"
ORG2_CA="$PROJECT_ROOT/fabric-samples/test-network/organizations/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt"
ORG3_CA="$PROJECT_ROOT/fabric-samples/test-network/organizations/peerOrganizations/org3.example.com/peers/peer0.org3.example.com/tls/ca.crt"
ORG1_MSP="$PROJECT_ROOT/fabric-samples/test-network/organizations/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp"
ORG2_MSP="$PROJECT_ROOT/fabric-samples/test-network/organizations/peerOrganizations/org2.example.com/users/Admin@org2.example.com/msp"
ORG3_MSP="$PROJECT_ROOT/fabric-samples/test-network/organizations/peerOrganizations/org3.example.com/users/Admin@org3.example.com/msp"

CC_PKG="$PROJECT_ROOT/chaincode/land-registration.tar.gz"
CHANNEL="mychannel"
CC_NAME="land-registration"
CC_VERSION="1.0"
CC_SEQUENCE=1
POLICY="AND('Org1MSP.member','Org2MSP.member','Org3MSP.member')"

echo "====== Step 1-3: Install chaincode on all orgs (skip if already installed) ======"
for ORG in 1 2 3; do
  case $ORG in
    1) export CORE_PEER_LOCALMSPID="Org1MSP"; export CORE_PEER_ADDRESS=localhost:7051; export CORE_PEER_TLS_ROOTCERT_FILE="$ORG1_CA"; export CORE_PEER_MSPCONFIGPATH="$ORG1_MSP" ;;
    2) export CORE_PEER_LOCALMSPID="Org2MSP"; export CORE_PEER_ADDRESS=localhost:9051; export CORE_PEER_TLS_ROOTCERT_FILE="$ORG2_CA"; export CORE_PEER_MSPCONFIGPATH="$ORG2_MSP" ;;
    3) export CORE_PEER_LOCALMSPID="Org3MSP"; export CORE_PEER_ADDRESS=localhost:11051; export CORE_PEER_TLS_ROOTCERT_FILE="$ORG3_CA"; export CORE_PEER_MSPCONFIGPATH="$ORG3_MSP" ;;
  esac
  peer lifecycle chaincode install "$CC_PKG" 2>&1 | grep -v "already successfully installed" || true
  echo "Org$ORG install done (or already installed)"
done

echo "====== Step 4: Get Package ID ======"
export CORE_PEER_LOCALMSPID="Org1MSP"
export CORE_PEER_ADDRESS=localhost:7051
export CORE_PEER_TLS_ROOTCERT_FILE="$ORG1_CA"
export CORE_PEER_MSPCONFIGPATH="$ORG1_MSP"
CC_PACKAGE_ID=$(peer lifecycle chaincode queryinstalled 2>&1 | grep "$CC_NAME" | head -1 | awk '{print $3}' | sed 's/,$//')
echo "Package ID: $CC_PACKAGE_ID"

echo "====== Step 5: Approve for Org1 ======"
export CORE_PEER_LOCALMSPID="Org1MSP"
export CORE_PEER_ADDRESS=localhost:7051
export CORE_PEER_TLS_ROOTCERT_FILE="$ORG1_CA"
export CORE_PEER_MSPCONFIGPATH="$ORG1_MSP"
peer lifecycle chaincode approveformyorg \
  -o localhost:7050 --ordererTLSHostnameOverride orderer.example.com \
  --tls --cafile "$ORDERER_CA" \
  --channelID "$CHANNEL" --name "$CC_NAME" --version "$CC_VERSION" \
  --package-id "$CC_PACKAGE_ID" --sequence "$CC_SEQUENCE"
echo "Org1 approve done"

echo "====== Step 6: Approve for Org2 ======"
export CORE_PEER_LOCALMSPID="Org2MSP"
export CORE_PEER_ADDRESS=localhost:9051
export CORE_PEER_TLS_ROOTCERT_FILE="$ORG2_CA"
export CORE_PEER_MSPCONFIGPATH="$ORG2_MSP"
peer lifecycle chaincode approveformyorg \
  -o localhost:7050 --ordererTLSHostnameOverride orderer.example.com \
  --tls --cafile "$ORDERER_CA" \
  --channelID "$CHANNEL" --name "$CC_NAME" --version "$CC_VERSION" \
  --package-id "$CC_PACKAGE_ID" --sequence "$CC_SEQUENCE"
echo "Org2 approve done"

echo "====== Step 7: Approve for Org3 ======"
export CORE_PEER_LOCALMSPID="Org3MSP"
export CORE_PEER_ADDRESS=localhost:11051
export CORE_PEER_TLS_ROOTCERT_FILE="$ORG3_CA"
export CORE_PEER_MSPCONFIGPATH="$ORG3_MSP"
peer lifecycle chaincode approveformyorg \
  -o localhost:7050 --ordererTLSHostnameOverride orderer.example.com \
  --tls --cafile "$ORDERER_CA" \
  --channelID "$CHANNEL" --name "$CC_NAME" --version "$CC_VERSION" \
  --package-id "$CC_PACKAGE_ID" --sequence "$CC_SEQUENCE"
echo "Org3 approve done"

echo "====== Step 8: Check commit readiness ======"
export CORE_PEER_LOCALMSPID="Org1MSP"
export CORE_PEER_ADDRESS=localhost:7051
export CORE_PEER_TLS_ROOTCERT_FILE="$ORG1_CA"
export CORE_PEER_MSPCONFIGPATH="$ORG1_MSP"
peer lifecycle chaincode checkcommitreadiness \
  --channelID "$CHANNEL" --name "$CC_NAME" --version "$CC_VERSION" \
  --sequence "$CC_SEQUENCE" --output json

echo "====== Step 9: Commit chaincode ======"
peer lifecycle chaincode commit \
  -o localhost:7050 --ordererTLSHostnameOverride orderer.example.com \
  --tls --cafile "$ORDERER_CA" \
  --channelID "$CHANNEL" --name "$CC_NAME" --version "$CC_VERSION" \
  --sequence "$CC_SEQUENCE" \
  --peerAddresses localhost:7051 --tlsRootCertFiles "$ORG1_CA" \
  --peerAddresses localhost:9051 --tlsRootCertFiles "$ORG2_CA" \
  --peerAddresses localhost:11051 --tlsRootCertFiles "$ORG3_CA"
echo "Chaincode committed!"

echo "====== Step 10: Verify deployment ======"
peer lifecycle chaincode querycommitted --channelID "$CHANNEL" --name "$CC_NAME"
echo ""
echo "=========================================="
echo "  Chaincode deployed successfully!"
echo "=========================================="
