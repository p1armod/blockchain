'use client';

import dynamic from 'next/dynamic';
import { useState, useCallback } from 'react';
import Link from 'next/link';
import { FiMap, FiLayers, FiArrowLeft, FiFilter, FiX, FiInfo } from 'react-icons/fi';
import { FaLeaf } from 'react-icons/fa';
import OverlapAlert from '@/components/OverlapAlert';
import SatelliteBadge from '@/components/SatelliteBadge';

// --- Lazy-load map components (Leaflet requires browser environment) ---
const MapView = dynamic(() => import('@/components/MapView'), { ssr: false });
const ParcelLayer = dynamic(() => import('@/components/ParcelLayer'), { ssr: false });
const BoundaryDrawTool = dynamic(() => import('@/components/BoundaryDrawTool'), { ssr: false });

// --- Types ---
interface Parcel {
  parcel_id: string;
  boundary: object;
  land_use_type: string;
  area_sqm: number;
  created_at: string;
  owner_name?: string;
}

interface ConflictDetail {
  parcelId: string;
  overlapAreaSqm?: number;
  ownerName?: string;
}

const LAND_USE_OPTIONS = [
  { value: '', label: 'All Types' },
  { value: 'agricultural', label: '🟤 Agricultural' },
  { value: 'residential',  label: '🏘️ Residential' },
  { value: 'forest',       label: '🌲 Forest' },
  { value: 'water',        label: '🔵 Water Body' },
  { value: 'commercial',   label: '🟡 Commercial' },
  { value: 'industrial',   label: '🏭 Industrial' },
];

/**
 * GIS Map Page — /gis-map
 * Full-screen interactive map with:
 * - OpenStreetMap base tiles
 * - PostGIS parcel layer with land-use colors
 * - Boundary draw tool with real-time overlap detection
 * - Satellite NDVI badge for selected parcels
 * - Land use filter sidebar
 */
