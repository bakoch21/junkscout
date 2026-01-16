/**
 * generate-cities.js
 *
 * Builds /data/texas/<city>.json files from imported facilities (TCEQ, etc.)
 * by grouping facilities by their city. Optionally ALSO runs OSM fetch for
 * seed cities and merges results.
 */

const fs = require("fs");
const path = require("path");

const CITY_LIST_PATH = "./scripts/cities-texas.json"; // optional seed list for OSM
const OUTPUT_BASE = "./data";
const FACILITIES_DIR = "./data/facilities";

// Overpass endpoint (more reliable than overpass-api.de for big queries)
const OVERPASS_URL = "https://overpass.kumi.systems/api/interpreter";
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

// Set SKIP_OSM=1 to skip Overpass/Nominatim entirely (faster builds)
// Example: SKIP_OSM=1 node scripts/generate-cities.js
const SKIP_OSM = process.env.SKIP_OSM === "1";

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

  // Optional: filter generic junk names (toggle if you want)
  if (n === "recycle facility") return false;
  if (n === "recycling") return false;
  if (n === "landfill") return false;
  if (n === "transfer station") return false;

  return true;
}

function hasUsefulAddress(address) {
  const a = cleanStr(address);
  if (!a) return false;
  // Most “real” addresses contain a street number
  return /\d/.test(a);
}

// Build Overpass query using bbox: south, west, north, east
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
  // node has el.lat/el.lon, way/relation has el.center.lat/el.center.lon when using `out center`
  if (typeof el.lat === "number" && typeof el.lon === "number") {
    return { lat: el.lat, lng: el.lon };
  }
  if (
    el.center &&
    typeof el.center.lat === "number" &&
    typeof el.center.lon === "number"
  ) {
    return { lat: el.center.lat, lng: el.center.lon };
  }
  return { lat: null, lng: null };
}

async function geocodeToBbox(query) {
  const url =
    `${NOMINATIM_URL}?format=json&limit=1&q=` + encodeURIComponent(query);

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

  // boundingbox is [south, north, west, east] as strings
  const bb = data[0].boundingbox;
  const south = parseFloat(bb[0]);
  const north = parseFloat(bb[1]);
  const west = parseFloat(bb[2]);
  const east = parseFloat(bb[3]);

  return { south, west, north, east };
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

// Retry wrapper for Overpass (504/429/timeouts happen a lot on big cities)
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
      console.log(
        `   ⚠️ Overpass hiccup (${i}/${tries}). Waiting ${wait}ms then retrying...`
      );
      await sleep(wait);
    }
  }

  throw lastErr;
}

function safeReadJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch (e) {
    return fallback;
  }
}

function listJsonFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith(".json"))
    .map((f) => path.join(dir, f));
}

function coerceNumber(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function normalizeFacilityRecord(raw) {
  // HARDENING: if raw is null/non-object, skip
  if (!isPlainObject(raw)) return null;

  const name =
    cleanStr(raw.name) ||
    cleanStr(raw.facility_name) ||
    cleanStr(raw.site_name) ||
    cleanStr(raw.permittee) ||
    "Facility";

  const city =
    cleanStr(raw.city) ||
    cleanStr(raw.site_city) ||
    cleanStr(raw.address_city) ||
    cleanStr(raw.mailing_city) ||
    "";

  const state =
    cleanStr(raw.state) ||
    cleanStr(raw.site_state) ||
    cleanStr(raw.address_state) ||
    "TX";

  const zip =
    cleanStr(raw.zip) ||
    cleanStr(raw.zipcode) ||
    cleanStr(raw.postcode) ||
    cleanStr(raw.site_zip) ||
    "";

  const address =
    cleanStr(raw.address) ||
    cleanStr(raw.site_address) ||
    cleanStr(raw.street_address) ||
    cleanStr(raw.location_address) ||
    cleanStr(raw.mailing_address) ||
    "";

  const lat = coerceNumber(raw.lat ?? raw.latitude);
  const lng = coerceNumber(raw.lng ?? raw.lon ?? raw.longitude);

  const website = raw.website || raw.url || raw.contact_website || null;

  const facility_id =
    cleanStr(raw.facility_id) ||
    cleanStr(raw.id) ||
    cleanStr(raw.permit_number) ||
    cleanStr(raw.registration_number) ||
    null;

  const type =
    cleanStr(raw.type) ||
    cleanStr(raw.facility_type) ||
    cleanStr(raw.site_type) ||
    "facility";

  const source = cleanStr(raw.source) || "tceq";
  const source_url = raw.source_url || raw.sourceUrl || raw.tceq_url || null;

  return {
    name,
    city,
    state,
    zip,
    address,
    lat,
    lng,
    website,
    facility_id,
    type,
    source,
    source_url,
  };
}

function uniqueKey(item) {
  if (item.facility_id) return `fid:${item.facility_id}`;

  const n = cleanStr(item.name).toLowerCase();
  if (item.lat && item.lng) {
    return `geo:${n}:${item.lat.toFixed(6)}:${item.lng.toFixed(6)}`;
  }

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
      const okSrc = !!r.source_url; // allow source-linked facilities
      return okName || okAddr || okWeb || okSrc;
    });
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

