'use client';

import { FiAlertTriangle, FiX, FiInfo } from 'react-icons/fi';

interface ConflictDetail {
  parcelId: string;
  overlapAreaSqm?: number;
  ownerName?: string;
}

interface OverlapAlertProps {
  conflicts: ConflictDetail[];
  onDismiss?: () => void;
  onViewParcel?: (parcelId: string) => void;
}

/**
 * OverlapAlert — shown when a drawn/uploaded boundary overlaps existing parcels.
 * Displays a prominent warning with details of each conflicting parcel.
 */
export default function OverlapAlert({ conflicts, onDismiss, onViewParcel }: OverlapAlertProps) {
  if (conflicts.length === 0) return null;

  return (
    <div
      role="alert"
      className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] w-full max-w-md px-4"
    >
      <div className="bg-red-50 border border-red-300 rounded-xl shadow-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between bg-red-500 text-white px-4 py-3">
          <div className="flex items-center gap-2 font-semibold">
            <FiAlertTriangle className="text-xl" />
            Boundary Conflict Detected
          </div>
          {onDismiss && (
            <button onClick={onDismiss} className="text-white/80 hover:text-white transition-colors">
              <FiX />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="p-4 space-y-3">
          <p className="text-sm text-red-800">
            The boundary you drew overlaps with{' '}
            <strong>{conflicts.length} existing parcel{conflicts.length > 1 ? 's' : ''}</strong>.
            This registration cannot proceed without resolving conflicts.
          </p>

          <div className="space-y-2 max-h-40 overflow-y-auto">
            {conflicts.map((conflict) => (
              <div
                key={conflict.parcelId}
                className="flex items-center justify-between bg-white border border-red-200 rounded-lg px-3 py-2 text-xs"
              >
                <div>
                  <div className="font-semibold text-gray-800">{conflict.parcelId}</div>
                  {conflict.ownerName && (
                    <div className="text-gray-500">Owner: {conflict.ownerName}</div>
                  )}
                  {conflict.overlapAreaSqm !== undefined && (
                    <div className="text-red-600">Overlap: {conflict.overlapAreaSqm.toFixed(1)} m²</div>
                  )}
                </div>
                {onViewParcel && (
                  <button
                    onClick={() => onViewParcel(conflict.parcelId)}
                    className="flex items-center gap-1 text-blue-600 hover:text-blue-800 transition-colors font-medium"
                  >
                    <FiInfo />
                    View
                  </button>
                )}
              </div>
            ))}
          </div>

          <p className="text-xs text-red-700 bg-red-100 rounded-lg px-3 py-2">
            ⚠️ All conflicts are recorded on the Hyperledger Fabric ledger for audit purposes.
          </p>
        </div>
      </div>
    </div>
  );
}
