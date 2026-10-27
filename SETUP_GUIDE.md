# 🏛️ E-Land Records — Complete Setup Guide
> Based on actual setup experience on macOS. Follow every step in order.

---

## 📋 Prerequisites

Make sure these are installed before starting:

| Tool | Check Command | Required Version |
|---|---|---|
| Node.js | `node --version` | v18 LTS or v20+ |
| npm | `npm --version` | v9+ |
| Docker Desktop | `docker --version` | v24+ |
| Docker Compose | `docker compose version` | v2+ |
| Git | `git --version` | any |

> [!IMPORTANT]
> **Docker Desktop must be running** before you start. All Fabric nodes and MongoDB run inside Docker.

---

## 🗂️ Project Structure

```
pbl/
├── client/                       # Next.js frontend (port 3000)
├── fabric-api/                   # Express blockchain bridge (port 3001)
├── chaincode/
│   └── land-registration/        # Smart contract (Node.js)
├── fabric-samples/
│   ├── bin/                      # Fabric binaries (downloaded separately)
│   ├── config/                   # Fabric config
│   └── test-network/             # Docker network, crypto, channel configs
├── setorg1.sh / setorg2.sh / setorg3.sh
├── setup-network.sh              # ⚠️ Run ONCE only
├── start-network.sh              # Use daily to resume containers
└── deploy-chaincode-manual.sh    # Created during setup — use if setup-network.sh hangs
```

---

## 🚀 Step 1 — Clone & Enter Project

```bash
git clone https://github.com/p1armod/blockchain.git
cd blockchain
```

---

## 🔧 Step 2 — Download Hyperledger Fabric Binaries

> [!WARNING]
> The repo does **not** include Fabric binaries. You must download them manually.
> `setup-network.sh` needs: `cryptogen`, `configtxgen`, `peer`, `osnadmin`, `fabric-ca-client`

```bash
# Create bin directory
mkdir -p fabric-samples/bin

# Download Fabric core binaries (~106 MB)
curl -fSL "https://github.com/hyperledger/fabric/releases/download/v2.5.12/hyperledger-fabric-darwin-amd64-2.5.12.tar.gz" \
  -o /tmp/fabric-bins.tar.gz

# Download Fabric CA binaries (~31 MB)
curl -fSL "https://github.com/hyperledger/fabric-ca/releases/download/v1.5.12/hyperledger-fabric-ca-darwin-amd64-1.5.12.tar.gz" \
  -o /tmp/fabric-ca-bins.tar.gz

# Extract both into fabric-samples/
tar -xzf /tmp/fabric-bins.tar.gz    -C fabric-samples/
tar -xzf /tmp/fabric-ca-bins.tar.gz -C fabric-samples/

# Verify — should see: configtxgen, cryptogen, peer, osnadmin, fabric-ca-client, etc.
ls fabric-samples/bin/
```

> [!TIP]
> Downloads can be slow (50–300 KB/s). Expect 5–15 min total.
> If a download stalls at 0 bytes for 30+ seconds, cancel with Ctrl+C and retry — GitHub CDN sometimes needs a few tries.

---

## 🍃 Step 3 — Start MongoDB via Docker

```bash
docker run -d --name mongodb-eland -p 27017:27017 mongo:7

# Verify running
docker ps | grep mongodb-eland
```

> [!NOTE]
> The app code defaults to `mongodb://localhost:27017/eland-records` automatically if `MONGODB_URI` is not set in `.env.local`.

---

## 📝 Step 4 — Create Environment Files

```bash
# Client
cp client/.env.example client/.env.local

# Fabric API
cp fabric-api/.env.example fabric-api/.env
```

Edit `client/.env.local` with at minimum:

```env
MONGODB_URI=mongodb://localhost:27017/eland-records
NEXT_PUBLIC_FABRIC_API_URL=http://localhost:3001
NEXT_PUBLIC_BASE_URL=http://localhost:3000
NODE_ENV=development

# SMTP is optional in dev — OTPs print to console if not configured
# SMTP_USER=your@gmail.com
# SMTP_PASSWORD=your_16_char_app_password
```

---

## 📦 Step 5 — Install npm Dependencies

