'use client';

import { useEffect, useRef, useState } from 'react';
import { gisApi } from '@/lib/fabric-api';

interface Parcel {
  parcel_id: string;
  boundary: object;
  land_use_type: string;
  area_sqm: number;
  created_at: string;
  owner_name?: string;
}

interface ParcelLayerProps {
  bounds: { minX: number; minY: number; maxX: number; maxY: number } | null;
  selectedParcelId?: string | null;
  onParcelClick?: (parcel: Parcel) => void;
  filterLandUse?: string | null;
}

/** Land use type → Leaflet polygon color */
const LAND_USE_COLORS: Record<string, string> = {
  agricultural: '#86efac',   // green-300
  residential:  '#93c5fd',   // blue-300
  commercial:   '#fcd34d',   // yellow-300
  forest:       '#4ade80',   // green-400
  water:        '#60a5fa',   // blue-400
  industrial:   '#f97316',   // orange-500
  unknown:      '#d1d5db',   // gray-300
};

/**
 * ParcelLayer — fetches parcels from PostGIS via GIS API and renders them as
 * colored Leaflet polygons on the existing map instance.
 */
export default function ParcelLayer({ bounds, selectedParcelId, onParcelClick, filterLandUse }: ParcelLayerProps) {
  const [parcels, setParcels] = useState<Parcel[]>([]);
  const [loading, setLoading] = useState(false);
  const layerGroupRef = useRef<import('leaflet').LayerGroup | null>(null);
  const mapRef = useRef<import('leaflet').Map | null>(null);

  // Load parcels when bounds change
  useEffect(() => {
    if (!bounds) return;
    const controller = new AbortController();

    const load = async () => {
      setLoading(true);
      try {
        const result = await gisApi.getParcelsInArea(bounds.minX, bounds.minY, bounds.maxX, bounds.maxY);
        if (!controller.signal.aborted) {
          const data: Parcel[] = result.parcels ?? result ?? [];
          setParcels(filterLandUse ? data.filter(p => p.land_use_type === filterLandUse) : data);
        }
      } catch (err) {
        if (!controller.signal.aborted) console.error('Failed to load parcels:', err);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    load();
    return () => controller.abort();
  }, [bounds, filterLandUse]);

  // Render polygons on map
  useEffect(() => {
    const mapEl = document.getElementById('gis-map');
    if (!mapEl) return;

    import('leaflet').then((L) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const leafletMap = (mapEl as any)._leaflet_map as import('leaflet').Map | undefined;
      if (!leafletMap) return;
      mapRef.current = leafletMap;

      // Clear previous layer
      if (layerGroupRef.current) {
        layerGroupRef.current.clearLayers();
      } else {
        layerGroupRef.current = L.layerGroup().addTo(leafletMap);
      }

      parcels.forEach((parcel) => {
        try {
          const color = LAND_USE_COLORS[parcel.land_use_type] ?? LAND_USE_COLORS.unknown;
          const isSelected = parcel.parcel_id === selectedParcelId;

          // Parse boundary — PostGIS returns GeoJSON
          const geometry = typeof parcel.boundary === 'string'
            ? JSON.parse(parcel.boundary)
            : parcel.boundary;

          if (!geometry?.coordinates) return;

          const coords: [number, number][][] = geometry.coordinates;
          // Leaflet uses [lat, lng] but GeoJSON is [lng, lat]
          const latLngs = coords.map(ring =>
            ring.map(([lng, lat]) => L.latLng(lat, lng))
          );

          const polygon = L.polygon(latLngs, {
            color: isSelected ? '#ef4444' : '#1e40af',
            fillColor: color,
            fillOpacity: isSelected ? 0.6 : 0.4,
            weight: isSelected ? 3 : 1.5,
            dashArray: isSelected ? '' : undefined,
          });

          polygon.bindTooltip(
            `<div class="text-xs font-medium">${parcel.parcel_id}<br/>${parcel.land_use_type} · ${parcel.area_sqm?.toFixed(0)} m²</div>`,
            { sticky: true }
          );

          polygon.on('click', () => onParcelClick?.(parcel));
          layerGroupRef.current!.addLayer(polygon);
        } catch {
          // Skip invalid geometry
        }
      });
    });
  }, [parcels, selectedParcelId, onParcelClick]);

  if (loading) {
    return (
      <div className="absolute bottom-4 left-4 z-[900] flex items-center gap-2 bg-white/90 backdrop-blur rounded-lg px-3 py-2 text-xs text-gray-600 shadow">
        <div className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
        Loading parcels…
      </div>
    );
  }

  if (parcels.length === 0 && bounds) {
    return (
      <div className="absolute bottom-4 left-4 z-[900] bg-white/90 backdrop-blur rounded-lg px-3 py-2 text-xs text-gray-500 shadow">
        No parcels in this area
      </div>
    );
  }

  return (
    <div className="absolute bottom-4 left-4 z-[900] bg-white/90 backdrop-blur rounded-lg px-3 py-2 text-xs text-gray-700 shadow">
      {parcels.length} parcel{parcels.length !== 1 ? 's' : ''} visible
    </div>
  );
}
