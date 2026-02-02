/**
 * scripts/build-texas-city-list.js
 *
 * Builds the Texas city list from the *actual* city JSON files in /data/texas.
 * This avoids junk “cities” coming from facility address strings / weird raw.city values.
 *
 * Outputs:
 *  - ./scripts/cities-texas.json   (seed list + can be embedded into pages)
 *  - ./data/texas/cities.json      (optional: frontend can fetch this)
 */

const fs = require("fs");
const path = require("path");

const STATE = "texas";
const DATA_DIR = path.join(".", "data", STATE);
const OUT_SCRIPTS = path.join(".", "scripts", `cities-${STATE}.json`);
const OUT_DATA = path.join(".", "data", STATE, "cities.json");

// any files we should ignore in /data/texas
const IGNORE = new Set([
  "index.json",
  "cities.json",
  "neighbors.json",
  "neighbors-cities.json",
]);

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function safeReadJson(p, fallback) {
  try {
    if (!fs.existsSync(p)) return fallback;
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return fallback;
  }
}

function cleanStr(s) {
  return (s || "").toString().trim();
}

function titleCaseFromSlug(slug) {
  return cleanStr(slug)
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// Heuristic: only include city files that actually contain at least 1 usable record
function cityFileHasContent(filePath) {
  const arr = safeReadJson(filePath, []);
  if (!Array.isArray(arr)) return false;
  // “usable” = has lat/lng OR name OR address
  return arr.some((r) => r && (r.lat || r.lng || r.name || r.address));
}

function build() {
  if (!fs.existsSync(DATA_DIR)) {
    console.error(`Missing ${DATA_DIR}. Run generate-cities first.`);
    process.exit(1);
  }

  const files = fs
    .readdirSync(DATA_DIR)
    .filter((f) => f.endsWith(".json"))
    .filter((f) => !IGNORE.has(f.toLowerCase()));

  const cities = [];

  for (const f of files) {
    const citySlug = f.replace(/\.json$/i, "");
    const fullPath = path.join(DATA_DIR, f);

    if (!citySlug || citySlug.length < 2) continue;
    if (!cityFileHasContent(fullPath)) continue;

    const cityName = titleCaseFromSlug(citySlug);

    cities.push({
      state: STATE,
      city: citySlug,
      // query used by OSM seeding / geocoding if needed
      query: `${cityName}, Texas`,
    });
  }

  // sort alphabetically by city slug (stable)
  cities.sort((a, b) => a.city.localeCompare(b.city));

  // write scripts output
  ensureDir(path.dirname(OUT_SCRIPTS));
  fs.writeFileSync(OUT_SCRIPTS, JSON.stringify(cities, null, 2));

  // write data output (optional)
  ensureDir(path.dirname(OUT_DATA));
  fs.writeFileSync(OUT_DATA, JSON.stringify({ state: STATE, cities }, null, 2));

  console.log(`✅ Built ${cities.length} Texas cities`);
  console.log(`→ ${OUT_SCRIPTS}`);
  console.log(`→ ${OUT_DATA}`);
}

build();
