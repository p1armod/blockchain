'use client';

import { useState, useEffect } from 'react';
import { gisApi } from '@/lib/fabric-api';
import { FiSatellite, FiAlertTriangle, FiCheckCircle, FiLoader } from 'react-icons/fi';

type LandUseClass = 'agricultural' | 'residential' | 'forest' | 'water' | 'commercial' | 'industrial' | 'unknown';

interface NdviData {
  ndvi: number;
  classification: LandUseClass;
  confidence: number;
}

interface SatelliteBadgeProps {
  parcelId: string;
  lat: number;
  lng: number;
  registeredLandUse?: string;
}

/** Land use type → emoji + color */
const LAND_USE_DISPLAY: Record<string, { emoji: string; label: string; color: string }> = {
  agricultural: { emoji: '🟤', label: 'Agricultural', color: 'text-amber-700 bg-amber-50' },
  residential:  { emoji: '🏘️', label: 'Residential',  color: 'text-blue-700 bg-blue-50' },
  forest:       { emoji: '🌲', label: 'Forest',        color: 'text-green-700 bg-green-50' },
  water:        { emoji: '🔵', label: 'Water Body',    color: 'text-cyan-700 bg-cyan-50' },
  commercial:   { emoji: '🟡', label: 'Commercial',    color: 'text-yellow-700 bg-yellow-50' },
  industrial:   { emoji: '🏭', label: 'Industrial',    color: 'text-orange-700 bg-orange-50' },
  unknown:      { emoji: '❓', label: 'Unknown',       color: 'text-gray-600 bg-gray-50' },
};

/**
 * SatelliteBadge — shows NDVI-based land use classification from satellite service.
 * Warns if satellite classification mismatches the registered land use.
 */
export default function SatelliteBadge({ parcelId, lat, lng, registeredLandUse }: SatelliteBadgeProps) {
  const [ndvi, setNdvi] = useState<NdviData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!lat || !lng) return;
    setLoading(true);
    setError(null);

    gisApi.getNdvi(lat, lng)
      .then((data) => setNdvi(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [lat, lng]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
        <FiLoader className="animate-spin text-blue-400" />
        <span>Fetching satellite data…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
        <FiSatellite className="text-gray-400" />
        <span>Satellite unavailable</span>
      </div>
    );
  }

  if (!ndvi) return null;

  const display = LAND_USE_DISPLAY[ndvi.classification] ?? LAND_USE_DISPLAY.unknown;
  const mismatch = registeredLandUse && ndvi.classification !== registeredLandUse;

  return (
    <div className="space-y-2">
      <div className={`flex items-center gap-2 text-xs font-medium rounded-lg px-3 py-2 ${display.color}`}>
        <FiSatellite className="opacity-70" />
        <span>{display.emoji} {display.label}</span>
        <span className="ml-auto opacity-60">NDVI {ndvi.ndvi.toFixed(3)}</span>
      </div>

      <div className="flex items-center gap-2 text-xs bg-gray-50 rounded-lg px-3 py-2">
        <span className="text-gray-500">Confidence:</span>
        <div className="flex-1 bg-gray-200 rounded-full h-1.5 overflow-hidden">
          <div
            className="h-full bg-green-400 rounded-full transition-all"
            style={{ width: `${(ndvi.confidence * 100).toFixed(0)}%` }}
          />
        </div>
        <span className="text-gray-600 font-medium">{(ndvi.confidence * 100).toFixed(0)}%</span>
      </div>

      {mismatch ? (
        <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <FiAlertTriangle className="text-amber-500 flex-shrink-0" />
          <span>
            Satellite says <strong>{display.label}</strong>, registered as{' '}
            <strong>{LAND_USE_DISPLAY[registeredLandUse]?.label ?? registeredLandUse}</strong>
          </span>
        </div>
      ) : registeredLandUse ? (
        <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 rounded-lg px-3 py-2">
          <FiCheckCircle className="text-green-500" />
          <span>Satellite classification matches registered land use</span>
        </div>
      ) : null}
    </div>
  );
}
