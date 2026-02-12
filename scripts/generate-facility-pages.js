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
const CITY_DATA_STATES = ["texas", "california"];

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

function typeLabelDisplay(type = "") {
  const t = String(type || "").toLowerCase();
  if (t === "landfill") return "Landfill";
  if (t === "transfer_station") return "Transfer station";
  if (t === "recycling") return "Recycling center";
  if (t === "hazardous_waste") return "Hazardous waste site";
  return "Drop-off site";
}

function coerceArray(value) {
  return Array.isArray(value) ? value : [];
}

function cleanString(value) {
  return String(value || "").trim();
}

function mergeUniqueStringArrays(a = [], b = []) {
  const out = [];
  const seen = new Set();

  for (const val of [...coerceArray(a), ...coerceArray(b)]) {
    const s = cleanString(val);
    if (!s) continue;
    const k = s.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }

  return out;
}

function mergeAppearsIn(a = [], b = []) {
  const out = [];
  const seen = new Set();

  for (const row of [...coerceArray(a), ...coerceArray(b)]) {
    const state = cleanSlug(row?.state || "");
    const city = cleanSlug(row?.city || "");
    if (!state && !city) continue;
    const key = `${state}/${city}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ state, city });
  }

  return out;
}

function mergeFacilityRecords(base, incoming) {
  const out = { ...base };
  const next = incoming || {};

  const preferWhenMissing = [
    "name",
    "slug",
    "type",
    "type_label",
    "address",
    "website",
    "osm_url",
    "source",
    "phone",
    "hours",
    "fees",
    "rules",
    "verified_date",
  ];

  for (const key of preferWhenMissing) {
    if (!cleanString(out[key]) && cleanString(next[key])) out[key] = next[key];
  }

  const lat = typeof out.lat === "number" ? out.lat : null;
  const lng = typeof out.lng === "number" ? out.lng : null;
  if (lat === null && typeof next.lat === "number") out.lat = next.lat;
  if (lng === null && typeof next.lng === "number") out.lng = next.lng;

  out.accepted_materials = mergeUniqueStringArrays(out.accepted_materials, next.accepted_materials);
  out.not_accepted = mergeUniqueStringArrays(out.not_accepted, next.not_accepted);
  out.appears_in = mergeAppearsIn(out.appears_in, next.appears_in);

  return out;
}

function readCityReferencedFacilityIds() {
  const states =
    STATE_ARG && STATE_ARG !== "all"
      ? [STATE_ARG]
      : CITY_DATA_STATES;

  const ids = new Set();
  for (const state of states) {
    const dataDir = path.join("data", state);
    if (!fs.existsSync(dataDir)) continue;

    const files = fs
      .readdirSync(dataDir)
      .filter((f) => f.toLowerCase().endsWith(".json"))
      .filter((f) => !f.startsWith("_"))
      .filter((f) => f.toLowerCase() !== "cities.json");

    for (const file of files) {
      const parsed = safeReadJson(path.join(dataDir, file), null);
      const rows = Array.isArray(parsed)
        ? parsed
        : (parsed && typeof parsed === "object" && Array.isArray(parsed.facilities) ? parsed.facilities : []);

      for (const row of rows) {
        const id = cleanString(row?.facility_id || row?.id || "");
        if (id) ids.add(id);
      }
    }
  }

  return ids;
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
  if (state === "all") return true;
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

function mapsUrlForFacility(facility) {
  const lat = typeof facility?.lat === "number" ? facility.lat : null;
  const lng = typeof facility?.lng === "number" ? facility.lng : null;
  const address = cleanString(facility?.address || "");
  const name = cleanString(facility?.name || "");

  if (lat !== null && lng !== null) {
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  }
  if (address || name) {
    return `https://www.google.com/maps/search/${encodeURIComponent(`${name} ${address}`.trim())}`;
  }
  return "https://www.google.com/maps";
}

function replaceElementTextById(html, id, text) {
  const regex = new RegExp(`(<[^>]*id="${id}"[^>]*>)[\\s\\S]*?(<\\/[^>]+>)`, "i");
  if (!regex.test(html)) return html;
  return html.replace(regex, `$1${escapeHtml(text)}$2`);
}