```bash
# 1. Client — ~726 packages (downloads Chromium for Puppeteer, ~170 MB)
cd client && npm install && cd ..

# 2. Fabric API — ~436 packages
cd fabric-api && npm install && cd ..

# 3. Chaincode — ~79 packages
cd chaincode/land-registration && npm install && cd ../..
```

> [!TIP]
> Run all three in separate terminals simultaneously to save time.
> The `client` install is slowest due to Puppeteer downloading Chromium.

---

## ⛓️ Step 6 — Set Up Fabric Network (First Time Only)

> [!CAUTION]
> **Run `setup-network.sh` only once!**
> Running it again destroys all existing blockchain data and registered land records.
> For daily use, use `start-network.sh` instead.

```bash
# Make all shell scripts executable
chmod +x *.sh fabric-samples/test-network/*.sh

# Export binaries to PATH and run full setup
export PATH="$PWD/fabric-samples/bin:$PATH"
export FABRIC_CFG_PATH="$PWD/fabric-samples/config"

bash setup-network.sh
```

This script does:
1. ✅ Generates crypto materials for Org1, Org2, Org3 (`cryptogen`)
2. ✅ Creates channel genesis block (`configtxgen`)
3. ✅ Starts all Docker containers (3 peers + 3 orderers + 3 CAs)
4. ✅ Joins all orgs to `mychannel`
5. ⚠️ May hang at chaincode install → see Step 7

---

## 🔗 Step 7 — Deploy Chaincode Manually (if Step 6 hung)

> [!NOTE]
> If `setup-network.sh` stalled for 3+ minutes at "Installing chaincode on Org1...", the
> crypto and channel setup already completed. Only chaincode deployment is missing.

Check if the chaincode package was created:
```bash
ls chaincode/land-registration.tar.gz
```

If missing, create it first:
```bash
export PATH="$PWD/fabric-samples/bin:$PATH"
export FABRIC_CFG_PATH="$PWD/fabric-samples/test-network/docker/peercfg"

peer lifecycle chaincode package chaincode/land-registration.tar.gz \
  --path chaincode/land-registration \
  --lang node \
  --label land-registration_1.2
```

Now create and run this deploy script (save as `deploy-chaincode-manual.sh`):

