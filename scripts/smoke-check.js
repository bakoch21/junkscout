/**
 * scripts/smoke-check.js
 *
 * Build sanity gate for local and CI usage.
 * Exits non-zero on critical failures.
 */

const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const BASE_URL = "https://junkscout.io";
const STATES = ["texas", "california"];
const CURATED_BASE = path.join(ROOT, "data", "manual");

const errors = [];
const warnings = [];
const notes = [];

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function readJson(filePath) {
  return JSON.parse(readText(filePath));
}

function readJsonSafe(filePath, fallback = null) {
  try {
    if (!exists(filePath)) return fallback;
    return JSON.parse(readText(filePath));
  } catch {
    return fallback;
  }
}

function exists(filePath) {
  return fs.existsSync(filePath);
}

function addError(msg) {
  errors.push(msg);
}

function addWarning(msg) {
  warnings.push(msg);
}

function addNote(msg) {
  notes.push(msg);
}

function cityListPath(state) {
  return path.join(ROOT, "scripts", `cities-${state}.json`);
}

function getCuratedObject(state, city) {
  const stateSlug = String(state || "").toLowerCase();
  const citySlug = String(city || "").toLowerCase();
  const resolvedPath = path.join(CURATED_BASE, stateSlug, `${citySlug}.resolved.json`);
  const rawPath = path.join(CURATED_BASE, stateSlug, `${citySlug}.json`);
  return readJsonSafe(resolvedPath, null) || readJsonSafe(rawPath, null);
}

function getCuratedItems(curated) {
  if (!curated || typeof curated !== "object") return [];

  const candidate =
    curated.facilities ||
    curated.locations ||
    curated.items ||
    curated.results ||
    curated.data ||
    null;

  if (Array.isArray(candidate)) return candidate;
  if (candidate && typeof candidate === "object") {
    if (Array.isArray(candidate.list)) return candidate.list;
    if (Array.isArray(candidate.items)) return candidate.items;
    if (Array.isArray(candidate.results)) return candidate.results;
  }
  return [];
}

function cityHasRenderableData(state, city) {
  if (getCuratedItems(getCuratedObject(state, city)).length > 0) return true;

  const dataPath = path.join(ROOT, "data", state, `${city}.json`);
  const data = readJsonSafe(dataPath, null);
  if (Array.isArray(data)) return data.length > 0;
  if (data && typeof data === "object" && Array.isArray(data.facilities)) {
    return data.facilities.length > 0;
  }
  return false;
}

function checkRequiredFiles() {
  const required = [
    "index.html",
    "texas/index.html",
    "texas/houston/index.html",
    "texas/dallas/index.html",
    "about/index.html",
    "contact/index.html",
    "privacy/index.html",
    "terms/index.html",
    "disclosure/index.html",
    "data/analytics/config.json",
    "sitemap.xml",
    "scripts/cities-texas.json",
    "scripts/cities-california.json",
  ];

  for (const rel of required) {
    const full = path.join(ROOT, rel);
    if (!exists(full)) addError(`Missing required file: ${rel}`);
  }
}

function checkCityLists() {
  const states = ["texas", "california"];

  for (const state of states) {
    const filePath = cityListPath(state);
    if (!exists(filePath)) {
      addError(`Missing city list: scripts/cities-${state}.json`);
      continue;
    }

    let data;
    try {
      data = readJson(filePath);
    } catch {
      addError(`Invalid JSON in ${filePath}`);
      continue;
    }

    if (!Array.isArray(data)) {
      addError(`City list is not an array: ${filePath}`);
      continue;
    }

    if (data.length === 0) {
      addError(`City list is empty: ${filePath}`);
      continue;
    }

    const bad = data.filter((x) => {
      const city = String(x && x.city || "").toLowerCase();
      return (
        !city ||
        city.includes("undefined") ||
        city.includes("intersection") ||
        city.includes("city-limits") ||
        city.includes("-county-") ||
        /^in-/.test(city)
      );
    });

    if (bad.length > 0) {
      addWarning(`${state} city list has ${bad.length} suspicious slug(s).`);
    }

    addNote(`${state} city count: ${data.length}`);
  }

  const tx = readJson(cityListPath("texas"));
  if (!tx.some((x) => String(x.city || "").toLowerCase() === "houston")) {
    addError("Houston missing from scripts/cities-texas.json");
  }
  if (!tx.some((x) => String(x.city || "").toLowerCase() === "dallas")) {
    addError("Dallas missing from scripts/cities-texas.json");
  }
}