function replaceElementHtmlById(html, id, innerHtml) {
  const regex = new RegExp(`(<[^>]*id="${id}"[^>]*>)[\\s\\S]*?(<\\/[^>]+>)`, "i");
  if (!regex.test(html)) return html;
  return html.replace(regex, `$1${innerHtml}$2`);
}

function setAnchorHrefById(html, id, href) {
  const hrefRegex = new RegExp(`(<a[^>]*id="${id}"[^>]*href=")[^"]*(")`, "i");
  if (!hrefRegex.test(html)) return html;
  return html.replace(hrefRegex, `$1${escapeHtml(href)}$2`);
}

function setAnchorVisibilityById(html, id, visible) {
  const styleRegex = new RegExp(`(<a[^>]*id="${id}"[^>]*style=")[^"]*(")`, "i");
  if (styleRegex.test(html)) {
    return html.replace(styleRegex, `$1display:${visible ? "inline" : "none"}$2`);
  }
  return html;
}

function buildCityPillsHtml(facility) {
  const appears = getAppearsIn(facility);
  if (!appears.length) return "";

  const seen = new Set();
  const links = [];
  for (const row of appears) {
    const state = cleanSlug(row?.state || "");
    const city = cleanSlug(row?.city || "");
    if (!state || !city) continue;
    const key = `${state}/${city}`;
    if (seen.has(key)) continue;
    seen.add(key);
    links.push(
      `<a class="cityhub__pill" href="/${escapeHtml(state)}/${escapeHtml(city)}/">${escapeHtml(titleCaseFromSlug(city))}</a>`
    );
  }

  return links.join("");
}

function buildServerRenderedVerifiedHtml(facility) {
  const hours = cleanString(facility?.hours || "");
  const fees = cleanString(facility?.fees || "");
  const rules = cleanString(facility?.rules || "");
  const verified = cleanString(facility?.verified_date || "");
  const source = cleanString(facility?.source || facility?.osm_url || "");
  const accepted = coerceArray(facility?.accepted_materials).map((x) => cleanString(x)).filter(Boolean);
  const notAccepted = coerceArray(facility?.not_accepted).map((x) => cleanString(x)).filter(Boolean);

  const hasDetails = hours || fees || rules || verified || source || accepted.length > 0 || notAccepted.length > 0;
  if (!hasDetails) return "";

  return `
<div id="verifiedDetails">
  <section class="seo-copy" aria-label="Verified facility details" style="margin-top:18px">
    <h2>Verified facility details</h2>
    ${verified ? `<p class="muted" style="margin-top:6px">Verified: ${escapeHtml(verified)}</p>` : ""}
    ${hours ? `<div style="margin-top:10px"><strong>Hours:</strong> ${escapeHtml(hours)}</div>` : ""}
    ${fees ? `<div style="margin-top:8px"><strong>Fees:</strong> ${escapeHtml(fees)}</div>` : ""}
    ${rules ? `<div style="margin-top:8px"><strong>Rules:</strong> ${escapeHtml(rules)}</div>` : ""}
    ${
      accepted.length
        ? `<div style="margin-top:10px"><strong>Accepted:</strong><ul style="margin:6px 0 0 18px">${accepted
            .map((x) => `<li>${escapeHtml(x)}</li>`)
            .join("")}</ul></div>`
        : ""
    }
    ${
      notAccepted.length
        ? `<div style="margin-top:10px"><strong>Not accepted:</strong><ul style="margin:6px 0 0 18px">${notAccepted
            .map((x) => `<li>${escapeHtml(x)}</li>`)
            .join("")}</ul></div>`
        : ""
    }
    ${
      source
        ? `<div style="margin-top:12px"><a class="link" href="${escapeHtml(source)}" target="_blank" rel="noopener">Verified source</a></div>`
        : ""
    }
  </section>
</div>
`.trim();
}