```bash
#!/bin/bash
set -e

PROJECT_ROOT="$(pwd)"
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
CHANNEL="mychannel"; CC_NAME="land-registration"; CC_VERSION="1.0"; CC_SEQUENCE=1

# Install on all 3 orgs (skip if already done)
for ORG in 1 2 3; do
  case $ORG in
    1) export CORE_PEER_LOCALMSPID="Org1MSP"; export CORE_PEER_ADDRESS=localhost:7051; export CORE_PEER_TLS_ROOTCERT_FILE="$ORG1_CA"; export CORE_PEER_MSPCONFIGPATH="$ORG1_MSP" ;;
    2) export CORE_PEER_LOCALMSPID="Org2MSP"; export CORE_PEER_ADDRESS=localhost:9051; export CORE_PEER_TLS_ROOTCERT_FILE="$ORG2_CA"; export CORE_PEER_MSPCONFIGPATH="$ORG2_MSP" ;;
    3) export CORE_PEER_LOCALMSPID="Org3MSP"; export CORE_PEER_ADDRESS=localhost:11051; export CORE_PEER_TLS_ROOTCERT_FILE="$ORG3_CA"; export CORE_PEER_MSPCONFIGPATH="$ORG3_MSP" ;;
  esac
  peer lifecycle chaincode install "$CC_PKG" 2>&1 | grep -v "already successfully installed" || true
  echo "Org$ORG install done"
done

# Get Package ID
export CORE_PEER_LOCALMSPID="Org1MSP"; export CORE_PEER_ADDRESS=localhost:7051
export CORE_PEER_TLS_ROOTCERT_FILE="$ORG1_CA"; export CORE_PEER_MSPCONFIGPATH="$ORG1_MSP"
CC_PACKAGE_ID=$(peer lifecycle chaincode queryinstalled 2>&1 | grep "$CC_NAME" | head -1 | awk '{print $3}' | sed 's/,$//')
echo "Package ID: $CC_PACKAGE_ID"

# Approve for all 3 orgs
for ORG in 1 2 3; do
  case $ORG in
    1) export CORE_PEER_LOCALMSPID="Org1MSP"; export CORE_PEER_ADDRESS=localhost:7051; export CORE_PEER_TLS_ROOTCERT_FILE="$ORG1_CA"; export CORE_PEER_MSPCONFIGPATH="$ORG1_MSP" ;;
    2) export CORE_PEER_LOCALMSPID="Org2MSP"; export CORE_PEER_ADDRESS=localhost:9051; export CORE_PEER_TLS_ROOTCERT_FILE="$ORG2_CA"; export CORE_PEER_MSPCONFIGPATH="$ORG2_MSP" ;;
    3) export CORE_PEER_LOCALMSPID="Org3MSP"; export CORE_PEER_ADDRESS=localhost:11051; export CORE_PEER_TLS_ROOTCERT_FILE="$ORG3_CA"; export CORE_PEER_MSPCONFIGPATH="$ORG3_MSP" ;;
  esac
  peer lifecycle chaincode approveformyorg \
    -o localhost:7050 --ordererTLSHostnameOverride orderer.example.com \
    --tls --cafile "$ORDERER_CA" \
    --channelID "$CHANNEL" --name "$CC_NAME" --version "$CC_VERSION" \
    --package-id "$CC_PACKAGE_ID" --sequence "$CC_SEQUENCE"
  echo "Org$ORG approved"
done

# Commit to channel
export CORE_PEER_LOCALMSPID="Org1MSP"; export CORE_PEER_ADDRESS=localhost:7051
export CORE_PEER_TLS_ROOTCERT_FILE="$ORG1_CA"; export CORE_PEER_MSPCONFIGPATH="$ORG1_MSP"
peer lifecycle chaincode commit \
  -o localhost:7050 --ordererTLSHostnameOverride orderer.example.com \
  --tls --cafile "$ORDERER_CA" \
  --channelID "$CHANNEL" --name "$CC_NAME" --version "$CC_VERSION" --sequence "$CC_SEQUENCE" \
  --peerAddresses localhost:7051  --tlsRootCertFiles "$ORG1_CA" \
  --peerAddresses localhost:9051  --tlsRootCertFiles "$ORG2_CA" \
  --peerAddresses localhost:11051 --tlsRootCertFiles "$ORG3_CA"

echo "✅ Chaincode deployed!"
peer lifecycle chaincode querycommitted --channelID "$CHANNEL" --name "$CC_NAME"
```

```bash
chmod +x deploy-chaincode-manual.sh
bash deploy-chaincode-manual.sh
```

Expected final output:
```
Version: 1.0, Sequence: 1, Approvals: [Org1MSP: true, Org2MSP: true, Org3MSP: true]
```

---

## 🔑 Step 8 — Enroll ABAC Users via Fabric CA

```bash
export PATH="$PWD/fabric-samples/bin:$PATH"
cd fabric-samples/test-network
bash enrollWithABAC.sh
cd ../..
```

> [!NOTE]
> "Identity already registered" errors are **safe to ignore** — the script handles them gracefully and still enrolls the certificate.

---

## 🗄️ Step 9 — Seed the Database

```bash
cd client

# Create Super Admin
node create-admin.js
# ✅ Email: admin@elandrecords.gov / Password: admin123

# Create all government officials
node create-officials.js
# ✅ Creates: clerk1, superintendent1, mro1, vro1, survey1, collector1, etc.

cd ..
```

---

## ▶️ Step 10 — Start the Application

Open **two terminal windows**:

**Terminal 1 — Fabric API:**
```bash
cd fabric-api
node index.js
# Output: Fabric API server running on port 3001
```

**Terminal 2 — Next.js Client:**
```bash
cd client
npm run dev
# Output: ✓ Ready in ~900ms  http://localhost:3000
```

---

## ✅ Verify Everything Works

```bash
# API health check
curl http://localhost:3001/health
# Expected: {"status":"OK","timestamp":"..."}

# Blockchain query (empty on fresh setup)
curl http://localhost:3001/api/land/applications
# Expected: {"success":true,"data":[]}
```

Then open **http://localhost:3000** in your browser. 🎉

---

