// scripts/build-facilities.js
// Build canonical facility records from city JSON files and backfill facility_id into each city record.
//
// Usage:
//   node scripts/build-facilities.js texas
//   node scripts/build-facilities.js california
// If no arg is provided, defaults to "texas".

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const STATE = (process.argv[2] || "texas").toString().trim().toLowerCase();
const CITY_DATA_DIR = path.join("data", STATE);
const FACILITIES_DIR = path.join("data", "facilities");

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

function writeJson(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2));
}

function normStr(s) {
  return (s || "")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\w\s\-#&/.,]/g, "");
}

function roundCoord(n, decimals = 5) {
  if (typeof n !== "number") return "";
  const m = Math.pow(10, decimals);
  return Math.round(n * m) / m;
}

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function isValidCoordPair(lat, lng) {
  if (lat === null || lng === null) return false;
  if (lat < -90 || lat > 90) return false;
  if (lng < -180 || lng > 180) return false;
  if (Math.abs(lat) < 0.000001 && Math.abs(lng) < 0.000001) return false;
  return true;
}

function getCoords(item) {
  const lat = toNum(item?.lat ?? item?.latitude);
  const lng = toNum(item?.lng ?? item?.lon ?? item?.longitude);
  if (!isValidCoordPair(lat, lng)) return { lat: null, lng: null };
  return { lat, lng };
}

function facilityKey(item) {
  // stable-ish fingerprint even if city attribution differs
  const coords = getCoords(item);
  const lat = coords.lat === null ? "" : roundCoord(coords.lat);
  const lng = coords.lng === null ? "" : roundCoord(coords.lng);
  const type = normStr(item.type);
  const name = normStr(item.name);
  const address = normStr(item.address);
  const website = normStr(item.website);
  const osm = normStr(item.osm_url);

  // if name/address are weak, coords + type + osm/website still stabilizes
  return [
    `lat:${lat}`,
    `lng:${lng}`,
    `type:${type}`,
    `name:${name}`,
    `addr:${address}`,
    `web:${website}`,
    `osm:${osm}`,
  ].join("|");
}

function hashId(key) {
  // short SHA1 is fine here; stable and compact
  return crypto.createHash("sha1").update(key).digest("hex").slice(0, 12);
}

function slugify(s) {
  return (s || "")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function main() {
  if (!fs.existsSync(CITY_DATA_DIR)) {
    console.error(`❌ City data dir not found: ${CITY_DATA_DIR}`);
    console.error(`   Create it first (e.g., data/${STATE}/) and add city JSON files.`);
    process.exit(1);
  }

  fs.mkdirSync(FACILITIES_DIR, { recursive: true });

  const cityFiles = fs
    .readdirSync(CITY_DATA_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort((a, b) => a.localeCompare(b));

  if (cityFiles.length === 0) {
    console.error(`❌ No city JSON files found in: ${CITY_DATA_DIR}`);
    process.exit(1);
  }

  const facilityMap = new Map(); // facility_id -> facility record
  const keyToId = new Map();     // key -> facility_id

  // Pass 1: build facilities + rewrite city files with facility_id
  for (const file of cityFiles) {
    const citySlug = file.replace(/\.json$/i, "");
    const cityPath = path.join(CITY_DATA_DIR, file);
    const items = readJson(cityPath);

    if (!Array.isArray(items)) {
      console.log(`⚠️ Skipping non-array JSON → ${cityPath}`);
      continue;
    }

    let changed = false;

    const updatedItems = items.map((item) => {
      if (!item || typeof item !== "object") return item;

      const key = facilityKey(item);
      let id = keyToId.get(key);

      if (!id) {
        id = "f_" + hashId(key);
        keyToId.set(key, id);
      }

      if (item.facility_id !== id) {
        item.facility_id = id;
        changed = true;
      }

      // Build / update canonical facility record
      const existing = facilityMap.get(id);
      const coords = getCoords(item);

      const record = existing || {
        id,
        slug: slugify(item.name) || id,
        name: item.name || "Unnamed site",
        type: item.type || "other",
        address: item.address || "",
        lat: coords.lat,
        lng: coords.lng,
        website: item.website || null,
        osm_url: item.osm_url || null,
        appears_in: [],
      };

      // merge improvements if new info is better
      if ((!record.name || record.name === "Unnamed site") && item.name) record.name = item.name;
      if ((!record.address || record.address.length < 6) && item.address) record.address = item.address;
      if (!record.website && item.website) record.website = item.website;
      if (!record.osm_url && item.osm_url) record.osm_url = item.osm_url;
      if (record.lat == null && coords.lat != null) record.lat = coords.lat;
      if (record.lng == null && coords.lng != null) record.lng = coords.lng;

      // add appears_in
      const appears = { state: STATE, city: citySlug };
      const existsAppears = record.appears_in.some(
        (x) => x.state === appears.state && x.city === appears.city
      );
      if (!existsAppears) record.appears_in.push(appears);

      facilityMap.set(id, record);
      return item;
    });

    if (changed) {
      writeJson(cityPath, updatedItems);
      console.log(`✅ Backfilled facility_id → ${cityPath}`);
    } else {
      console.log(`ℹ️ No changes → ${cityPath}`);
    }
  }

  // Pass 2: write facility JSON files
  const facilities = Array.from(facilityMap.values()).sort((a, b) =>
    (a.name || "").localeCompare(b.name || "")
  );

  for (const f of facilities) {
    const outPath = path.join(FACILITIES_DIR, `${f.id}.json`);
    writeJson(outPath, f);
  }

  // Optional index file (handy for debugging / quick lookups)
  writeJson(path.join(FACILITIES_DIR, "index.json"), facilities);

  console.log(`\n✅ State: ${STATE}`);
  console.log(`✅ Wrote ${facilities.length} facilities → ${FACILITIES_DIR}`);
  console.log(`✅ Processed ${cityFiles.length} city files → ${CITY_DATA_DIR}`);
}

main();
