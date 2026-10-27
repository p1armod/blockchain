'use strict';

const { WorkloadModuleBase } = require('@hyperledger/caliper-core');

/**
 * Caliper workload module: flagBoundaryConflict
 * Flags a boundary conflict between two parcels on the ledger.
 */
class FlagConflictWorkload extends WorkloadModuleBase {
  constructor() {
    super();
    this.txIndex = 0;
  }

  async initializeWorkloadModule(workerIndex, totalWorkers, roundIndex, roundArguments, sutAdapter, sutContext) {
    await super.initializeWorkloadModule(workerIndex, totalWorkers, roundIndex, roundArguments, sutAdapter, sutContext);
    this.workerIndex = workerIndex;
  }

  async submitTransaction() {
    this.txIndex++;
    // Simulate two conflicting parcel IDs
    const parcelIdA = `P-BENCH-${this.workerIndex}-${this.txIndex}-A`;
    const parcelIdB = `P-BENCH-${this.workerIndex}-${this.txIndex}-B`;
    const overlapAreaSqm = String(Math.floor(10 + Math.random() * 200));
    const description = `Benchmark conflict ${this.txIndex}: overlap detected by Turf.js`;

    await this.sutAdapter.sendRequests({
      contractId: this.roundArguments.chaincodeId,
      contractVersion: this.roundArguments.chaincodeVersion || '2.0',
      contractFunction: 'flagBoundaryConflict',
      contractArguments: [parcelIdA, parcelIdB, overlapAreaSqm, description],
      readOnly: false,
      timeout: 30
    });
  }
}

module.exports.createWorkloadModule = () => new FlagConflictWorkload();
