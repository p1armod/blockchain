'use strict';

const { WorkloadModuleBase } = require('@hyperledger/caliper-core');
const crypto = require('crypto');

/**
 * Caliper workload module: verifyBoundaryHash
 * Issues read-only queries to verify GIS boundary hashes on the ledger.
 */
class VerifyBoundaryWorkload extends WorkloadModuleBase {
  constructor() {
    super();
    this.txIndex = 0;
    // Pre-seeded parcel IDs — in a real run these would be stored boundaries.
    // We generate deterministic IDs so the chaincode returns "not found" gracefully.
    this.seededParcels = [];
  }

  async initializeWorkloadModule(workerIndex, totalWorkers, roundIndex, roundArguments, sutAdapter, sutContext) {
    await super.initializeWorkloadModule(workerIndex, totalWorkers, roundIndex, roundArguments, sutAdapter, sutContext);
    this.workerIndex = workerIndex;
    // Generate a pool of 50 parcel IDs that were "stored" by the store-boundary round
    for (let i = 0; i < 50; i++) {
      const parcelId = `P-BENCH-${workerIndex}-${i}-SEED`;
      const hash = crypto.createHash('sha256').update(parcelId).digest('hex');
      this.seededParcels.push({ parcelId, hash });
    }
  }

  async submitTransaction() {
    this.txIndex++;
    const entry = this.seededParcels[this.txIndex % this.seededParcels.length];

    await this.sutAdapter.sendRequests({
      contractId: this.roundArguments.chaincodeId,
      contractVersion: this.roundArguments.chaincodeVersion || '2.0',
      contractFunction: 'verifyBoundaryHash',
      contractArguments: [entry.parcelId, entry.hash],
      readOnly: true,
      timeout: 10
    });
  }
}

module.exports.createWorkloadModule = () => new VerifyBoundaryWorkload();
