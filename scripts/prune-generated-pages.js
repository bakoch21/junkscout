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

  return new Set(
    data
      .map((x) => String(x && x.city || "").toLowerCase().trim())
      .filter(Boolean)
  );
}

function readFacilitySet() {
  const indexPath = path.join(ROOT, "data", "facilities", "index.json");
  const index = safeReadJson(indexPath, []);
  if (Array.isArray(index) && index.length > 0) {
    return new Set(
      index.map((x) => String(x && x.id || "").trim()).filter(Boolean)
    );
  }

  const dir = path.join(ROOT, "data", "facilities");
  if (!fs.existsSync(dir)) return new Set();

  return new Set(
    fs.readdirSync(dir)
      .filter((f) => f.toLowerCase().endsWith(".json") && f.toLowerCase() !== "index.json")
      .map((f) => f.replace(/\.json$/i, ""))
  );
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