function checkCityDataCoverage() {
  for (const state of STATES) {
    const listPath = cityListPath(state);
    const list = readJsonSafe(listPath, []);
    if (!Array.isArray(list)) continue;

    const missing = [];
    for (const entry of list) {
      const city = String(entry?.city || "").toLowerCase().trim();
      if (!city) continue;
      if (!cityHasRenderableData(state, city)) missing.push(city);
    }

    if (missing.length > 0) {
      addError(`${state} city list contains ${missing.length} city page(s) with missing/empty data.`);
      addWarning(`${state} first missing city data slug: ${missing[0]}`);
    } else {
      addNote(`${state} city data coverage: complete`);
    }
  }
}

function expectedCitySetForState(state) {
  const list = readJsonSafe(cityListPath(state), []);
  if (!Array.isArray(list)) return new Set();

  return new Set(
    list
      .map((entry) => String(entry?.city || "").toLowerCase().trim())
      .filter(Boolean)
      .filter((city) => cityHasRenderableData(state, city))
  );
}

function expectedFacilitySet() {
  const ids = new Set();
  const indexPath = path.join(ROOT, "data", "facilities", "index.json");
  const index = readJsonSafe(indexPath, []);

  if (Array.isArray(index)) {
    index
      .map((x) => String(x?.id || "").trim())
      .filter(Boolean)
      .forEach((id) => ids.add(id));
  }

  const facilitiesDir = path.join(ROOT, "data", "facilities");
  if (exists(facilitiesDir)) {
    fs.readdirSync(facilitiesDir)
      .filter((f) => /^f_manual_.*\.json$/i.test(f))
      .map((f) => f.replace(/\.json$/i, ""))
      .forEach((id) => ids.add(id));
  }

  for (const state of STATES) {
    const dataDir = path.join(ROOT, "data", state);
    if (!exists(dataDir)) continue;

    const files = fs.readdirSync(dataDir)
      .filter((f) => f.toLowerCase().endsWith(".json"))
      .filter((f) => !f.startsWith("_"))
      .filter((f) => f.toLowerCase() !== "cities.json");

    for (const file of files) {
      const parsed = readJsonSafe(path.join(dataDir, file), null);
      const rows = Array.isArray(parsed)
        ? parsed
        : (parsed && typeof parsed === "object" && Array.isArray(parsed.facilities) ? parsed.facilities : []);

      for (const row of rows) {
        const id = String(row?.facility_id || row?.id || "").trim();
        if (id) ids.add(id);
      }
    }
  }

  return ids;
}

function checkGeneratedDirDrift() {
  for (const state of STATES) {
    const expected = expectedCitySetForState(state);
    const stateDir = path.join(ROOT, state);
    if (!exists(stateDir)) continue;

    const dirs = fs.readdirSync(stateDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name.toLowerCase().trim());

    const stale = dirs.filter((slug) => !expected.has(slug));
    if (stale.length > 0) {
      addError(`${state} has ${stale.length} stale generated city dir(s).`);
      addWarning(`${state} first stale city dir: ${stale[0]}`);
    }
  }

  const expectedFacilities = expectedFacilitySet();
  const facilityRoot = path.join(ROOT, "facility");
  if (!exists(facilityRoot)) return;

  const facilityDirs = fs.readdirSync(facilityRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name.trim());

  const staleFacilities = facilityDirs.filter((id) => !expectedFacilities.has(id));
  if (staleFacilities.length > 0) {
    addError(`facility has ${staleFacilities.length} stale generated dir(s).`);
    addWarning(`First stale facility dir: ${staleFacilities[0]}`);
  }
}

function extractSitemapLocs(xml) {
  const locs = [];
  const re = /<loc>([^<]+)<\/loc>/g;
  let match;
  while ((match = re.exec(xml)) !== null) {
    locs.push(match[1]);
  }
  return locs;
}

function sitemapLocToLocalPath(loc) {
  let pathname;
  try {
    pathname = new URL(loc).pathname;
  } catch {
    return null;
  }

  if (pathname === "/") return path.join(ROOT, "index.html");

  const clean = pathname.replace(/^\/+/, "");
  if (!clean) return path.join(ROOT, "index.html");

  return path.join(ROOT, clean, "index.html");
}

