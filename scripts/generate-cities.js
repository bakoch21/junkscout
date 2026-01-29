/**
 * scripts/generate-cities.js
 *
 * For a given state (default: texas), builds /data/<state>/<city>.json files.
 *
 * Modes:
 * - For TEXAS: can build from ./data/facilities (TCEQ etc.) + optional OSM seed merge
 * - For OTHER STATES (e.g., california): default to OSM-only seed merge (prevents mixing TX facilities)
 *
 * Usage:
 *   node scripts/generate-cities.js
 *   node scripts/generate-cities.js texas
 *   node scripts/generate-cities.js california
 *
 * Env:
 *   SKIP_OSM=1   -> skip Overpass/Nominatim entirely
 */

const fs = require("fs");
const path = require("path");

const OUTPUT_BASE = "./data";
const FACILITIES_DIR = "./data/facilities";

const OVERPASS_URL = "https://overpass.kumi.systems/api/interpreter";
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

const STATE = (process.argv[2] || "texas").toLowerCase();
const CITY_LIST_PATH = `./scripts/cities-${STATE}.json`;

const SKIP_OSM = String(process.env.SKIP_OSM || "").trim() === "1";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function cleanStr(s) {
  return (s || "").toString().trim();
}

function isPlainObject(x) {
  return !!x && typeof x === "object" && !Array.isArray(x);
}

