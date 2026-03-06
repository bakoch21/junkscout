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
const ALIAS_MANIFEST_PATH = path.join(FACILITIES_DIR, "_aliases.json");
const TEMPLATE_PATH = "facility-template.html";
const OUTPUT_BASE = ".";
const BASE_URL = "https://junkscout.io";
const CITY_DATA_STATES = ["texas", "california", "arizona", "georgia", "florida", "illinois", "north-carolina", "washington"];

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
  if (state === "arizona") return "AZ";
  if (state === "georgia") return "GA";
  if (state === "florida") return "FL";
  if (state === "illinois") return "IL";
  if (state === "north-carolina") return "NC";
  if (state === "washington") return "WA";
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

function toNum(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function isValidCoordPair(lat, lng) {
  if (lat === null || lng === null) return false;
  if (lat < -90 || lat > 90) return false;
  if (lng < -180 || lng > 180) return false;
  if (Math.abs(lat) < 0.000001 && Math.abs(lng) < 0.000001) return false;
  return true;
}

function getCoordsFromRecord(record) {
  const lat = toNum(record?.lat ?? record?.latitude);
  const lng = toNum(record?.lng ?? record?.lon ?? record?.longitude);
  if (!isValidCoordPair(lat, lng)) return { lat: null, lng: null };
  return { lat, lng };
}

function toRadians(deg) {
  return (deg * Math.PI) / 180;
}

function distanceMiles(lat1, lng1, lat2, lng2) {
  if (!isValidCoordPair(lat1, lng1) || !isValidCoordPair(lat2, lng2)) return null;

  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const earthRadiusMi = 3958.8;
  return earthRadiusMi * c;
}

function normalizeComparableText(value = "") {
  return cleanString(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function nearbyDedupKey(facility) {
  const name = normalizeComparableText(facility?.name || "");
  const address = normalizeComparableText(facility?.address || "");
  if (name && address) return `${name}|${address}`;
  if (name) return `name:${name}`;
  if (address) return `addr:${address}`;
  return `id:${cleanString(facility?.id || "")}`;
}

function facilitiesRepresentSamePlace(a, b) {
  const nameA = normalizeComparableText(a?.name || "");
  const nameB = normalizeComparableText(b?.name || "");
  if (!nameA || !nameB || nameA !== nameB) return false;

  const addressA = normalizeComparableText(a?.address || "");
  const addressB = normalizeComparableText(b?.address || "");
  if (addressA && addressB && addressA === addressB) return true;

  const coordsA = getCoordsFromRecord(a);
  const coordsB = getCoordsFromRecord(b);
  if (coordsA.lat !== null && coordsA.lng !== null && coordsB.lat !== null && coordsB.lng !== null) {
    const distanceMi = distanceMiles(coordsA.lat, coordsA.lng, coordsB.lat, coordsB.lng);
    if (Number.isFinite(distanceMi) && distanceMi <= 0.15) return true;
  }

  return false;
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

  const outCoords = getCoordsFromRecord(out);
  const nextCoords = getCoordsFromRecord(next);
  out.lat = outCoords.lat;
  out.lng = outCoords.lng;
  if (out.lat === null && nextCoords.lat !== null) out.lat = nextCoords.lat;
  if (out.lng === null && nextCoords.lng !== null) out.lng = nextCoords.lng;

  out.accepted_materials = mergeUniqueStringArrays(out.accepted_materials, next.accepted_materials);
  out.not_accepted = mergeUniqueStringArrays(out.not_accepted, next.not_accepted);
  out.appears_in = mergeAppearsIn(out.appears_in, next.appears_in);

  return out;
}

function facilityPreferenceScore(record) {
  let score = 0;
  const id = cleanString(record?.id || "");
  if (/^f_manual_/i.test(id)) score += 40;
  if (cleanString(record?.source || "")) score += 16;
  if (cleanString(record?.verified_date || "")) score += 12;
  if (cleanString(record?.phone || "")) score += 6;
  if (cleanString(record?.hours || "")) score += 6;
  if (cleanString(record?.fees || "")) score += 5;
  if (cleanString(record?.rules || "")) score += 5;
  if (cleanString(record?.address || "")) score += 8;
  if (cleanString(record?.website || "")) score += 4;

  const coords = getCoordsFromRecord(record);
  if (coords.lat !== null && coords.lng !== null) score += 4;

  score += Math.min(6, coerceArray(record?.accepted_materials).length);
  score += Math.min(4, coerceArray(record?.not_accepted).length);
  return score;
}

function collapseDuplicateFacilities(records) {
  const groups = [];
  const sorted = [...coerceArray(records)].sort((a, b) => {
    const scoreDiff = facilityPreferenceScore(b) - facilityPreferenceScore(a);
    if (scoreDiff !== 0) return scoreDiff;
    return cleanString(a?.id || "").localeCompare(cleanString(b?.id || ""));
  });

  for (const record of sorted) {
    const id = cleanString(record?.id || "");
    if (!id) continue;

    const group = groups.find((entry) => facilitiesRepresentSamePlace(record, entry.facility));
    if (!group) {
      groups.push({ facility: { ...record, id }, aliases: [] });
      continue;
    }

    group.facility = mergeFacilityRecords(group.facility, record);
    group.aliases.push({ ...record, id });
  }

  return {
    facilities: groups.map((group) => group.facility),
    aliasEntries: groups.flatMap((group) =>
      group.aliases.map((aliasRecord) => ({
        aliasId: cleanString(aliasRecord.id),
        aliasRecord,
        canonicalId: cleanString(group.facility?.id || ""),
        canonicalRecord: group.facility,
      }))
    ),
  };
}

function writeAliasManifest(aliasEntries) {
  const manifest = {};
  for (const entry of coerceArray(aliasEntries)) {
    if (!entry?.aliasId || !entry?.canonicalId || entry.aliasId === entry.canonicalId) continue;
    manifest[entry.aliasId] = entry.canonicalId;
  }
  fs.writeFileSync(ALIAS_MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, "utf-8");
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
  const stateAbbrev = stateAbbrevFromSlug(state);
  const cityName = city ? titleCaseFromSlug(city) : "";

  const locationLabel = cityName
    ? `${cityName}, ${stateAbbrev}`
    : `${titleCaseFromSlug(state)}`;

  const hasHoursFeesRules =
    cleanString(facility?.hours) ||
    cleanString(facility?.fees) ||
    cleanString(facility?.rules);

  const title = hasHoursFeesRules
    ? `${name} (${locationLabel}) - Hours, Fees, Rules | JunkScout`
    : `${name} (${locationLabel}) | JunkScout`;
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
  const { lat, lng } = getCoordsFromRecord(facility);

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
  const { lat, lng } = getCoordsFromRecord(facility);
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

function facilityAppearsInLocation(facility, state, city) {
  const stateSlug = cleanSlug(state || "");
  const citySlug = cleanSlug(city || "");
  if (!stateSlug || !citySlug) return false;

  const appears = getAppearsIn(facility);
  if (appears.some((x) => x.state === stateSlug && x.city === citySlug)) return true;

  const address = cleanString(facility?.address || "").toLowerCase();
  const cityWords = citySlug.replace(/-/g, " ");
  return cityWords ? address.includes(cityWords) : false;
}

function getFacilityDisplayCity(facility, state, preferredCity = "") {
  const stateSlug = cleanSlug(state || "");
  const preferred = cleanSlug(preferredCity || "");
  const appears = getAppearsIn(facility);

  if (preferred) {
    const exact = appears.find((x) => x.state === stateSlug && x.city === preferred);
    if (exact?.city) return titleCaseFromSlug(exact.city);
  }

  const stateMatch = appears.find((x) => x.state === stateSlug && x.city);
  if (stateMatch?.city) return titleCaseFromSlug(stateMatch.city);

  const anyCity = appears.find((x) => x.city);
  if (anyCity?.city) return titleCaseFromSlug(anyCity.city);

  return "";
}

function buildNearbyFacilitiesHtml({ facility, poolFacilities, state, city }) {
  const currentId = cleanString(facility?.id || "");
  const currentType = cleanSlug(facility?.type || "");
  const currentDedupeKey = nearbyDedupKey(facility);
  const currentNameNormalized = normalizeComparableText(facility?.name || "");
  const stateSlug = cleanSlug(state || "");
  const citySlug = cleanSlug(city || "");
  const currentCoords = getCoordsFromRecord(facility);
  const hasCurrentCoords = currentCoords.lat !== null && currentCoords.lng !== null;
  const maxNearbyDistanceMi = 75;
  const maxLinksTotal = 6;
  const maxFacilityLinks = citySlug ? maxLinksTotal - 1 : maxLinksTotal;

  function rankNearbyCandidate(a, b) {
    const aHasDistance = Number.isFinite(a.distanceMi);
    const bHasDistance = Number.isFinite(b.distanceMi);
    if (aHasDistance !== bHasDistance) return aHasDistance ? -1 : 1;
    if (aHasDistance && bHasDistance && a.distanceMi !== b.distanceMi) return a.distanceMi - b.distanceMi;
    if (a.sameCity !== b.sameCity) return a.sameCity ? -1 : 1;
    if (a.typeMatch !== b.typeMatch) return a.typeMatch ? -1 : 1;
    if (a.hasVerified !== b.hasVerified) return a.hasVerified ? -1 : 1;
    if (a.hasAddress !== b.hasAddress) return a.hasAddress ? -1 : 1;
    return a.name.localeCompare(b.name);
  }

  const deduped = new Map();
  for (const row of coerceArray(poolFacilities)) {
    const id = cleanString(row?.id || "");
    if (!id || id === currentId) continue;
    if (nearbyDedupKey(row) === currentDedupeKey) continue;
    if (facilitiesRepresentSamePlace(row, facility)) continue;

    const name = cleanString(row?.name || "Unnamed site");
    const sameCity = citySlug ? facilityAppearsInLocation(row, stateSlug, citySlug) : false;
    const sameState = matchesState(row, stateSlug);
    if (!sameCity && !sameState) continue;

    const rowCoords = getCoordsFromRecord(row);
    const distanceMi =
      hasCurrentCoords && rowCoords.lat !== null && rowCoords.lng !== null
        ? distanceMiles(currentCoords.lat, currentCoords.lng, rowCoords.lat, rowCoords.lng)
        : null;

    // Nearby should be practical: when we have coordinates, keep nearby distance;
    // if we cannot compute distance, keep only same-city options.
    if (hasCurrentCoords) {
      if (Number.isFinite(distanceMi) && distanceMi > maxNearbyDistanceMi) continue;
      if (!Number.isFinite(distanceMi) && !sameCity) continue;
    } else {
      if (!sameCity) continue;
    }

    const rowType = cleanSlug(row?.type || "");
    const typeMatch = Boolean(currentType && rowType && currentType === rowType);
    const hasVerified = Boolean(cleanString(row?.verified_date || ""));
    const hasAddress = Boolean(cleanString(row?.address || ""));
    const cityLabel = sameCity
      ? titleCaseFromSlug(citySlug)
      : getFacilityDisplayCity(row, stateSlug, citySlug);

    const candidate = {
      id,
      name,
      cityLabel,
      sameCity,
      distanceMi: Number.isFinite(distanceMi) ? distanceMi : null,
      typeMatch,
      hasVerified,
      hasAddress,
    };

    const dedupeKey = nearbyDedupKey(row);
    const existing = deduped.get(dedupeKey);
    if (!existing || rankNearbyCandidate(candidate, existing) < 0) {
      deduped.set(dedupeKey, candidate);
    }
  }

  const candidates = Array.from(deduped.values())
    .filter((x) => {
      const sameName = currentNameNormalized && normalizeComparableText(x.name) === currentNameNormalized;
      const sameSpot = Number.isFinite(x.distanceMi) && x.distanceMi <= 0.15;
      return !(sameName && sameSpot);
    })
    .sort(rankNearbyCandidate);
  const top = candidates.slice(0, maxFacilityLinks);

  const links = top
    .map((x) => {
      let label = x.name;
      if (x.cityLabel || Number.isFinite(x.distanceMi)) {
        const parts = [];
        if (x.cityLabel) parts.push(x.cityLabel);
        if (Number.isFinite(x.distanceMi)) parts.push(`${x.distanceMi.toFixed(1)} mi`);
        label = `${x.name} (${parts.join(", ")})`;
      }
      return `<a class="cityhub__pill" href="/facility/${encodeURIComponent(x.id)}/">${escapeHtml(label)}</a>`;
    });

  // Always keep one clear fallback back to the city directory when a city page exists.
  if (stateSlug && citySlug) {
    links.push(
      `<a class="cityhub__pill" href="/${escapeHtml(stateSlug)}/${escapeHtml(citySlug)}/">See all ${escapeHtml(titleCaseFromSlug(citySlug))} facilities</a>`
    );
  } else if (links.length === 0 && stateSlug) {
    links.push(
      `<a class="cityhub__pill" href="/${escapeHtml(stateSlug)}/">Browse ${escapeHtml(titleCaseFromSlug(stateSlug))} facilities</a>`
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

function injectServerRenderedFacilityContent(html, facility, poolFacilities, state, city) {
  const name = cleanString(facility?.name || "Unnamed site");
  const type = typeLabelDisplay(facility?.type);
  const address = cleanString(facility?.address || "Address not provided");
  const { lat, lng } = getCoordsFromRecord(facility);
  const mapsUrl = mapsUrlForFacility(facility);
  const sourceUrl = cleanString(facility?.source || facility?.osm_url || "");
  const websiteUrl = cleanString(facility?.website || "");
  const showSourceUrl = Boolean(sourceUrl && sourceUrl !== websiteUrl);

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
  if (showSourceUrl) {
    out = setAnchorHrefById(out, "facilitySource", sourceUrl);
    out = setAnchorVisibilityById(out, "facilitySource", true);
  }

  const cityPills = buildCityPillsHtml(facility);
  if (cityPills) out = replaceElementHtmlById(out, "facilityCities", cityPills);
  const nearbyFacilities = buildNearbyFacilitiesHtml({ facility, poolFacilities, state, city });
  if (nearbyFacilities) out = replaceElementHtmlById(out, "facilityNearby", nearbyFacilities);

  const verifiedHtml = buildServerRenderedVerifiedHtml(facility);
  if (verifiedHtml && out.includes("</p>")) {
    out = out.replace(/(<p id="facilityAbout"[\s\S]*?<\/p>)/i, `$1\n${verifiedHtml}`);
  }

  return out;
}

function buildAliasFacilityPage(aliasEntry) {
  const canonicalId = cleanString(aliasEntry?.canonicalId || "");
  const canonicalRecord = aliasEntry?.canonicalRecord || {};
  const canonicalPath = `/facility/${canonicalId}/`;
  const canonicalUrl = `${BASE_URL}${canonicalPath}`;
  const facilityName = cleanString(canonicalRecord?.name || "Facility");
  const title = `${facilityName} | JunkScout`;
  const description = `This facility page moved to ${canonicalUrl}.`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <meta name="robots" content="noindex,follow" />
  <link rel="canonical" href="${escapeHtml(canonicalUrl)}" />
  <meta http-equiv="refresh" content="0; url=${escapeHtml(canonicalPath)}" />
  <script>window.location.replace(${JSON.stringify(canonicalPath)});</script>
</head>
<body>
  <p>This facility page moved. If you are not redirected, <a href="${escapeHtml(canonicalPath)}">open the current facility page</a>.</p>
</body>
</html>
`;
}

function loadFacilityRecords() {
  if (!fs.existsSync(FACILITIES_DIR)) return { facilities: [], aliasEntries: [] };

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

  const collapsed = collapseDuplicateFacilities(Array.from(byId.values()));
  writeAliasManifest(collapsed.aliasEntries);
  return collapsed;
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

  const { facilities, aliasEntries } = loadFacilityRecords();
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

  const filteredAliases = aliasEntries.filter((entry) => {
    if (!entry?.aliasId || !entry?.canonicalId || entry.aliasId === entry.canonicalId) return false;

    const aliasMatchesState = matchesState(entry.aliasRecord, STATE_ARG) || matchesState(entry.canonicalRecord, STATE_ARG);
    if (!aliasMatchesState) return false;

    if (!CITY_FILTER_ARG) return true;
    return (
      matchesCity(entry.aliasRecord, STATE_ARG, CITY_FILTER_ARG) ||
      matchesCity(entry.canonicalRecord, STATE_ARG, CITY_FILTER_ARG)
    );
  });

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
    outputHtml = injectServerRenderedFacilityContent(outputHtml, facility, filtered, state, city);

    const outDir = path.join(OUTPUT_BASE, "facility", id);
    const outFile = path.join(outDir, "index.html");

    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(outFile, outputHtml, "utf-8");

    console.log(`Wrote facility page: ${outFile}`);
  }

  for (const aliasEntry of filteredAliases) {
    const outDir = path.join(OUTPUT_BASE, "facility", aliasEntry.aliasId);
    const outFile = path.join(outDir, "index.html");

    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(outFile, buildAliasFacilityPage(aliasEntry), "utf-8");

    console.log(`Wrote facility alias page: ${outFile}`);
  }

  console.log(`Generated ${filtered.length} facility page(s) and ${filteredAliases.length} alias page(s).`);
}

run();