## 🔐 Default Login Credentials

| Role | Username/Email | Password |
|---|---|---|
| Super Admin | `admin@elandrecords.gov` | `admin123` |
| Clerk | `clerk1` | see `create-officials.js` |
| MRO | `mro1` | see `create-officials.js` |
| VRO | `vro1` | see `create-officials.js` |
| Surveyor | `survey1` | see `create-officials.js` |
| Collector | `collector1` | see `create-officials.js` |
| Joint Collector | `joint_collector1` | see `create-officials.js` |

---

## 🔄 Daily Startup (After First-Time Setup)

```bash
# 1. Start MongoDB
docker start mongodb-eland

# 2. Resume Fabric containers
bash start-network.sh

# 3. Start app servers (two terminals)
cd fabric-api && node index.js
cd client && npm run dev
```

---

## 🛑 Daily Shutdown

```bash
# Ctrl+C in both server terminals, then:

docker stop peer0.org1.example.com peer0.org2.example.com peer0.org3.example.com \
             orderer.example.com orderer2.example.com orderer3.example.com \
             ca_org1 ca_org2 ca_org3
docker stop mongodb-eland
```

---

## 🔍 Troubleshooting

### ❌ `cryptogen: command not found`
Binaries not in PATH. Add them:
```bash
export PATH="$PWD/fabric-samples/bin:$PATH"
```

### ❌ Container name already in use
Old containers still exist. Remove them:
```bash
docker stop peer0.org1.example.com peer0.org2.example.com peer0.org3.example.com \
             orderer.example.com orderer2.example.com orderer3.example.com \
             ca_org1 ca_org2 ca_org3 ca_orderer 2>/dev/null
docker rm peer0.org1.example.com peer0.org2.example.com peer0.org3.example.com \
           orderer.example.com orderer2.example.com orderer3.example.com \
           ca_org1 ca_org2 ca_org3 ca_orderer 2>/dev/null
docker network rm fabric_test 2>/dev/null
```
Then re-run `setup-network.sh`.

### ❌ `setup-network.sh` hangs at chaincode install
Channel + crypto setup completed. Skip to **Step 7** — run `deploy-chaincode-manual.sh` directly.

### ❌ `chaincode already successfully installed`
Safe to ignore. The deploy script skips re-installs automatically.

### ❌ `ccp-generate.sh: Permission denied`
```bash
chmod +x fabric-samples/test-network/organizations/ccp-generate.sh
```

### ❌ MongoDB connection refused
```bash
docker ps | grep mongodb-eland   # check if running
docker start mongodb-eland        # start if stopped
```

### ❌ OTP not received by email
Expected in dev! SMTP is not configured. Check the **client terminal** — OTP is printed directly to console output.

### ❌ `generate_admin_certs.sh` fails with path error
This script has hardcoded Windows paths from the original developer's machine. **Skip it entirely** — the cryptogen admin certs created by `setup-network.sh` are sufficient for the fabric-api to work.

### ❌ fabric-api returns 500 on blockchain routes after re-running setup
Re-run ABAC enrollment (Step 8) whenever you do a fresh network setup — the CA-enrolled certs get regenerated.

---

## 🏗️ Architecture

```
Browser (3000) → Next.js Client → MongoDB (27017)
                              ↘
                         Fabric API (3001)
                         ↙    ↓    ↘
                    Org1  Org2  Org3   ← Hyperledger Fabric Peers
                    7051  9051  11051
                         ↓
                    Orderer (7050)
                    Raft Consensus
```

---

## 📁 Key Files Reference

| File | Purpose |
|---|---|
| `client/.env.local` | MongoDB URI, SMTP, API URLs — **never commit this** |
| `fabric-api/.env` | Fabric API port — safe to commit |
| `fabric-samples/bin/` | Fabric CLI binaries — downloaded, not in Git |
| `fabric-samples/test-network/organizations/` | All crypto certs — generated by cryptogen |
| `chaincode/land-registration/lib/land-registration-contract.js` | Smart contract logic |
| `deploy-chaincode-manual.sh` | Fallback chaincode deploy |
| `start-network.sh` | Daily resume script |
| `setup-network.sh` | First-time full setup (**once only!**) |