function extractRecordsFromJsonBlob(blob) {
  // blob could be:
  // - array of records
  // - object { items: [...] } / { data: [...] } / { facilities: [...] }
  // - object map of records
  if (Array.isArray(blob)) return blob;

  if (isPlainObject(blob)) {
    for (const key of ["items", "data", "facilities", "rows", "results"]) {
      if (Array.isArray(blob[key])) return blob[key];
    }
    // object map fallback
    const vals = Object.values(blob);
    if (vals.some((v) => isPlainObject(v))) return vals;
    return [blob];
  }

  return [];
}

function buildCityMapFromFacilities() {
  const files = listJsonFiles(FACILITIES_DIR);

  let allRaw = [];
  let skippedNullish = 0;

  for (const file of files) {
    const blob = safeReadJson(file, null);
    if (blob === null || blob === undefined) continue;

    const records = extractRecordsFromJsonBlob(blob);
    for (const rec of records) {
      if (rec === null || rec === undefined) {
        skippedNullish++;
        continue;
      }
      allRaw.push(rec);
    }
  }

  const cityMap = new Map(); // citySlug -> { cityName, items[] }
  let normalizedSkipped = 0;

  for (const raw of allRaw) {
    const f = normalizeFacilityRecord(raw);
    if (!f) {
      normalizedSkipped++;
      continue;
    }

    // Only keep TX (best-effort)
    const stGuess = cleanStr(f.state).toUpperCase() || "TX";
    if (stGuess !== "TX") continue;

    const cityName = cleanStr(f.city);
    if (!cityName) continue;

    const citySlug = slugifyCity(cityName);
    if (!citySlug) continue;

    if (!cityMap.has(citySlug)) {
      cityMap.set(citySlug, { cityName, items: [] });
    }

    const fullAddress = [f.address, f.city, f.state, f.zip]
      .filter(Boolean)
      .join(", ");

    cityMap.get(citySlug).items.push({
      name: f.name,
      type: f.type || "facility",
      address: fullAddress,
      lat: f.lat,
      lng: f.lng,
      website: f.website,
      facility_id: f.facility_id,
      source: f.source || "tceq",
      source_url: f.source_url || null,
    });
  }

  if (skippedNullish || normalizedSkipped) {
    console.log(
      `ℹ️ Facilities parse: skipped ${skippedNullish} nullish rows, ${normalizedSkipped} non-object rows.`
    );
  }

  return cityMap;
}

async function fetchOsmForSeedCities() {
  if (!fs.existsSync(CITY_LIST_PATH)) {
    console.log(`ℹ️ Seed city list not found at ${CITY_LIST_PATH}. Skipping OSM.`);
    return new Map();
  }

  const cities = JSON.parse(fs.readFileSync(CITY_LIST_PATH, "utf-8"));
  const resultsByCitySlug = new Map(); // citySlug -> items[]

  for (const entry of cities) {
    const { state, city, query } = entry;
    if (state !== "texas") continue;

    console.log(`\n📍 (OSM) Fetching ${query}...`);

    try {
      const bbox = await geocodeToBbox(query);
      const json = await fetchOverpassWithRetry(bbox);

      const elements = Array.isArray(json.elements) ? json.elements : [];

      const items = elements
        .map((el) => {
          const { lat, lng } = pickLatLng(el);

          const website =
            el.tags?.website ||
            el.tags?.["contact:website"] ||
            el.tags?.["url"] ||
            null;

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
  console.log("\n🏗️ Building city JSON from facilities (TCEQ, etc.)...");
  const cityMap = buildCityMapFromFacilities();
  console.log(`✅ Found ${cityMap.size} Texas cities in facilities dataset.`);

  let osmMap = new Map();
  if (!SKIP_OSM) {
    console.log("\n🌍 Also fetching OSM for seed cities (optional)...");
    osmMap = await fetchOsmForSeedCities();
  } else {
    console.log("\n⏭️ SKIP_OSM=1 so we are skipping OSM fetch (faster).");
  }

  let totalWritten = 0;

  for (const [citySlug, payload] of cityMap.entries()) {
    const state = "texas";
    const outDir = path.join(OUTPUT_BASE, state);
    const outFile = path.join(outDir, `${citySlug}.json`);

    const existing = safeReadJson(outFile, []);
    const fromFacilities = payload.items || [];
    const fromOsm = osmMap.get(citySlug) || [];

    const merged = mergeDedupe(existing, fromFacilities);
    const merged2 = mergeDedupe(merged, fromOsm);

    const finalResults = filterCityResults(merged2);

    const writtenPath = writeCityFile(state, citySlug, finalResults);
    totalWritten++;

    console.log(
      `✅ Wrote ${finalResults.length} locations → ${writtenPath} (fac:${fromFacilities.length}, osm:${fromOsm.length})`
    );
  }

  console.log(`\n🎉 Done. Wrote/updated ${totalWritten} Texas city JSON files from facilities.`);
}

run().catch((e) => {
  console.error("Fatal error:");
  console.error(e);
  process.exit(1);
});