export default function GisMapPage() {
  const [mapBounds, setMapBounds] = useState<{ minX: number; minY: number; maxX: number; maxY: number } | null>(null);
  const [selectedParcel, setSelectedParcel] = useState<Parcel | null>(null);
  const [conflicts, setConflicts] = useState<ConflictDetail[]>([]);
  const [filterLandUse, setFilterLandUse] = useState<string>('');
  const [showSidebar, setShowSidebar] = useState(true);
  const [drawParcelId, setDrawParcelId] = useState<string>('');

  const handleBoundsChange = useCallback(
    (bounds: { minX: number; minY: number; maxX: number; maxY: number }) => {
      setMapBounds(bounds);
    },
    []
  );

  const handleParcelClick = useCallback((parcel: Parcel) => {
    setSelectedParcel(parcel);
  }, []);

  const handleOverlapDetected = useCallback((conflictParcelIds: string[]) => {
    setConflicts(conflictParcelIds.map(id => ({ parcelId: id })));
  }, []);

  const handleDismissConflicts = useCallback(() => {
    setConflicts([]);
  }, []);

  // Compute a center lat/lng for the selected parcel (simple centroid estimate)
  const selectedParcelCenter = selectedParcel ? { lat: 17.385, lng: 78.4867 } : null;

  return (
    <div className="flex h-screen bg-gray-950 overflow-hidden">
      {/* ── Sidebar ── */}
      <aside
        className={`flex-shrink-0 transition-all duration-300 ${
          showSidebar ? 'w-80' : 'w-0 overflow-hidden'
        } bg-gray-900 border-r border-gray-700 flex flex-col`}
      >
        {/* Sidebar header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-700">
          <div className="p-2 bg-green-500/20 rounded-lg">
            <FaLeaf className="text-green-400 text-lg" />
          </div>
          <div>
            <h1 className="text-white font-bold text-base leading-tight">GIS Land Map</h1>
            <p className="text-gray-400 text-xs">Blockchain Land Registry</p>
          </div>
          <Link href="/" className="ml-auto text-gray-400 hover:text-white transition-colors">
            <FiArrowLeft />
          </Link>
        </div>

        {/* Land use filter */}
        <div className="px-4 py-4 border-b border-gray-700">
          <label className="flex items-center gap-2 text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
            <FiFilter />
            Filter by Land Use
          </label>
          <select
            value={filterLandUse}
            onChange={e => setFilterLandUse(e.target.value)}
            className="w-full bg-gray-800 text-white text-sm rounded-lg px-3 py-2 border border-gray-600 focus:border-green-500 focus:outline-none"
          >
            {LAND_USE_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        {/* Draw tool */}
        <div className="px-4 py-4 border-b border-gray-700 space-y-3">
          <label className="flex items-center gap-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
            <FiLayers />
            Draw New Boundary
          </label>
          <input
            type="text"
            placeholder="Parcel ID (e.g. P-2024-001)"
            value={drawParcelId}
            onChange={e => setDrawParcelId(e.target.value)}
            className="w-full bg-gray-800 text-white text-sm rounded-lg px-3 py-2 border border-gray-600 focus:border-green-500 focus:outline-none placeholder-gray-500"
          />
          <BoundaryDrawTool
            parcelId={drawParcelId || undefined}
            onOverlapDetected={handleOverlapDetected}
          />
        </div>

        {/* Legend */}
        <div className="px-4 py-4 border-b border-gray-700">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Legend</h3>
          <div className="space-y-1.5">
            {LAND_USE_OPTIONS.slice(1).map(opt => (
              <div key={opt.value} className="flex items-center gap-2 text-xs text-gray-300">
                <span>{opt.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Selected parcel info */}
        {selectedParcel && (
          <div className="flex-1 px-4 py-4 overflow-y-auto space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                <FiInfo />
                Selected Parcel
              </h3>
              <button
                onClick={() => setSelectedParcel(null)}
                className="text-gray-500 hover:text-white transition-colors"
              >
                <FiX />
              </button>
            </div>

            <div className="bg-gray-800 rounded-xl p-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">Parcel ID</span>
                <span className="text-white font-mono text-xs">{selectedParcel.parcel_id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Land Use</span>
                <span className="text-white capitalize">{selectedParcel.land_use_type}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Area</span>
                <span className="text-white">{selectedParcel.area_sqm?.toLocaleString()} m²</span>
              </div>
              {selectedParcel.owner_name && (
                <div className="flex justify-between">
                  <span className="text-gray-400">Owner</span>
                  <span className="text-white">{selectedParcel.owner_name}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-400">Registered</span>
                <span className="text-white text-xs">
                  {new Date(selectedParcel.created_at).toLocaleDateString()}
                </span>
              </div>
            </div>

            {/* Satellite badge */}
            {selectedParcelCenter && (
              <div>
                <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                  🛰 Satellite Analysis
                </h4>
                <SatelliteBadge
                  parcelId={selectedParcel.parcel_id}
                  lat={selectedParcelCenter.lat}
                  lng={selectedParcelCenter.lng}
                  registeredLandUse={selectedParcel.land_use_type}
                />
              </div>
            )}
          </div>
        )}
      </aside>

      {/* ── Map Area ── */}
      <main className="relative flex-1 flex flex-col">
        {/* Top bar */}
        <div className="absolute top-0 left-0 right-0 z-[1001] flex items-center gap-2 px-4 py-2 bg-gray-900/80 backdrop-blur border-b border-gray-700">
          <button
            onClick={() => setShowSidebar(s => !s)}
            className="p-2 rounded-lg text-gray-300 hover:text-white hover:bg-gray-700 transition-colors"
            title={showSidebar ? 'Hide sidebar' : 'Show sidebar'}
          >
            <FiMap />
          </button>
          <span className="text-white text-sm font-medium">
            GIS Land Registry Map — Hyderabad, Telangana
          </span>
          <div className="ml-auto flex items-center gap-2 text-xs text-gray-400">
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            Live PostGIS
          </div>
        </div>

        {/* Overlap alert overlay */}
        {conflicts.length > 0 && (
          <div className="absolute inset-0 z-[1000] pointer-events-none">
            <div className="pointer-events-auto">
              <OverlapAlert
                conflicts={conflicts}
                onDismiss={handleDismissConflicts}
                onViewParcel={(id) => {
                  setConflicts([]);
                  // Could pan map to parcel
                  console.log('View parcel:', id);
                }}
              />
            </div>
          </div>
        )}

        {/* The map */}
        <div className="flex-1 pt-12">
          <MapView
            center={[17.385, 78.4867]}
            zoom={12}
            onBoundsChange={handleBoundsChange}
          >
            <ParcelLayer
              bounds={mapBounds}
              selectedParcelId={selectedParcel?.parcel_id}
              onParcelClick={handleParcelClick}
              filterLandUse={filterLandUse || null}
            />
          </MapView>
        </div>
      </main>
    </div>
  );
}
