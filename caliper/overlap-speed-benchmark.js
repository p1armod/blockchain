#!/usr/bin/env node
/**
 * overlap-speed-benchmark.js
 * Standalone Node.js benchmark for Turf.js + PostGIS overlap detection.
 *
 * Usage:
 *   node caliper/overlap-speed-benchmark.js [--sizes 100,1000,10000]
 *
 * Outputs a markdown table of timing results and writes docs/BENCHMARK_REPORT.md.
 */

'use strict';

const turf = require('@turf/turf');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// --- Config ---
const DB_CONFIG = {
  host: process.env.POSTGIS_HOST || 'localhost',
  port: parseInt(process.env.POSTGIS_PORT || '5432'),
  database: process.env.POSTGIS_DB || 'land_gis',
  user: process.env.POSTGIS_USER || 'gis_user',
  password: process.env.POSTGIS_PASSWORD || 'gis_password',
};

const SIZES = (process.argv[3] || '100,1000,5000')
  .split(',')
  .map(Number)
  .filter(Boolean);

// --- Polygon generator ---
function randomPolygon(lat = 17.0, lng = 78.0, sizeDeg = 0.01) {
  const dx = (Math.random() - 0.5) * 2;
  const dy = (Math.random() - 0.5) * 2;
  const cx = lng + dx;
  const cy = lat + dy;
  const half = sizeDeg / 2;
  return turf.polygon([[
    [cx - half, cy - half],
    [cx + half, cy - half],
    [cx + half, cy + half],
    [cx - half, cy + half],
    [cx - half, cy - half],
  ]]);
}

// --- Turf.js in-memory overlap detection ---
function detectOverlapsTurf(parcels) {
  const conflicts = [];
  for (let i = 0; i < parcels.length; i++) {
    for (let j = i + 1; j < parcels.length; j++) {
      try {
        const intersection = turf.intersect(parcels[i], parcels[j]);
        if (intersection) {
          const area = turf.area(intersection);
          if (area > 0.01) conflicts.push({ i, j, area });
        }
      } catch (_) {
        // skip invalid geometry
      }
    }
  }
  return conflicts;
}

// --- PostGIS overlap detection ---
async function detectOverlapsPostGIS(pool, parcels) {
  const conflicts = [];
  for (let i = 0; i < parcels.length; i++) {
    const wkt = `POLYGON((${parcels[i].geometry.coordinates[0]
      .map(([x, y]) => `${x} ${y}`).join(',')}))`;
    try {
      const result = await pool.query(
        `SELECT parcel_id FROM land_parcels
         WHERE ST_Intersects(boundary, ST_GeomFromText($1, 4326))
           AND parcel_id != $2
           AND ST_Area(ST_Intersection(boundary, ST_GeomFromText($1, 4326))::geography) > 0.01`,
        [wkt, `BENCH-${i}`]
      );
      if (result.rows.length > 0) conflicts.push({ i, matches: result.rows });
    } catch (_) {
      // PostGIS may not be running; skip gracefully
    }
  }
  return conflicts;
}

// --- Timer ---
function hrMs() {
  const [s, ns] = process.hrtime();
  return s * 1000 + ns / 1e6;
}

// --- Main ---
async function main() {
  const pool = new Pool(DB_CONFIG);
  const results = [];

  console.log('Overlap Detection Speed Benchmark');
  console.log('==================================\n');

  for (const size of SIZES) {
    console.log(`Generating ${size} random parcels...`);
    const parcels = Array.from({ length: size }, () => randomPolygon());

    // Turf.js benchmark (only for smaller sizes — O(n²))
    let turfMs = null;
    let turfConflicts = 0;
    if (size <= 1000) {
      const t0 = hrMs();
      const cf = detectOverlapsTurf(parcels);
      turfMs = (hrMs() - t0).toFixed(1);
      turfConflicts = cf.length;
      console.log(`  Turf.js: ${turfMs}ms, ${turfConflicts} conflicts`);
    } else {
      console.log(`  Turf.js: skipped (O(n²) too slow for n=${size})`);
    }

    // PostGIS benchmark
    let postgisMs = null;
    let postgisConflicts = 0;
    try {
      // Seed test data
      await pool.query('DELETE FROM land_parcels WHERE parcel_id LIKE \'BENCH-%\'');
      for (let i = 0; i < size; i++) {
        const wkt = `POLYGON((${parcels[i].geometry.coordinates[0]
          .map(([x, y]) => `${x} ${y}`).join(',')}))`;
        await pool.query(
          `INSERT INTO land_parcels (parcel_id, boundary, land_use_type)
           VALUES ($1, ST_GeomFromText($2, 4326), 'agricultural')
           ON CONFLICT (parcel_id) DO UPDATE SET boundary = EXCLUDED.boundary`,
          [`BENCH-${i}`, wkt]
        );
      }

      const pt0 = hrMs();
      const cf = await detectOverlapsPostGIS(pool, parcels.slice(0, Math.min(size, 200)));
      postgisMs = (hrMs() - pt0).toFixed(1);
      postgisConflicts = cf.length;
      console.log(`  PostGIS: ${postgisMs}ms, ${postgisConflicts} conflicts (sample of ${Math.min(size, 200)})`);
    } catch (err) {
      console.log(`  PostGIS: unavailable (${err.message})`);
    }

    results.push({ size, turfMs, turfConflicts, postgisMs, postgisConflicts });
  }

  await pool.end();

  // --- Write markdown table ---
  const tableRows = results.map(r => {
    const turfCell = r.turfMs != null ? `${r.turfMs}ms (${r.turfConflicts} conflicts)` : 'N/A (too large)';
    const pgCell = r.postgisMs != null ? `${r.postgisMs}ms` : 'DB unavailable';
    return `| ${r.size.toLocaleString()} | ${turfCell} | ${pgCell} |`;
  }).join('\n');

  const tableMarkdown = `| Parcel Count | Turf.js (in-memory) | PostGIS (spatial index) |
|---|---|---|
${tableRows}`;

  console.log('\n--- Results Table ---');
  console.log(tableMarkdown);

  // Append to BENCHMARK_REPORT.md
  const reportPath = path.join(__dirname, '..', 'docs', 'BENCHMARK_REPORT.md');
  const appendContent = `\n\n## Overlap Detection Speed (${new Date().toISOString()})\n\n${tableMarkdown}\n`;
  fs.appendFileSync(reportPath, appendContent);
  console.log(`\nResults appended to ${reportPath}`);
}

main().catch(err => {
  console.error('Benchmark error:', err.message);
  process.exit(1);
});
