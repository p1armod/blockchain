'use strict';

const { WorkloadModuleBase } = require('@hyperledger/caliper-core');
const crypto = require('crypto');

/**
 * Caliper workload module: storeLandBoundary
 * Submits a GIS parcel boundary to the Hyperledger Fabric chaincode.
 */
class StoreBoundaryWorkload extends WorkloadModuleBase {
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
    const parcelId = `P-BENCH-${this.workerIndex}-${this.txIndex}-${Date.now()}`;
    const geoJSON = JSON.stringify({
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [78.0 + Math.random() * 0.5, 17.0 + Math.random() * 0.5],
          [78.05 + Math.random() * 0.5, 17.0 + Math.random() * 0.5],
          [78.05 + Math.random() * 0.5, 17.05 + Math.random() * 0.5],
          [78.0 + Math.random() * 0.5, 17.05 + Math.random() * 0.5],
          [78.0 + Math.random() * 0.5, 17.0 + Math.random() * 0.5]
        ]]
      },
      properties: { parcelId }
    });
    const boundaryHash = crypto.createHash('sha256').update(geoJSON).digest('hex');
    const bbox = JSON.stringify({ minX: 78.0, minY: 17.0, maxX: 78.5, maxY: 17.5 });
    const areaSqm = String(Math.floor(500 + Math.random() * 9500));

    await this.sutAdapter.sendRequests({
      contractId: this.roundArguments.chaincodeId,
      contractVersion: this.roundArguments.chaincodeVersion || '2.0',
      contractFunction: 'storeLandBoundary',
      contractArguments: [parcelId, boundaryHash, bbox, areaSqm],
      readOnly: false,
      timeout: 30
    });
  }
}

module.exports.createWorkloadModule = () => new StoreBoundaryWorkload();
