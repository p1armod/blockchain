'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { FiEdit2, FiTrash2, FiCheck, FiAlertTriangle } from 'react-icons/fi';
import { gisApi } from '@/lib/fabric-api';

interface DrawnPolygon {
  geoJSON: GeoJSON.Feature;
  areaSqm: number;
  hasOverlap: boolean | null;
  conflictingParcels?: string[];
}

interface BoundaryDrawToolProps {
  onPolygonDrawn?: (polygon: DrawnPolygon) => void;
  onOverlapDetected?: (conflicts: string[]) => void;
  parcelId?: string;
}

/**
 * BoundaryDrawTool — draws polygons on the map, shows area, checks overlap.
 * Mounts a Leaflet.draw toolbar on the existing map instance.
 */
export default function BoundaryDrawTool({ onPolygonDrawn, onOverlapDetected, parcelId }: BoundaryDrawToolProps) {
  const [drawnPolygon, setDrawnPolygon] = useState<DrawnPolygon | null>(null);
  const [checking, setChecking] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const drawnLayerRef = useRef<unknown>(null);
  const drawControlRef = useRef<unknown>(null);

  const clearDrawing = useCallback(() => {
    setDrawnPolygon(null);
    setEditMode(false);
    // Remove layers via global map if available
    const mapEl = document.getElementById('gis-map');
    if (!mapEl) return;
  }, []);

  const checkOverlap = useCallback(async (feature: GeoJSON.Feature) => {
    if (!parcelId) return;
    setChecking(true);
    try {
      const result = await gisApi.checkOverlap(parcelId, feature.geometry);
      const hasOverlap = result.hasOverlap ?? false;
      const conflicts: string[] = result.conflicts?.map((c: { parcelId: string }) => c.parcelId) ?? [];

      setDrawnPolygon(prev => prev ? { ...prev, hasOverlap, conflictingParcels: conflicts } : null);
      if (hasOverlap) onOverlapDetected?.(conflicts);
    } catch (err) {
      console.error('Overlap check failed:', err);
    } finally {
      setChecking(false);
    }
  }, [parcelId, onOverlapDetected]);

  useEffect(() => {
    let L: typeof import('leaflet');
    let map: import('leaflet').Map;

    const init = async () => {
      L = await import('leaflet');
      // Wait for the map div to be rendered
      const mapContainer = document.getElementById('gis-map');
      if (!mapContainer) return;

      // Access the underlying Leaflet map instance
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const leafletMap = (mapContainer as any)._leaflet_map as import('leaflet').Map | undefined;
      if (!leafletMap) return;
      map = leafletMap;

      // Dynamically load leaflet-draw
      await import('leaflet-draw' as string).catch(() => {
        console.warn('leaflet-draw not installed — install it via: npm install leaflet-draw');
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const FeatureGroup = (L as any).FeatureGroup;
      const drawnItems = new FeatureGroup();
      map.addLayer(drawnItems);
      drawnLayerRef.current = drawnItems;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const DrawControl = (L.Control as any).Draw;
      if (!DrawControl) return;

      const drawControl = new DrawControl({
        position: 'topright',
        draw: {
          polygon: { allowIntersection: false, showArea: true, metric: true },
          polyline: false, rectangle: true, circle: false, marker: false, circlemarker: false,
        },
        edit: { featureGroup: drawnItems },
      });
      map.addControl(drawControl);
      drawControlRef.current = drawControl;

      map.on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (L as any).Draw.Event.CREATED,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (e: any) => {
          drawnItems.clearLayers();
          drawnItems.addLayer(e.layer);

          const geojson: GeoJSON.Feature = e.layer.toGeoJSON();
          const turf = await import('@turf/turf');
          const areaSqm = Math.round(turf.area(geojson));

          const newPolygon: DrawnPolygon = { geoJSON: geojson, areaSqm, hasOverlap: null };
          setDrawnPolygon(newPolygon);
          onPolygonDrawn?.(newPolygon);

          // Auto-check overlap
          await checkOverlap(geojson);
        }
      );
    };

    init();
    return () => {
      // Cleanup handled by parent MapView unmount
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!drawnPolygon) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-white/90 backdrop-blur rounded-lg shadow text-sm text-gray-500">
        <FiEdit2 className="text-blue-500" />
        <span>Use the draw tool on the map to define a parcel boundary</span>
      </div>
    );
  }

  return (
    <div className="bg-white/95 backdrop-blur rounded-xl shadow-lg p-4 text-sm space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-800 flex items-center gap-2">
          <FiEdit2 className="text-blue-500" />
          Drawn Boundary
        </h3>
        <button onClick={clearDrawing} className="text-red-400 hover:text-red-600 transition-colors">
          <FiTrash2 />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="bg-gray-50 rounded-lg p-2">
          <div className="text-gray-500">Area</div>
          <div className="font-bold text-gray-800">{drawnPolygon.areaSqm.toLocaleString()} m²</div>
        </div>
        <div className="bg-gray-50 rounded-lg p-2">
          <div className="text-gray-500">Parcel ID</div>
          <div className="font-bold text-gray-800 truncate">{parcelId || '—'}</div>
        </div>
      </div>

      {checking && (
        <div className="flex items-center gap-2 text-blue-600 text-xs animate-pulse">
          <div className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          Checking for boundary conflicts…
        </div>
      )}

      {!checking && drawnPolygon.hasOverlap === false && (
        <div className="flex items-center gap-2 text-green-600 text-xs font-medium">
          <FiCheck className="text-green-500" />
          No boundary conflicts detected
        </div>
      )}

      {!checking && drawnPolygon.hasOverlap === true && (
        <div className="flex items-center gap-2 text-red-600 text-xs font-medium">
          <FiAlertTriangle className="text-red-500" />
          Overlaps with {drawnPolygon.conflictingParcels?.length ?? 0} parcel(s)
        </div>
      )}
    </div>
  );
}