function checkSitemap() {
  const sitemapPath = path.join(ROOT, "sitemap.xml");
  if (!exists(sitemapPath)) {
    addError("Missing sitemap.xml");
    return;
  }

  const xml = readText(sitemapPath);
  if (xml.includes("undefined")) {
    addError("sitemap.xml still contains 'undefined' URLs");
  }

  const locs = extractSitemapLocs(xml);
  if (locs.length === 0) {
    addError("sitemap.xml has zero <loc> entries");
    return;
  }

  const missing = [];
  for (const loc of locs) {
    const localPath = sitemapLocToLocalPath(loc);
    if (!localPath || !exists(localPath)) {
      missing.push(loc);
    }
  }

  if (missing.length > 0) {
    addError(`sitemap.xml has ${missing.length} URL(s) without matching local file.`);
    addWarning(`First missing URL: ${missing[0]}`);
  }

  addNote(`sitemap URLs: ${locs.length}`);
}

function readCanonical(relPath) {
  const full = path.join(ROOT, relPath);
  if (!exists(full)) return "";

  const html = readText(full);
  const match = html.match(/<link\s+rel="canonical"\s+href="([^"]+)"\s*\/?>/i);
  return match ? match[1] : "";
}

function checkCanonicals() {
  const checks = [
    { file: "index.html", expected: `${BASE_URL}/` },
    { file: "texas/index.html", expected: `${BASE_URL}/texas/` },
    { file: "california/index.html", expected: `${BASE_URL}/california/` },
    { file: "texas/houston/index.html", expected: `${BASE_URL}/texas/houston/` },
    { file: "texas/dallas/index.html", expected: `${BASE_URL}/texas/dallas/` },
  ];

  for (const check of checks) {
    const canonical = readCanonical(check.file);
    if (!canonical) {
      addError(`Missing canonical in ${check.file}`);
      continue;
    }
    if (canonical !== check.expected) {
      addError(`Canonical mismatch in ${check.file}. Expected ${check.expected}, got ${canonical}`);
    }
  }

  const facilityIndexPath = path.join(ROOT, "data", "facilities", "index.json");
  if (!exists(facilityIndexPath)) {
    addWarning("data/facilities/index.json missing; facility canonical check skipped.");
    return;
  }

  const facilityIndex = readJson(facilityIndexPath);
  if (!Array.isArray(facilityIndex) || facilityIndex.length === 0) {
    addWarning("No facility records in data/facilities/index.json");
    return;
  }

  const sample = facilityIndex[0];
  const id = String(sample && sample.id || "").trim();
  if (!id) {
    addWarning("Facility canonical check skipped; sample id missing.");
    return;
  }

  const rel = path.join("facility", id, "index.html");
  const canonical = readCanonical(rel);
  const expected = `${BASE_URL}/facility/${id}/`;

  if (!canonical) addError(`Missing canonical in ${rel}`);
  else if (canonical !== expected) addError(`Canonical mismatch in ${rel}. Expected ${expected}, got ${canonical}`);
}

function checkHoustonSignals() {
  const rel = "texas/houston/index.html";
  const full = path.join(ROOT, rel);
  if (!exists(full)) {
    addError("Houston page missing: texas/houston/index.html");
    return;
  }

  const html = readText(full);

  if (!html.includes("CURATED:JSON")) {
    addWarning("Houston page missing CURATED:JSON overlay block.");
  }

  if (!html.includes("JSONLD:START")) {
    addWarning("Houston page missing JSON-LD marker.");
  }

  if (!html.toLowerCase().includes("where to dump")) {
    addWarning("Houston page may be missing key intent phrase 'where to dump'.");
  }
}

function checkDallasSignals() {
  const rel = "texas/dallas/index.html";
  const full = path.join(ROOT, rel);
  if (!exists(full)) {
    addError("Dallas page missing: texas/dallas/index.html");
    return;
  }

  const html = readText(full);

  if (!html.includes("CURATED:JSON")) {
    addWarning("Dallas page missing CURATED:JSON overlay block.");
  }

  if (!html.includes("JSONLD:START")) {
    addWarning("Dallas page missing JSON-LD marker.");
  }

  if (!html.toLowerCase().includes("where can i dump trash in dallas")) {
    addWarning("Dallas page may be missing key Dallas intent phrase.");
  }
}

function printSummaryAndExit() {
  console.log("Smoke check summary:");

  for (const n of notes) console.log(`NOTE: ${n}`);
  for (const w of warnings) console.log(`WARN: ${w}`);
  for (const e of errors) console.log(`ERROR: ${e}`);

  console.log(`\nTotals -> errors: ${errors.length}, warnings: ${warnings.length}`);

  if (errors.length > 0) process.exit(1);
  process.exit(0);
}

function run() {
  checkRequiredFiles();
  checkCityLists();
  checkCityDataCoverage();
  checkGeneratedDirDrift();
  checkSitemap();
  checkCanonicals();
  checkHoustonSignals();
  checkDallasSignals();
  printSummaryAndExit();
}

run();
