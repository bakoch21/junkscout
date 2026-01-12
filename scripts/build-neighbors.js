/**
 * scripts/build-neighbors.js
 *
 * Builds a nearest-neighbor map for cities with >= 1 location.
 *
 * Outputs:
 *  - ./data/{state}/_city-centroids.json  (cache)
 *  - ./data/{state}/_neighbors.json       (slug -> [nearest slugs])
 *
 * Default inputs:
 *  - ./scripts/cities-texas.json
 *  - ./data/{state}/{city}.json  (location data produced by generate-cities.js)
 *
 * Usage:
 *  node scripts/build-neighbors.js --state=texas --k=10
 */

const fs = require("fs");
const path = require("path");

// --- Config defaults ---
const DEFAULT_CITY_LIST = "./scripts/cities-texas.json";
const OUTPUT_BASE = "./data";
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

// --- Helpers ---
function argVal(name, fallback = null) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  return hit.split("=").slice(1).join("=");
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function safeReadJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return fallback;
  }
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

async function geocodeCityToCentroid(query) {
  const url =
    `${NOMINATIM_URL}?format=json&limit=1&q=` + encodeURIComponent(query);

  const res = await fetch(url, {
    headers: {
      "User-Agent": "JunkScout/1.0 (build-neighbors)",
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Nominatim failed (${res.status}): ${body.slice(0, 220)}`);
  }

  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error(`Nominatim returned no results for: ${query}`);
  }

  // Prefer lat/lon if present
  const lat = parseFloat(data[0].lat);
  const lng = parseFloat(data[0].lon);

  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return { lat, lng };
  }

  // Fallback to bbox midpoint
  const bb = data[0].boundingbox; // [south, north, west, east] strings
  const south = parseFloat(bb[0]);
  const north = parseFloat(bb[1]);
  const west = parseFloat(bb[2]);
  const east = parseFloat(bb[3]);

  return { lat: (south + north) / 2, lng: (west + east) / 2 };
}

function normalizeSlug(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
}

function getCityDataPath(state, city) {
  return path.join(OUTPUT_BASE, state, `${city}.json`);
}

function hasLocations(state, city) {
  const p = getCityDataPath(state, city);
  const data = safeReadJson(p, null);
  if (!Array.isArray(data)) return false;
  return data.length > 0;
}

async function run() {
  const state = normalizeSlug(argVal("state", "texas"));
  const k = parseInt(argVal("k", "10"), 10);
  const cityListPath = argVal("cityList", DEFAULT_CITY_LIST);
  const delayMs = parseInt(argVal("delayMs", "1200"), 10);

  if (!fs.existsSync(cityListPath)) {
    throw new Error(`City list not found: ${cityListPath}`);
  }

  const rawList = JSON.parse(fs.readFileSync(cityListPath, "utf-8"));

  // Keep only this state, normalize city slug
  const allCities = (rawList || [])
    .filter((x) => x && normalizeSlug(x.state) === state && x.city)
    .map((x) => ({
      state,
      city: normalizeSlug(x.city),
      query: String(x.query || "").trim(),
    }))
    .filter((x) => x.query);

  if (allCities.length === 0) {
    throw new Error(`No cities found for state="${state}" in ${cityListPath}`);
  }

  // Filter to cities that have >=1 location in data/{state}/{city}.json
  const eligible = allCities.filter((c) => hasLocations(state, c.city));

  console.log(`\n🧭 build-neighbors`);
  console.log(`State: ${state}`);
  console.log(`City list: ${cityListPath}`);
  console.log(`Eligible cities (>=1 location): ${eligible.length}/${allCities.length}`);
  console.log(`k (neighbors per city): ${k}`);

  const outDir = path.join(OUTPUT_BASE, state);
  fs.mkdirSync(outDir, { recursive: true });

  const centroidCachePath = path.join(outDir, "_city-centroids.json");
  const centroidCache = safeReadJson(centroidCachePath, {});

  // Build centroid map for eligible cities
  const centroids = {};
  for (const c of eligible) {
    const key = c.city;

    if (
      centroidCache[key] &&
      Number.isFinite(centroidCache[key].lat) &&
      Number.isFinite(centroidCache[key].lng)
    ) {
      centroids[key] = centroidCache[key];
      continue;
    }

    console.log(`📍 Geocoding centroid: ${c.query}`);
    try {
      const pt = await geocodeCityToCentroid(c.query);
      centroids[key] = pt;
      centroidCache[key] = pt;

      // Write cache progressively so reruns are cheap
      fs.writeFileSync(centroidCachePath, JSON.stringify(centroidCache, null, 2));
    } catch (e) {
      console.log(`   ⚠️ Skipping centroid (failed): ${c.city} — ${e.message}`);
    }

    await sleep(delayMs); // be nice to Nominatim
  }

  // Compute neighbors
  const neighborMap = {};
  const keys = Object.keys(centroids);

  for (const city of keys) {
    const origin = centroids[city];

    const scored = keys
      .filter((other) => other !== city)
      .map((other) => ({
        city: other,
        d: haversineKm(origin, centroids[other]),
      }))
      .sort((a, b) => a.d - b.d)
      .slice(0, Math.max(0, k))
      .map((x) => x.city);

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