function injectServerRenderedFacilityContent(html, facility) {
  const name = cleanString(facility?.name || "Unnamed site");
  const type = typeLabelDisplay(facility?.type);
  const address = cleanString(facility?.address || "Address not provided");
  const lat = typeof facility?.lat === "number" ? facility.lat : null;
  const lng = typeof facility?.lng === "number" ? facility.lng : null;
  const mapsUrl = mapsUrlForFacility(facility);
  const sourceUrl = cleanString(facility?.source || facility?.osm_url || "");
  const websiteUrl = cleanString(facility?.website || "");

  let out = html;
  out = replaceElementTextById(out, "facilityKicker", type);
  out = replaceElementTextById(out, "facilityTitle", name);
  out = replaceElementTextById(
    out,
    "facilitySubhead",
    `${type} in the area. Confirm hours, fees, and accepted materials before visiting.`
  );
  out = replaceElementTextById(out, "facilityAddress", address);
  out = replaceElementTextById(out, "facilityCoords", lat !== null && lng !== null ? `Coordinates: ${lat}, ${lng}` : "");
  out = replaceElementTextById(
    out,
    "facilityAbout",
    `This location is listed as a ${type.toLowerCase()}. Rules, residency requirements, and fees vary by facility. Always confirm details directly before visiting.`
  );

  out = setAnchorHrefById(out, "facilityDirections", mapsUrl);
  out = setAnchorHrefById(out, "facilityCta", mapsUrl);

  if (websiteUrl) {
    out = setAnchorHrefById(out, "facilityWebsite", websiteUrl);
    out = setAnchorVisibilityById(out, "facilityWebsite", true);
  }
  if (sourceUrl) {
    out = setAnchorHrefById(out, "facilitySource", sourceUrl);
    out = setAnchorVisibilityById(out, "facilitySource", true);
  }

  const cityPills = buildCityPillsHtml(facility);
  if (cityPills) out = replaceElementHtmlById(out, "facilityCities", cityPills);

  const verifiedHtml = buildServerRenderedVerifiedHtml(facility);
  if (verifiedHtml && out.includes("</p>")) {
    out = out.replace(/(<p id="facilityAbout"[\s\S]*?<\/p>)/i, `$1\n${verifiedHtml}`);
  }

  return out;
}

function loadFacilityRecords() {
  if (!fs.existsSync(FACILITIES_DIR)) return [];

  const byId = new Map();

  function upsert(record) {
    const id = String(record?.id || "").trim();
    if (!id) return;

    if (!byId.has(id)) {
      byId.set(id, { ...record, id });
      return;
    }
    byId.set(id, mergeFacilityRecords(byId.get(id), record));
  }

  const indexPath = path.join(FACILITIES_DIR, "index.json");
  const fromIndex = safeReadJson(indexPath, null);
  if (Array.isArray(fromIndex) && fromIndex.length > 0) {
    fromIndex
      .filter((x) => x && typeof x === "object")
      .forEach((record) => upsert(record));
  }

  const manualFiles = fs
    .readdirSync(FACILITIES_DIR)
    .filter((f) => /^f_manual_.*\.json$/i.test(f))
    .sort((a, b) => a.localeCompare(b));

  manualFiles
    .map((f) => safeReadJson(path.join(FACILITIES_DIR, f), null))
    .filter((x) => x && typeof x === "object")
    .forEach((record) => upsert(record));

  const referencedIds = readCityReferencedFacilityIds();
  for (const id of referencedIds) {
    if (byId.has(id)) continue;
    const fullPath = path.join(FACILITIES_DIR, `${id}.json`);
    const parsed = safeReadJson(fullPath, null);
    if (parsed && typeof parsed === "object") upsert(parsed);
  }

  if (byId.size === 0) {
    const allFiles = fs
      .readdirSync(FACILITIES_DIR)
      .filter((f) => f.endsWith(".json") && f.toLowerCase() !== "index.json")
      .sort((a, b) => a.localeCompare(b));

    allFiles
      .map((f) => safeReadJson(path.join(FACILITIES_DIR, f), null))
      .filter((x) => x && typeof x === "object")
      .forEach((record) => upsert(record));
  }

  return Array.from(byId.values());
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
    outputHtml = injectServerRenderedFacilityContent(outputHtml, facility);

    const outDir = path.join(OUTPUT_BASE, "facility", id);
    const outFile = path.join(outDir, "index.html");

    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(outFile, outputHtml, "utf-8");

    console.log(`Wrote facility page: ${outFile}`);
  }

  console.log(`Generated ${filtered.length} facility page(s).`);
}

run();
