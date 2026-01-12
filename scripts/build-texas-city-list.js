/**
 * build-texas-city-list.js
 *
 * Reads generated OSM results from ./data/texas/*.json
 * Produces scripts/cities-texas.json containing ONLY cities with >=1 useful result
 *
 * Useful result types: landfill, transfer_station, recycling
 */

const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data", "texas");      // ./data/texas
const OUT_FILE = path.join(__dirname, "cities-texas.json");       // ./scripts/cities-texas.json

const ALLOWED_TYPES = new Set(["landfill", "transfer_station", "recycling"]);

function slugToTitle(slug = "") {
  return slug
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function run() {
  if (!fs.existsSync(DATA_DIR)) {
    console.error(`❌ Missing folder: ${DATA_DIR}`);
    console.error(`Run: node scripts/generate-cities.js first.`);
    process.exit(1);
  }

  const files = fs
    .readdirSync(DATA_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort((a, b) => a.localeCompare(b));

  const keep = [];

  for (const file of files) {
    const citySlug = file.replace(/\.json$/i, "");
    const fullPath = path.join(DATA_DIR, file);

    let rows = [];
    try {
      rows = JSON.parse(fs.readFileSync(fullPath, "utf-8"));
      if (!Array.isArray(rows)) rows = [];
    } catch (e) {
      rows = [];
    }

    const usefulCount = rows.filter((r) => ALLOWED_TYPES.has(String(r.type || "").toLowerCase())).length;

    if (usefulCount >= 1) {
      const label = slugToTitle(citySlug);
      keep.push({
        state: "texas",
        city: citySlug,
        query: `${label}, Texas, USA`,
      });
    }
  }

  fs.writeFileSync(OUT_FILE, JSON.stringify(keep, null, 2));
  console.log(`✅ Wrote ${keep.length} cities → ${OUT_FILE}`);
}

run();
