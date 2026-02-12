const fs = require("fs");
const path = require("path");

// Usage:
//   node scripts/generate-facility-pages.js
//   node scripts/generate-facility-pages.js texas
//   node scripts/generate-facility-pages.js texas houston
//   node scripts/generate-facility-pages.js texas --city houston
const STATE_ARG = String(process.argv[2] || "texas").trim().toLowerCase();

let CITY_FILTER_ARG = "";
const third = String(process.argv[3] || "").trim();
const fourth = String(process.argv[4] || "").trim();
if (third.startsWith("--city=")) {
  CITY_FILTER_ARG = third.slice("--city=".length).trim().toLowerCase();
} else if (third === "--city") {
  CITY_FILTER_ARG = fourth.toLowerCase();
} else if (third && !third.startsWith("--")) {
  CITY_FILTER_ARG = third.toLowerCase();
}

const FACILITIES_DIR = path.join("data", "facilities");
const TEMPLATE_PATH = "facility-template.html";
const OUTPUT_BASE = ".";
const BASE_URL = "https://junkscout.io";

function safeReadJson(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return fallback;
  }
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (ch) => {
    if (ch === "&") return "&amp;";
    if (ch === "<") return "&lt;";
    if (ch === ">") return "&gt;";
    if (ch === '"') return "&quot;";
    return "&#39;";
  });
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

