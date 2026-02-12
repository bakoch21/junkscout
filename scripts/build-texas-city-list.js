/**
 * scripts/build-texas-city-list.js
 *
 * Build a high-confidence Texas city list from /data/texas city JSON files.
 *
 * Goals:
 * - Keep strong city pages indexable.
 * - Reject junk slugs that come from address fragments.
 * - Preserve known real cities from trusted seed list.
 *
 * Outputs:
 * - ./scripts/cities-texas.json
 * - ./data/texas/cities.json
 * - ./data/texas/_citylist-quality-report.json
 */

const fs = require("fs");
const path = require("path");

const STATE = "texas";
const DATA_DIR = path.join(".", "data", STATE);
const OUT_SCRIPTS = path.join(".", "scripts", `cities-${STATE}.json`);
const OUT_DATA = path.join(".", "data", STATE, "cities.json");
const OUT_REPORT = path.join(".", "data", STATE, "_citylist-quality-report.json");

const SEED_PATH = path.join(".", "scripts", "cities-texas.from-osm.json");
const MANUAL_DIR = path.join(".", "data", "manual", STATE);

const IGNORE = new Set([
  "index.json",
  "cities.json",
  "_city-centroids.json",
  "_neighbors.json",
  "neighbors.json",
  "neighbors-cities.json",
]);

const HARD_INCLUDE = new Set(["houston"]);

const BLOCKED_SEGMENTS = new Set([
  "rd",
  "road",
  "st",
  "street",
  "ave",
  "avenue",
  "blvd",
  "boulevard",
  "hwy",
  "highway",
  "fwy",
  "freeway",
  "county",
  "intersection",
  "landfill",
  "transfer",
  "station",
  "facility",
  "site",
  "miles",
  "mile",
  "mi",
  "north",
  "south",
  "east",
  "west",
  "n",
  "s",
  "e",
  "w",
  "of",
  "on",
  "in",
  "at",
  "adj",
  "adjacent",
  "unknown",
  "line",
  "parkway",
  "pkwy",
  "loop",
  "driveway",
  "gate",
  "locked",
]);

const BLOCKED_PATTERNS = [
  /^in-/,
  /^of-/,
  /^rd-/,
  /^st-/,
  /^ave-/,
  /^city-/,
  /-city-limits-/,
  /-intersection-/,
  /-county-/,
  /-road-/,
  /-driveway-/,
  /-locked-gate-/,
  /-mi-/,
  /-miles-/,
  /-of-/,
  /-in-/,
  /-unknown-/,
];

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function safeReadJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function cleanStr(value) {
  return (value || "").toString().trim();
}

function titleCaseFromSlug(slug) {
  return cleanStr(slug)
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function readSeedSlugs() {
  const seed = safeReadJson(SEED_PATH, []);
  if (!Array.isArray(seed)) return new Set();

  return new Set(
    seed
      .map((entry) => cleanStr(entry && entry.city).toLowerCase())
      .filter(Boolean)
  );
}

function readManualSlugs() {
  if (!fs.existsSync(MANUAL_DIR)) return new Set();

  const files = fs
    .readdirSync(MANUAL_DIR)
    .filter((name) => name.toLowerCase().endsWith(".json"));

  const slugs = new Set();

  for (const file of files) {
    const lower = file.toLowerCase();
    if (lower.endsWith(".resolved.json")) {
      slugs.add(lower.replace(/\.resolved\.json$/i, ""));
    } else {
      slugs.add(lower.replace(/\.json$/i, ""));
    }
  }

  return slugs;
}

function analyzeCityFile(filePath) {
  const rows = safeReadJson(filePath, []);

  if (!Array.isArray(rows)) {
    return {
      isArray: false,
      totalRows: 0,
      usableRows: 0,
      uniqueFacilityIds: 0,
    };
  }

  let usableRows = 0;
  const ids = new Set();

  for (const row of rows) {
    if (!row || typeof row !== "object") continue;

    const hasName = cleanStr(row.name).length >= 3;
    const hasAddress = cleanStr(row.address).length >= 6;

    const lat = Number(row.lat);
    const lng = Number(row.lng);
    const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);

    if (hasName && (hasAddress || hasCoords)) {
      usableRows += 1;
    }

    const id = cleanStr(row.facility_id || row.id);
    if (id) ids.add(id);
  }

  return {
    isArray: true,
    totalRows: rows.length,
    usableRows,
    uniqueFacilityIds: ids.size,
  };
}

function slugLooksLikeCity(slug, trustedSlugs) {
  if (!slug) return false;
  if (trustedSlugs.has(slug)) return true;
  if (HARD_INCLUDE.has(slug)) return true;

  if (slug.length < 3 || slug.length > 32) return false;

  const parts = slug.split("-").filter(Boolean);
  if (parts.length === 0 || parts.length > 4) return false;

  if (BLOCKED_PATTERNS.some((pattern) => pattern.test(slug))) return false;
  if (parts.some((part) => BLOCKED_SEGMENTS.has(part))) return false;

  if (!/^[a-z0-9-]+$/.test(slug)) return false;
  if (/\d/.test(slug)) return false;

  return true;
}

function build() {
  if (!fs.existsSync(DATA_DIR)) {
    console.error(`Missing ${DATA_DIR}. Run data generation first.`);
    process.exit(1);
  }

  const trustedSlugs = new Set([
    ...readSeedSlugs(),
    ...readManualSlugs(),
    ...Array.from(HARD_INCLUDE),
  ]);

  const files = fs
    .readdirSync(DATA_DIR)
    .filter((name) => name.toLowerCase().endsWith(".json"))
    .filter((name) => !IGNORE.has(name.toLowerCase()));

  const cities = [];
  const rejected = [];

  for (const file of files) {
    const slug = file.replace(/\.json$/i, "").toLowerCase();
    const fullPath = path.join(DATA_DIR, file);

    if (!slug) {
      rejected.push({ slug, reason: "empty_slug" });
      continue;
    }

    if (!slugLooksLikeCity(slug, trustedSlugs)) {
      rejected.push({ slug, reason: "slug_failed_quality_gate" });
      continue;
    }

    const analysis = analyzeCityFile(fullPath);
    if (!analysis.isArray) {
      rejected.push({ slug, reason: "file_not_array" });
      continue;
    }

    if (analysis.usableRows < 1) {
      rejected.push({ slug, reason: "no_usable_rows", analysis });
      continue;
    }

    if (analysis.uniqueFacilityIds < 1) {
      rejected.push({ slug, reason: "no_facility_ids", analysis });
      continue;
    }

    const cityName = titleCaseFromSlug(slug);

    cities.push({
      state: STATE,
      city: slug,
      query: `${cityName}, Texas`,
      confidence: trustedSlugs.has(slug) ? "trusted" : "heuristic",
    });
  }

  cities.sort((a, b) => a.city.localeCompare(b.city));

  const outScriptCities = cities.map(({ state, city, query }) => ({ state, city, query }));

  writeJson(OUT_SCRIPTS, outScriptCities);
  writeJson(OUT_DATA, { state: STATE, cities: outScriptCities });
  writeJson(OUT_REPORT, {
    state: STATE,
    generated_at: new Date().toISOString(),
    source_file_count: files.length,
    accepted_count: cities.length,
    rejected_count: rejected.length,
    trusted_seed_count: trustedSlugs.size,
    accepted: cities,
    rejected,
  });

  console.log(`Built ${cities.length} Texas cities after quality gate.`);
  console.log(`Wrote ${OUT_SCRIPTS}`);
  console.log(`Wrote ${OUT_DATA}`);
  console.log(`Wrote ${OUT_REPORT}`);
}

build();
