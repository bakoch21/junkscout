const fs = require("fs");
const path = require("path");

const BASE_URL = "https://junkscout.io";
const TODAY = new Date().toISOString().slice(0, 10);
const OUT_PATH = "sitemap.xml";

const STATE_CITY_LISTS = [
  { state: "texas", file: path.join("scripts", "cities-texas.json") },
  { state: "california", file: path.join("scripts", "cities-california.json") },
];

const FACILITIES_DIR = path.join("data", "facilities");

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

function readFacilityIds() {
  if (!fs.existsSync(FACILITIES_DIR)) return [];

  const fromIndex = safeReadJson(path.join(FACILITIES_DIR, "index.json"), null);
  if (Array.isArray(fromIndex) && fromIndex.length > 0) {
    return fromIndex
      .map((f) => String(f?.id || "").trim())
      .filter(Boolean);
  }

  return fs
    .readdirSync(FACILITIES_DIR)
    .filter((f) => f.endsWith(".json") && f.toLowerCase() !== "index.json")
    .map((f) => f.replace(/\.json$/i, ""))
    .filter(Boolean);
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

  let totalCities = 0;
  for (const stateConfig of STATE_CITY_LISTS) {
    const stateSlug = cleanSlug(stateConfig.state);
    if (!stateSlug) continue;

    add({ pathname: `/${stateSlug}/`, changefreq: "weekly", priority: "0.8" });

    const cities = readCityEntries(stateSlug, stateConfig.file);
    totalCities += cities.length;

    for (const city of cities) {
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
  console.log(`Facility pages included: ${facilityIds.length}`);
  console.log(`Total URLs: ${seen.size}`);
}

run();