function slugifyCity(city) {
  return cleanStr(city)
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function hasRealName(name) {
  const n = cleanStr(name).toLowerCase();
  if (!n) return false;
  if (n === "unnamed site") return false;
  if (n === "unnamed") return false;
  if (n === "recycle facility") return false;
  if (n === "recycling") return false;
  if (n === "landfill") return false;
  if (n === "transfer station") return false;
  return true;
}

function hasUsefulAddress(address) {
  const a = cleanStr(address);
  if (!a) return false;
  return /\d/.test(a);
}

function OVERPASS_QUERY_BBOX(south, west, north, east) {
  return `
[out:json][timeout:25];
(
  nwr["amenity"="waste_transfer_station"](${south},${west},${north},${east});
  nwr["amenity"="recycling"](${south},${west},${north},${east});
  nwr["landuse"="landfill"](${south},${west},${north},${east});
);
out center tags;
`;
}

function normalizeType(tags = {}) {
  if (tags.landuse === "landfill") return "landfill";
  if (tags.amenity === "waste_transfer_station") return "transfer_station";
  if (tags.amenity === "recycling") return "recycling";
  return "other";
}

function pickLatLng(el) {
  if (typeof el.lat === "number" && typeof el.lon === "number") {
    return { lat: el.lat, lng: el.lon };
  }
  if (el.center && typeof el.center.lat === "number" && typeof el.center.lon === "number") {
    return { lat: el.center.lat, lng: el.center.lon };
  }
  return { lat: null, lng: null };
}

async function geocodeToBbox(query) {
  const url = `${NOMINATIM_URL}?format=json&limit=1&q=` + encodeURIComponent(query);

  const res = await fetch(url, {
    headers: {
      "User-Agent": "JunkScout/1.0 (local script)",
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Nominatim failed (${res.status}): ${body.slice(0, 300)}`);
  }

  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error(`Nominatim returned no results for: ${query}`);
  }

  const bb = data[0].boundingbox; // [south, north, west, east]
  return {
    south: parseFloat(bb[0]),
    north: parseFloat(bb[1]),
    west: parseFloat(bb[2]),
    east: parseFloat(bb[3]),
  };
}

async function fetchOverpassByBbox(bbox) {
  const query = OVERPASS_QUERY_BBOX(bbox.south, bbox.west, bbox.north, bbox.east);

  const res = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      "User-Agent": "JunkScout/1.0 (local script)",
    },
    body: `data=${encodeURIComponent(query)}`,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Overpass failed (${res.status}): ${body.slice(0, 300)}`);
  }

  return res.json();
}

async function fetchOverpassWithRetry(bbox, tries = 4) {
  let lastErr;
  for (let i = 1; i <= tries; i++) {
    try {
      return await fetchOverpassByBbox(bbox);
    } catch (err) {
      lastErr = err;
      const msg = err?.message || String(err);
      const retryable =
        msg.includes("504") ||
        msg.includes("429") ||
        msg.toLowerCase().includes("timeout");

      if (!retryable || i === tries) throw err;

      const wait = 1500 * i;
      console.log(`   ⚠️ Overpass hiccup (${i}/${tries}). Waiting ${wait}ms then retrying...`);
      await sleep(wait);
    }
  }
  throw lastErr;
}

function safeReadJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return fallback;
  }
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeCityFile(state, citySlug, records) {
  const outDir = path.join(OUTPUT_BASE, state);
  const outFile = path.join(outDir, `${citySlug}.json`);
  ensureDir(outDir);
  fs.writeFileSync(outFile, JSON.stringify(records, null, 2));
  return outFile;
}

function uniqueKey(item) {
  if (item.facility_id) return `fid:${item.facility_id}`;
  const n = cleanStr(item.name).toLowerCase();
  if (item.lat && item.lng) return `geo:${n}:${item.lat.toFixed(6)}:${item.lng.toFixed(6)}`;
  const a = cleanStr(item.address).toLowerCase();
  return `na:${n}:${a}`;
}

function mergeDedupe(existing = [], incoming = []) {
  const map = new Map();
  for (const it of existing) {
    if (!it) continue;
    map.set(uniqueKey(it), it);
  }
  for (const it of incoming) {
    if (!it) continue;
    const k = uniqueKey(it);
    const prev = map.get(k);
    if (!prev) {
      map.set(k, it);
      continue;
    }
    map.set(k, {
      ...prev,
      ...Object.fromEntries(
        Object.entries(it).filter(([_, v]) => {
          if (v === null || v === undefined) return false;
          if (typeof v === "string" && cleanStr(v) === "") return false;
          return true;
        })
      ),
    });
  }
  return Array.from(map.values());
}

function filterCityResults(results) {
  return (results || [])
    .filter((r) => r && r.lat && r.lng)
    .filter((r) => {
      const okName = hasRealName(r.name);
      const okAddr = hasUsefulAddress(r.address);
      const okWeb = !!r.website;
      const okSrc = !!r.osm_url || !!r.source_url;
      return okName || okAddr || okWeb || okSrc;
    });
}

/**
 * TEXAS-only: build cityMap from ./data/facilities
 * (This is what you originally wrote for TCEQ.)
 */
function buildCityMapFromFacilities_TexasOnly() {
  if (!fs.existsSync(FACILITIES_DIR)) return new Map();

  const files = fs.readdirSync(FACILITIES_DIR).filter((f) => f.endsWith(".json"));

  const cityMap = new Map(); // citySlug -> { cityName, items[] }

  for (const file of files) {
    // Avoid reading the huge index.json (it is an array of many facilities)
    if (file.toLowerCase() === "index.json") continue;

    const full = path.join(FACILITIES_DIR, file);
    const raw = safeReadJson(full, null);
    if (!raw || !isPlainObject(raw)) continue;

    // only TX here
    const stateGuess = cleanStr(raw.state || "TX").toUpperCase();
    if (stateGuess !== "TX") continue;

    const cityName = cleanStr(raw.city);
    if (!cityName) continue;

    const citySlug = slugifyCity(cityName);
    if (!citySlug) continue;

    if (!cityMap.has(citySlug)) cityMap.set(citySlug, { cityName, items: [] });

    cityMap.get(citySlug).items.push({
      name: raw.name || "Facility",
      type: raw.type || "other",
      address: raw.address || "",
      lat: raw.lat ?? null,
      lng: raw.lng ?? null,
      website: raw.website || null,
      facility_id: raw.id || raw.facility_id || null,
      source: raw.source || "tceq",
      source_url: raw.source_url || null,
      osm_url: raw.osm_url || null,
    });
  }

  return cityMap;
}

async function fetchOsmForSeedCities() {
  if (!fs.existsSync(CITY_LIST_PATH)) {
    console.log(`ℹ️ Seed city list not found at ${CITY_LIST_PATH}. Skipping OSM.`);
    return new Map();
  }

  const cities = JSON.parse(fs.readFileSync(CITY_LIST_PATH, "utf-8"));
  const resultsByCitySlug = new Map();

  for (const entry of cities) {
    const { state, city, query } = entry;
    if ((state || "").toLowerCase() !== STATE) continue;

    console.log(`\n📍 (OSM) Fetching ${query}...`);

    try {
      const bbox = await geocodeToBbox(query);
      const json = await fetchOverpassWithRetry(bbox);
      const elements = Array.isArray(json.elements) ? json.elements : [];

      const items = elements
        .map((el) => {
          const { lat, lng } = pickLatLng(el);
          const website =
            el.tags?.website || el.tags?.["contact:website"] || el.tags?.url || null;

          const addressParts = [
            el.tags?.["addr:housenumber"],
            el.tags?.["addr:street"],
            el.tags?.["addr:city"],
            el.tags?.["addr:state"],
            el.tags?.["addr:postcode"],
          ].filter(Boolean);

          const address = addressParts.join(" ");
          const rawName = el.tags?.name || "";

          return {
            name: cleanStr(rawName),
            type: normalizeType(el.tags),
            address,
            lat,
            lng,
            website,
            osm_url: `https://www.openstreetmap.org/${el.type}/${el.id}`,
            source: "osm",
          };
        })
        .filter((r) => r.lat && r.lng)
        .filter((r) => {
          const okName = hasRealName(r.name);
          const okAddr = hasUsefulAddress(r.address);
          const okWeb = !!r.website;
          return okName || okAddr || okWeb;
        });

      const citySlug = cleanStr(city);
      resultsByCitySlug.set(citySlug, items);

      console.log(`✅ (OSM) Found ${items.length} for ${citySlug}`);
    } catch (err) {
      console.error(`❌ (OSM) Failed for ${city}`);
      console.error(err && err.message ? err.message : err);
    }

    await sleep(2500);
  }

  return resultsByCitySlug;
}

async function run() {
  console.log(`\n🏗️ Generating city JSON for state: ${STATE}`);

  // 1) Facilities-based map only for Texas (avoids mixing TX into CA)
  let cityMap = new Map();
  if (STATE === "texas") {
    console.log("🧱 Building from facilities dataset (Texas mode)...");
    cityMap = buildCityMapFromFacilities_TexasOnly();
    console.log(`✅ Found ${cityMap.size} Texas cities in facilities dataset.`);
  } else {
    console.log("🧱 Non-Texas mode: OSM-only for now (prevents cross-state mixing).");
  }

  // 2) Optional OSM
  let osmMap = new Map();
  if (SKIP_OSM) {
    console.log("\n⏭️ SKIP_OSM=1 so we are skipping OSM fetch (faster).");
  } else {
    console.log("\n🌍 Fetching OSM for seed cities (optional)...");
    osmMap = await fetchOsmForSeedCities();
  }

  // 3) Write city files
  let totalWritten = 0;

  // If we have facility-based cities (Texas), write them + merge OSM
  for (const [citySlug, payload] of cityMap.entries()) {
    const outFile = path.join(OUTPUT_BASE, STATE, `${citySlug}.json`);
    const existing = safeReadJson(outFile, []);
    const fromFacilities = payload.items || [];
    const fromOsm = osmMap.get(citySlug) || [];

    const merged = mergeDedupe(existing, fromFacilities);
    const merged2 = mergeDedupe(merged, fromOsm);
    const finalResults = filterCityResults(merged2);

    const writtenPath = writeCityFile(STATE, citySlug, finalResults);
    totalWritten++;

    console.log(
      `✅ Wrote ${finalResults.length} locations → ${writtenPath} (fac:${fromFacilities.length}, osm:${fromOsm.length})`
    );
  }

  // If non-Texas, we ONLY write cities that exist in OSM seed list
  if (STATE !== "texas") {
    for (const [citySlug, items] of osmMap.entries()) {
      const outFile = path.join(OUTPUT_BASE, STATE, `${citySlug}.json`);
      const existing = safeReadJson(outFile, []);
      const merged = mergeDedupe(existing, items || []);
      const finalResults = filterCityResults(merged);

      const writtenPath = writeCityFile(STATE, citySlug, finalResults);
      totalWritten++;

      console.log(`✅ Wrote ${finalResults.length} locations → ${writtenPath} (osm:${(items || []).length})`);
    }
  }

  console.log(`\n🎉 Done. Wrote/updated ${totalWritten} ${STATE} city JSON files.`);
}

run().catch((e) => {
  console.error("Fatal error:");
  console.error(e);
  process.exit(1);
});
