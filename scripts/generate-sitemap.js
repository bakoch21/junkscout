const fs = require("fs");
const path = require("path");

const BASE_URL = "https://junkscout.io";
const TODAY = new Date().toISOString().slice(0, 10);
const OUT_PATH = "sitemap.xml";
const CITY_DATA_BASE = "data";
const CURATED_BASE = path.join("data", "manual");

const STATE_CITY_LISTS = [
  { state: "texas", file: path.join("scripts", "cities-texas.json") },
  { state: "california", file: path.join("scripts", "cities-california.json") },
];
const STATIC_PAGES = [
  "/about/",
  "/contact/",
  "/privacy/",
  "/terms/",
  "/disclosure/",
];

const FACILITIES_DIR = path.join("data", "facilities");
const FACILITY_PAGES_DIR = "facility";

function safeReadJson(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return fallback;
  }
}

function xmlEscape(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function cleanSlug(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function toUrl(pathname) {
  if (!pathname.startsWith("/")) return `${BASE_URL}/${pathname}`;
  return `${BASE_URL}${pathname}`;
}

function buildUrlNode({ loc, lastmod = TODAY, changefreq, priority }) {
  const fields = [
    `    <loc>${xmlEscape(loc)}</loc>`,
    `    <lastmod>${xmlEscape(lastmod)}</lastmod>`,
  ];

  if (changefreq) fields.push(`    <changefreq>${xmlEscape(changefreq)}</changefreq>`);
  if (priority) fields.push(`    <priority>${xmlEscape(priority)}</priority>`);

  return ["  <url>", ...fields, "  </url>"].join("\n");
}

function readCityEntries(state, listPath) {
  const data = safeReadJson(listPath, []);
  if (!Array.isArray(data)) return [];

  return data
    .map((entry) => {
      const city = cleanSlug(entry?.city || entry?.slug || "");
      const recordState = cleanSlug(entry?.state || state);
      if (!city || !recordState) return null;
      return { state: recordState, city };
    })
    .filter(Boolean);
}

function getCuratedObject(state, city) {
  const stateDir = cleanSlug(state);
  const citySlug = cleanSlug(city);
  const resolvedPath = path.join(CURATED_BASE, stateDir, `${citySlug}.resolved.json`);
  const rawPath = path.join(CURATED_BASE, stateDir, `${citySlug}.json`);
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

function cityHasRenderableData(state, city) {
  const curated = getCuratedObject(state, city);
  if (getCuratedItems(curated).length > 0) return true;

  const dataPath = path.join(CITY_DATA_BASE, cleanSlug(state), `${cleanSlug(city)}.json`);
  const data = safeReadJson(dataPath, null);
  if (Array.isArray(data)) return data.length > 0;
  if (data && typeof data === "object" && Array.isArray(data.facilities)) {
    return data.facilities.length > 0;
  }
  return false;
}

function readFacilityIdsFromPages() {
  if (!fs.existsSync(FACILITY_PAGES_DIR)) return [];

  return fs
    .readdirSync(FACILITY_PAGES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .filter((id) => fs.existsSync(path.join(FACILITY_PAGES_DIR, id, "index.html")))
    .filter(Boolean);
}

function readFacilityIdsFromDataFiles() {
  if (!fs.existsSync(FACILITIES_DIR)) return [];

  const ids = new Set();

  const fromIndex = safeReadJson(path.join(FACILITIES_DIR, "index.json"), null);
  if (Array.isArray(fromIndex) && fromIndex.length > 0) {
    fromIndex
      .map((f) => String(f?.id || "").trim())
      .filter(Boolean)
      .forEach((id) => ids.add(id));
  }

  fs.readdirSync(FACILITIES_DIR)
    .filter((f) => f.endsWith(".json") && f.toLowerCase() !== "index.json")
    .map((f) => f.replace(/\.json$/i, ""))
    .filter(Boolean)
    .forEach((id) => ids.add(id));

  return Array.from(ids);
}

function readFacilityIds() {
  const fromPages = readFacilityIdsFromPages();
  if (fromPages.length > 0) return fromPages.sort((a, b) => a.localeCompare(b));

  return readFacilityIdsFromDataFiles().sort((a, b) => a.localeCompare(b));
}

function run() {
  const seen = new Set();
  const nodes = [];

  function add({ pathname, lastmod, changefreq, priority }) {
    const loc = toUrl(pathname);
    if (seen.has(loc)) return;
    seen.add(loc);
    nodes.push(buildUrlNode({ loc, lastmod, changefreq, priority }));
  }

  add({ pathname: "/", changefreq: "daily", priority: "1.0" });
  for (const pathname of STATIC_PAGES) {
    add({ pathname, changefreq: "monthly", priority: "0.3" });
  }

  let totalCities = 0;
  let skippedCities = 0;
  for (const stateConfig of STATE_CITY_LISTS) {
    const stateSlug = cleanSlug(stateConfig.state);
    if (!stateSlug) continue;

    add({ pathname: `/${stateSlug}/`, changefreq: "weekly", priority: "0.8" });

    const cities = readCityEntries(stateSlug, stateConfig.file);

    for (const city of cities) {
      if (!cityHasRenderableData(city.state, city.city)) {
        skippedCities += 1;
        continue;
      }
      totalCities += 1;
      add({
        pathname: `/${city.state}/${city.city}/`,
        changefreq: "weekly",
        priority: "0.7",
      });
    }
  }

  const facilityIds = readFacilityIds();
  for (const id of facilityIds) {
    add({
      pathname: `/facility/${id}/`,
      changefreq: "monthly",
      priority: "0.6",
    });
  }

  const xml = [
    "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
    "<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">",
    nodes.join("\n"),
    "</urlset>",
  ].join("\n");

  fs.writeFileSync(OUT_PATH, xml, "utf-8");

  console.log(`Wrote ${OUT_PATH}`);
  console.log(`Cities included: ${totalCities}`);
  if (skippedCities > 0) console.log(`Cities skipped (no data): ${skippedCities}`);
  console.log(`Facility pages included: ${facilityIds.length}`);
  console.log(`Total URLs: ${seen.size}`);
}

run();