function titleCaseFromSlug(slug = "") {
  return String(slug || "")
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function stateAbbrevFromSlug(stateSlug = "") {
  const state = String(stateSlug || "").toLowerCase();
  if (state === "texas") return "TX";
  if (state === "california") return "CA";
  return state.toUpperCase();
}

function typeLabel(type = "") {
  const t = String(type || "").toLowerCase();
  if (t === "landfill") return "landfill";
  if (t === "transfer_station") return "transfer station";
  if (t === "recycling") return "recycling center";
  if (t === "hazardous_waste") return "hazardous waste site";
  return "drop-off site";
}

function getAppearsIn(facility) {
  return Array.isArray(facility?.appears_in)
    ? facility.appears_in
        .map((x) => ({
          state: cleanSlug(x?.state || ""),
          city: cleanSlug(x?.city || ""),
        }))
        .filter((x) => x.state || x.city)
    : [];
}

function matchesState(facility, state) {
  const appears = getAppearsIn(facility);
  if (appears.length === 0) return state === "texas";
  return appears.some((x) => x.state === state);
}

function matchesCity(facility, state, city) {
  if (!city) return true;

  const appears = getAppearsIn(facility);
  if (appears.some((x) => x.state === state && x.city === city)) return true;

  const address = String(facility?.address || "").toLowerCase();
  const cityWords = city.replace(/-/g, " ");
  return cityWords && address.includes(cityWords);
}

function pickPrimaryLocation(facility, state, cityFilter) {
  const appears = getAppearsIn(facility);

  if (cityFilter) {
    const exact = appears.find((x) => x.state === state && x.city === cityFilter);
    if (exact) return exact;
  }

  const stateMatch = appears.find((x) => x.state === state);
  if (stateMatch) return stateMatch;

  if (appears.length > 0) return appears[0];
  return { state, city: "" };
}

function buildMeta({ facility, state, city }) {
  const id = String(facility?.id || "").trim();
  const name = String(facility?.name || "Unnamed site").trim();
  const kind = typeLabel(facility?.type);
  const stateAbbrev = stateAbbrevFromSlug(state);
  const cityName = city ? titleCaseFromSlug(city) : "";

  const locationLabel = cityName
    ? `${cityName}, ${stateAbbrev}`
    : `${titleCaseFromSlug(state)}, ${stateAbbrev}`;

  const title = `${name} - ${kind} in ${locationLabel} | JunkScout`;
  const description =
    `Address, map, and source links for ${name}. Always confirm fees, hours, and accepted materials before visiting.`;

  const canonicalPath = `/facility/${id}/`;
  const canonicalUrl = `${BASE_URL}${canonicalPath}`;

  return {
    title,
    description,
    canonicalUrl,
    canonicalPath,
    ogTitle: title,
    ogDesc: description,
  };
}

function buildJsonLd({ facility, meta, state }) {
  const id = String(facility?.id || "").trim();
  const name = String(facility?.name || "Unnamed site").trim();
  const streetAddress = String(facility?.address || "").trim();
  const lat = typeof facility?.lat === "number" ? facility.lat : null;
  const lng = typeof facility?.lng === "number" ? facility.lng : null;

  const url = meta.canonicalUrl;
  const placeId = `${url}#place`;

  const place = {
    "@type": "Place",
    "@id": placeId,
    name,
    url,
    address: {
      "@type": "PostalAddress",
      addressRegion: stateAbbrevFromSlug(state),
      addressCountry: "US",
    },
  };

  if (streetAddress) place.address.streetAddress = streetAddress;
  if (lat !== null && lng !== null) {
    place.geo = {
      "@type": "GeoCoordinates",
      latitude: lat,
      longitude: lng,
    };
  }

  const graph = [
    place,
    {
      "@type": "WebPage",
      "@id": `${url}#webpage`,
      name: meta.title,
      description: meta.description,
      url,
      about: { "@id": placeId },
    },
  ];

  const json = JSON.stringify({ "@context": "https://schema.org", "@graph": graph }, null, 2);
  return `<script type="application/ld+json">\n${json}\n</script>`;
}

function injectHeadMeta(html, meta) {
  const tags = `
  <title>${escapeHtml(meta.title)}</title>
  <meta name="description" content="${escapeHtml(meta.description)}" />
  <link rel="canonical" href="${escapeHtml(meta.canonicalUrl)}" />

  <meta property="og:type" content="website" />
  <meta property="og:title" content="${escapeHtml(meta.ogTitle)}" />
  <meta property="og:description" content="${escapeHtml(meta.ogDesc)}" />
  <meta property="og:url" content="${escapeHtml(meta.canonicalUrl)}" />

  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content="${escapeHtml(meta.ogTitle)}" />
  <meta name="twitter:description" content="${escapeHtml(meta.ogDesc)}" />
`;

  return html.replace("</head>", `${tags}\n</head>`);
}

function injectJsonLd(html, jsonLdScript) {
  const markerRegex = /<!--\s*JSONLD:START\s*-->[\s\S]*?<!--\s*JSONLD:END\s*-->/;
  if (markerRegex.test(html)) {
    return html.replace(markerRegex, `<!-- JSONLD:START -->\n${jsonLdScript}\n<!-- JSONLD:END -->`);
  }
  return html.replace("</head>", `\n${jsonLdScript}\n</head>`);
}

function injectBodySeed(html, state, city) {
  return html.replace("<body>", `<body data-state="${escapeHtml(state)}" data-city="${escapeHtml(city)}">`);
}

function loadFacilityRecords() {
  const indexPath = path.join(FACILITIES_DIR, "index.json");
  const fromIndex = safeReadJson(indexPath, null);
  if (Array.isArray(fromIndex) && fromIndex.length > 0) {
    return fromIndex.filter((x) => x && typeof x === "object");
  }

  const files = fs
    .readdirSync(FACILITIES_DIR)
    .filter((f) => f.endsWith(".json") && f.toLowerCase() !== "index.json")
    .sort((a, b) => a.localeCompare(b));

  return files
    .map((f) => safeReadJson(path.join(FACILITIES_DIR, f), null))
    .filter((x) => x && typeof x === "object");
}

function run() {
  if (!fs.existsSync(FACILITIES_DIR)) {
    console.error(`Facilities directory not found: ${FACILITIES_DIR}`);
    process.exit(1);
  }

  let template = fs.readFileSync(TEMPLATE_PATH, "utf-8");
  template = template
    .replace(/<title>.*?<\/title>\s*/i, "")
    .replace(/<meta\s+name="description"[^>]*>\s*/i, "")
    .replace(/<link\s+rel="canonical"[^>]*>\s*/i, "");

  const facilities = loadFacilityRecords();
  if (facilities.length === 0) {
    console.error("No facility records found.");
    process.exit(1);
  }

  const filtered = facilities.filter((facility) => {
    const id = String(facility?.id || "").trim();
    if (!id) return false;
    if (!matchesState(facility, STATE_ARG)) return false;
    if (!matchesCity(facility, STATE_ARG, CITY_FILTER_ARG)) return false;
    return true;
  });

  if (filtered.length === 0) {
    const cityMsg = CITY_FILTER_ARG ? ` city=${CITY_FILTER_ARG}` : "";
    console.error(`No facility pages matched state=${STATE_ARG}${cityMsg}`);
    process.exit(1);
  }

  for (const facility of filtered) {
    const id = String(facility.id).trim();
    const loc = pickPrimaryLocation(facility, STATE_ARG, CITY_FILTER_ARG);
    const state = cleanSlug(loc.state || STATE_ARG) || STATE_ARG;
    const city = cleanSlug(loc.city || "");

    const meta = buildMeta({ facility, state, city });

    let outputHtml = template;
    outputHtml = injectHeadMeta(outputHtml, meta);
    outputHtml = injectJsonLd(outputHtml, buildJsonLd({ facility, meta, state }));
    outputHtml = injectBodySeed(outputHtml, state, city);

    const outDir = path.join(OUTPUT_BASE, "facility", id);
    const outFile = path.join(outDir, "index.html");

    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(outFile, outputHtml, "utf-8");

    console.log(`Wrote facility page: ${outFile}`);
  }

  console.log(`Generated ${filtered.length} facility page(s).`);
}

run();
