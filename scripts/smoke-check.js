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

const errors = [];
const warnings = [];
const notes = [];

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function readJson(filePath) {
  return JSON.parse(readText(filePath));
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

function checkRequiredFiles() {
  const required = [
    "index.html",
    "texas/index.html",
    "texas/houston/index.html",
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
    { file: "texas/houston/index.html", expected: `${BASE_URL}/texas/houston/` },
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
  checkSitemap();
  checkCanonicals();
  checkHoustonSignals();
  printSummaryAndExit();
}

run();
