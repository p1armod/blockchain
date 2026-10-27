'use client';

import { useEffect, useRef, useState } from 'react';
import type { Map as LeafletMap, LatLngBoundsExpression } from 'leaflet';

interface MapViewProps {
  onBoundsChange?: (bounds: { minX: number; minY: number; maxX: number; maxY: number }) => void;
  children?: React.ReactNode;
  center?: [number, number];
  zoom?: number;
}

/**
 * MapView — Leaflet map base component (always loaded with ssr:false).
 * Renders OpenStreetMap tiles and exposes bounds on move for parcel loading.
 */
export default function MapView({ onBoundsChange, children, center = [17.385, 78.4867], zoom = 12 }: MapViewProps) {
  const mapRef = useRef<LeafletMap | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || !containerRef.current || mapRef.current) return;

    // Dynamic import to ensure Leaflet only runs client-side
    import('leaflet').then((L) => {
      // Fix default marker icons (Leaflet webpack issue)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      const map = L.map(containerRef.current!, { center, zoom });
      mapRef.current = map;
      (containerRef.current as any)._leaflet_map = map;

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map);

      const emitBounds = () => {
        const b = map.getBounds();
        onBoundsChange?.({
          minX: b.getWest(),
          minY: b.getSouth(),
          maxX: b.getEast(),
          maxY: b.getNorth(),
        });
      };

      map.on('moveend', emitBounds);
      map.on('zoomend', emitBounds);
      // Emit initial bounds after map is ready
      map.whenReady(emitBounds);
    });

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  return (
    <div className="relative w-full h-full">
      {/* Leaflet CSS */}
      <link
        rel="stylesheet"
        href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
        crossOrigin=""
      />
      <div ref={containerRef} className="w-full h-full rounded-xl overflow-hidden" id="gis-map" />
      {/* Portal target for child components that need map access */}
      <div id="map-children-portal" className="hidden">{children}</div>
    </div>
  );
}
