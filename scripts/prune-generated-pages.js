/**
 * scripts/prune-generated-pages.js
 *
 * Report or prune generated city/facility pages that no longer belong
 * to the current city/facility source lists.
 *
 * Default: dry-run report only.
 * Apply deletes with: --apply
 */

const fs = require("fs");
const path = require("path");

const APPLY = process.argv.includes("--apply");

const ROOT = process.cwd();
const STATES = ["texas", "california"];
const CURATED_BASE = path.join(ROOT, "data", "manual");

function safeReadJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function readStateCitySet(state) {
  const listPath = path.join(ROOT, "scripts", `cities-${state}.json`);
  const data = safeReadJson(listPath, []);
  if (!Array.isArray(data)) return new Set();

  function getCuratedObject(stateSlug, citySlug) {
    const resolvedPath = path.join(CURATED_BASE, stateSlug, `${citySlug}.resolved.json`);
    const rawPath = path.join(CURATED_BASE, stateSlug, `${citySlug}.json`);
    return safeReadJson(resolvedPath, null) || safeReadJson(rawPath, null);
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

  function cityHasRenderableData(stateSlug, citySlug) {
    const curated = getCuratedObject(stateSlug, citySlug);
    if (getCuratedItems(curated).length > 0) return true;

    const dataPath = path.join(ROOT, "data", stateSlug, `${citySlug}.json`);
    const fileData = safeReadJson(dataPath, null);
    if (Array.isArray(fileData)) return fileData.length > 0;
    if (fileData && typeof fileData === "object" && Array.isArray(fileData.facilities)) {
      return fileData.facilities.length > 0;
    }
    return false;
  }

  return new Set(
    data
      .map((x) => String(x && x.city || "").toLowerCase().trim())
      .filter((city) => cityHasRenderableData(state, city))
      .filter(Boolean)
  );
}

function readFacilitySet() {
  const ids = new Set();
  const indexPath = path.join(ROOT, "data", "facilities", "index.json");
  const index = safeReadJson(indexPath, []);
  if (Array.isArray(index)) {
    index
      .map((x) => String(x && x.id || "").trim())
      .filter(Boolean)
      .forEach((id) => ids.add(id));
  }

  const dir = path.join(ROOT, "data", "facilities");
  if (fs.existsSync(dir)) {
    fs.readdirSync(dir)
      .filter((f) => f.toLowerCase().endsWith(".json") && f.toLowerCase() !== "index.json")
      .map((f) => f.replace(/\.json$/i, ""))
      .filter(Boolean)
      .filter((id) => id.startsWith("f_manual_"))
      .forEach((id) => ids.add(id));
  }

  for (const state of STATES) {
    const cityDir = path.join(ROOT, "data", state);
    if (!fs.existsSync(cityDir)) continue;

    const cityFiles = fs
      .readdirSync(cityDir)
      .filter((f) => f.toLowerCase().endsWith(".json"))
      .filter((f) => !f.startsWith("_"))
      .filter((f) => f.toLowerCase() !== "cities.json");

    for (const file of cityFiles) {
      const fullPath = path.join(cityDir, file);
      const parsed = safeReadJson(fullPath, null);
      const rows = Array.isArray(parsed)
        ? parsed
        : (parsed && typeof parsed === "object" && Array.isArray(parsed.facilities) ? parsed.facilities : []);

      for (const row of rows) {
        const id = String(row && (row.facility_id || row.id) || "").trim();
        if (id) ids.add(id);
      }
    }
  }

  return ids;
}

function listDirNames(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  return fs.readdirSync(dirPath, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
}

function removeDirIfExists(absPath) {
  if (!fs.existsSync(absPath)) return;
  fs.rmSync(absPath, { recursive: true, force: true });
}

function run() {
  const staleCityDirs = [];
  const staleFacilityDirs = [];

  for (const state of STATES) {
    const expectedCities = readStateCitySet(state);
    const stateDir = path.join(ROOT, state);
    const existing = listDirNames(stateDir);

    for (const dirName of existing) {
      const slug = String(dirName || "").toLowerCase();
      if (!expectedCities.has(slug)) {
        staleCityDirs.push(path.join(state, dirName));
      }
    }
  }

  const expectedFacilities = readFacilitySet();
  const facilityRoot = path.join(ROOT, "facility");
  const facilityDirs = listDirNames(facilityRoot);

  for (const dirName of facilityDirs) {
    const id = String(dirName || "").trim();
    if (!expectedFacilities.has(id)) {
      staleFacilityDirs.push(path.join("facility", dirName));
    }
  }

  console.log(`Dry run: ${APPLY ? "off (apply mode)" : "on"}`);
  console.log(`Stale city dirs: ${staleCityDirs.length}`);
  console.log(`Stale facility dirs: ${staleFacilityDirs.length}`);

  if (staleCityDirs.length > 0) {
    console.log("First 20 stale city dirs:");
    staleCityDirs.slice(0, 20).forEach((p) => console.log(`  ${p}`));
  }

  if (staleFacilityDirs.length > 0) {
    console.log("First 20 stale facility dirs:");
    staleFacilityDirs.slice(0, 20).forEach((p) => console.log(`  ${p}`));
  }

  if (!APPLY) {
    console.log("\nNo files were deleted. Re-run with --apply to prune.");
    return;
  }

  for (const relPath of staleCityDirs) {
    removeDirIfExists(path.join(ROOT, relPath));
  }

  for (const relPath of staleFacilityDirs) {
    removeDirIfExists(path.join(ROOT, relPath));
  }

  console.log("\nPrune complete.");
}

run();
