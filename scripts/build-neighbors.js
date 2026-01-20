/**
 * scripts/build-neighbors.js
 *
 * Builds a nearest-neighbor map for cities with >= 1 location.
 *
 * Inputs:
 *  - ./scripts/cities-texas.json           (list of city slugs)
 *  - ./data/{state}/{city}.json            (locations w/ lat,lng)
 *
 * Outputs:
 *  - ./data/{state}/_city-centroids.json   (computed from local city JSON)
 *  - ./data/{state}/_neighbors.json        (slug -> [{slug, distance_mi}, ...])
 *
 * Usage:
 *  node scripts/build-neighbors.js --state=texas --k=10
 */

const fs = require("fs");
const path = require("path");

// --- Config defaults ---
const DEFAULT_CITY_LIST = "./scripts/cities-texas.json";
const OUTPUT_BASE = "./data";

// --- Helpers ---
function argVal(name, fallback = null) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  return hit.split("=").slice(1).join("=");
}

function safeReadJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return fallback;
  }
}

function normalizeSlug(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
}

function haversineKm(a, b) {
  const R = 6371; // km
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}

function kmToMi(km) {
  return km * 0.621371;
}

function getCityDataPath(state, city) {
  return path.join(OUTPUT_BASE, state, `${city}.json`);
}

function computeCentroidFromCityLocations(state, city) {
  const p = getCityDataPath(state, city);
  const data = safeReadJson(p, null);
  if (!Array.isArray(data) || data.length === 0) return null;

  let sumLat = 0;
  let sumLng = 0;
  let n = 0;

  for (const item of data) {
    const lat = typeof item.lat === "number" ? item.lat : null;
    const lng = typeof item.lng === "number" ? item.lng : null;
    if (lat == null || lng == null) continue;

    sumLat += lat;
    sumLng += lng;
    n++;
  }

  if (n === 0) return null;

  return { lat: sumLat / n, lng: sumLng / n, n_points: n };
}

async function run() {
  const state = normalizeSlug(argVal("state", "texas"));
  const k = parseInt(argVal("k", "10"), 10);
  const cityListPath = argVal("cityList", DEFAULT_CITY_LIST);

  if (!fs.existsSync(cityListPath)) {
    throw new Error(`City list not found: ${cityListPath}`);
  }

  const rawList = JSON.parse(fs.readFileSync(cityListPath, "utf-8"));

  // Keep only this state, normalize city slug
  const allCities = (rawList || [])
    .filter((x) => x && normalizeSlug(x.state) === state && x.city)
    .map((x) => normalizeSlug(x.city))
    .filter(Boolean);

  if (allCities.length === 0) {
    throw new Error(`No cities found for state="${state}" in ${cityListPath}`);
  }

  console.log(`\n🧭 build-neighbors (local centroids, no OSM)`);
  console.log(`State: ${state}`);
  console.log(`City list: ${cityListPath}`);
  console.log(`k (neighbors per city): ${k}`);

  const outDir = path.join(OUTPUT_BASE, state);
  fs.mkdirSync(outDir, { recursive: true });

  // Build centroid map from local files
  const centroids = {};
  let eligible = 0;
  let missing = 0;

  for (const city of allCities) {
    const c = computeCentroidFromCityLocations(state, city);
    if (!c) {
      missing++;
      continue;
    }
    centroids[city] = { lat: c.lat, lng: c.lng, n_points: c.n_points };
    eligible++;
  }

  console.log(`Eligible cities (>=1 location w/ coords): ${eligible}/${allCities.length}`);
  if (eligible === 0) {
    throw new Error(`No eligible cities found. Check that ${OUTPUT_BASE}/${state}/{city}.json exists and has lat/lng.`);
  }
  if (missing > 0) {
    console.log(`ℹ️ Skipped cities missing data/coords: ${missing}`);
  }

  // Write centroid cache
  const centroidCachePath = path.join(outDir, "_city-centroids.json");
  fs.writeFileSync(centroidCachePath, JSON.stringify(centroids, null, 2));

  // Compute neighbors
  const neighborMap = {};
  const keys = Object.keys(centroids);

  for (const city of keys) {
    const origin = centroids[city];

    const scored = keys
      .filter((other) => other !== city)
      .map((other) => {
        const km = haversineKm(origin, centroids[other]);
        return {
          slug: other,
          distance_mi: Math.round(kmToMi(km) * 10) / 10, // 0.1 mi precision
        };
      })
      .sort((a, b) => a.distance_mi - b.distance_mi)
      .slice(0, Math.max(0, k));

    neighborMap[city] = scored;
  }

  const neighborsPath = path.join(outDir, "_neighbors.json");
  fs.writeFileSync(neighborsPath, JSON.stringify(neighborMap, null, 2));

  console.log(`\n✅ Wrote neighbors → ${neighborsPath}`);
  console.log(`✅ Wrote centroid cache → ${centroidCachePath}`);
}

run().catch((e) => {
  console.error("\n❌ build-neighbors failed");
  console.error(e && e.message ? e.message : e);
  process.exit(1);
});
