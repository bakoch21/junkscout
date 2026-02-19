/**
 * scripts/build-city-json-from-facilities.js
 *
 * Builds:
 *  1) /data/texas/{city-slug}.json  (city locations list, derived from facilities)
 *  2) /scripts/cities-texas.json   (city index list used by generate-city-pages.js)
 *
 * Source of truth: /data/facilities/*.json
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const FACILITIES_DIR = path.join(".", "data", "facilities");
const OUT_STATE_DIR = path.join(".", "data", "texas");
const OUT_CITY_LIST = path.join(".", "scripts", "cities-texas.json");

/** ---------- helpers ---------- */

function cleanStr(s) {
  return (s || "").toString().trim();
}

function slugifyCity(city) {
  return cleanStr(city)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function hashId(input) {
  return crypto.createHash("sha1").update(String(input)).digest("hex").slice(0, 12);
}

/**
 * Extract "City" from typical address tail patterns like:
 *   "... Amarillo TX 79106"
 *   "... HOUSTON TX 77078-1234"
 */
function extractCityFromAddress(address = "") {
  const a = String(address).trim();
  if (!a) return "";

  const m = a.match(
    /(?:^|\s)([A-Za-z.'-]+(?:\s+[A-Za-z.'-]+)*)\s+TX\s+\d{5}(?:-\d{4})?\s*$/i
  );
  if (!m) return "";

  return cleanStr(m[1]);
}

/**
 * Bad “city” patterns we never want to treat as a city.
 * This is what caused the screenshot mess: road names, “city limits”, “intersection”, etc.
 */
function isClearlyNotACity(cityRaw = "") {
  const s = cleanStr(cityRaw);
  if (!s) return true;

  // Too long for a city label
  if (s.length > 32) return true;

  // Street-ish tokens or weird phrases (expanded to catch "Mi ...", "Of ...", directions, etc.)
  const badTokens =
    /\b(in|mi|mile|miles|nw|ne|se|sw|of|on|at|and|rd|road|st|street|ave|avenue|dr|drive|blvd|boulevard|hwy|highway|fwy|freeway|ln|lane|pkwy|parkway|loop|fm|cr|county|intersection|limits|landfill|transfer|station|site|facility|easement|unimproved)\b/i;
  if (badTokens.test(s)) return true;

  // Sentences / directions / “Turn right at...”
  const sentencey = /\b(turn|left|right|go|before|after|dead end|locked gate)\b/i;
  if (sentencey.test(s)) return true;

  // Very unlikely city names that are just letters/shortcodes
  if (/^[A-Z]{1,3}$/.test(s)) return true;

  return false;
}

/**
 * If someone writes “S Brownwood” / “N Houston” etc, treat it as Brownwood/Houston.
 * We do this BEFORE slugify.
 */
function stripDirectionalPrefix(cityRaw = "") {
  let s = cleanStr(cityRaw);

  // Matches: "S Brownwood", "N. Houston", "South Austin", etc.
  s = s.replace(/^(n|s|e|w)\.?\s+/i, "");
  s = s.replace(/^(north|south|east|west)\s+/i, "");

  return cleanStr(s);
}

/**
 * Salvage a “city” string when the extracted chunk contains junk like:
 *   "Of Fountain View Houston" -> "Houston"
 *   "Mi Nw Of Dalhart Dalhart" -> "Dalhart"
 *
 * Strategy: try last word, then last 2 words, only if they look like real cities.
 */
function salvageCityFromJunk(cityRaw = "") {
  const s = cleanStr(cityRaw);
  if (!s) return "";

  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return "";

  const last1 = parts.slice(-1).join(" ");
  const last2 = parts.slice(-2).join(" ");

  const c1 = stripDirectionalPrefix(last1);
  if (c1 && !isClearlyNotACity(c1)) return c1;

  const c2 = stripDirectionalPrefix(last2);
  if (c2 && !isClearlyNotACity(c2)) return c2;

  return "";
}

/**
 * Pick a plausible city name from a facility object.
 * Priority:
 *  1) appears_in mapping if present
 *  2) parse from address
 *
 * If the parsed city chunk looks junky, salvage the last word (often the real city).
 */
function pickFacilityCity(fac) {
  // 1) If already mapped to a city, trust that
  if (Array.isArray(fac.appears_in) && fac.appears_in.length) {
    const tx = fac.appears_in.find((x) => x && x.state === "texas" && x.city);
    if (tx && cleanStr(tx.city)) return cleanStr(tx.city);
  }

  // 2) Parse from address tail
  const cityChunk = extractCityFromAddress(fac.address);
  if (!cityChunk) return "";

  // If it looks junky, try to salvage a real city (usually last token)
  if (isClearlyNotACity(cityChunk)) {
    const salvaged = salvageCityFromJunk(cityChunk);
    if (salvaged) return salvaged;
  }

  return cityChunk;
}

function pickState(f) {
  // Your facility JSONs largely don't carry a state; default TX.
  return cleanStr(f.state) || cleanStr(f.address_state) || "TX";
}

function pickLat(f) {
  return typeof f.lat === "number" ? f.lat : typeof f.latitude === "number" ? f.latitude : null;
}

function pickLng(f) {
  return typeof f.lng === "number"
    ? f.lng
    : typeof f.lon === "number"
      ? f.lon
      : typeof f.longitude === "number"
        ? f.longitude
        : null;
}

function buildAddress(f) {
  const full =
    cleanStr(f.address) || cleanStr(f.full_address) || cleanStr(f.street_address);

  if (full) return full;

  const parts = [cleanStr(f.street), cleanStr(f.city), cleanStr(f.state), cleanStr(f.zip)].filter(Boolean);
  return parts.join(", ");
}

function normalizeFacilityToCityLocation(f) {
  const name = cleanStr(f.name) || cleanStr(f.facility_name) || "Facility";
  const state = pickState(f);
  const lat = pickLat(f);
  const lng = pickLng(f);

  // Must have coords
  if (lat == null || lng == null) return null;

  // City: from appears_in or address
  let city = pickFacilityCity(f);
  city = stripDirectionalPrefix(city);

  // Must have city + must look like a city
  if (!city || isClearlyNotACity(city)) return null;

  // Only Texas
  const st = cleanStr(state).toUpperCase();
  if (st && st !== "TX" && st !== "TEXAS") return null;

  const address = buildAddress(f);
  const website = cleanStr(f.website) || cleanStr(f.url) || "";
  const sourceUrl = cleanStr(f.source_url) || cleanStr(f.source) || "";

  const facility_id =
    cleanStr(f.facility_id) ||
    cleanStr(f.id) ||
    `f_${hashId(`${name}|${address}|${lat}|${lng}`)}`;

  return {
    facility_id,
    name,
    type: cleanStr(f.type) || "msw_facility",
    address,
    city,
    state: "TX",
    lat,
    lng,
    website: website || null,
    source: sourceUrl || null,
  };
}

function normalizeKeyText(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function cityDedupSignature(normalized) {
  const name = normalizeKeyText(normalized?.name);
  const address = normalizeKeyText(normalized?.address);
  const type = normalizeKeyText(normalized?.type || "msw_facility");
  if (name && address) return `na:${name}|${address}|${type}`;

  const lat = typeof normalized?.lat === "number" ? normalized.lat.toFixed(4) : "";
  const lng = typeof normalized?.lng === "number" ? normalized.lng.toFixed(4) : "";
  if (name && lat && lng) return `nl:${name}|${lat}|${lng}|${type}`;

  return "";
}

function readAllFacilities() {
  if (!fs.existsSync(FACILITIES_DIR)) {
    throw new Error(`Missing facilities dir: ${FACILITIES_DIR}`);
  }

  const files = fs.readdirSync(FACILITIES_DIR).filter((f) => f.endsWith(".json"));
  const facilities = [];

  for (const file of files) {
    const full = path.join(FACILITIES_DIR, file);
    try {
      const parsed = JSON.parse(fs.readFileSync(full, "utf-8"));
      if (Array.isArray(parsed)) {
        for (const row of parsed) {
          if (row && typeof row === "object") facilities.push(row);
        }
      } else if (parsed && typeof parsed === "object") {
        facilities.push(parsed);
      }
    } catch (e) {
      console.log(`⚠️ Skipping unreadable JSON: ${full}`);
    }
  }

  return facilities;
}

/** ---------- main ---------- */

function run() {
  console.log("\n🏗️ Building city JSON from facilities...");

  const facilities = readAllFacilities();
  const cityMap = new Map(); // slug -> { cityName, items: [], seenIds:Set, seenSignatures:Set }

  let skippedBad = 0;

  for (const f of facilities) {
    const normalized = normalizeFacilityToCityLocation(f);
    if (!normalized) {
      skippedBad++;
      continue;
    }

    const cityName = cleanStr(normalized.city);
    const slug = slugifyCity(cityName);
    if (!slug) {
      skippedBad++;
      continue;
    }

    if (!cityMap.has(slug)) {
      cityMap.set(slug, {
        cityName,
        items: [],
        seenIds: new Set(),
        seenSignatures: new Set(),
      });
    }

    const bucket = cityMap.get(slug);
    const idKey = cleanStr(normalized.facility_id).toLowerCase();
    const signature = cityDedupSignature(normalized);
    if (idKey && bucket.seenIds.has(idKey)) continue;
    if (signature && bucket.seenSignatures.has(signature)) continue;
    if (idKey) bucket.seenIds.add(idKey);
    if (signature) bucket.seenSignatures.add(signature);

    bucket.items.push({
      name: normalized.name,
      type: normalized.type,
      address: normalized.address,
      lat: normalized.lat,
      lng: normalized.lng,
      website: normalized.website,
      source: normalized.source,
      facility_id: normalized.facility_id,
    });
  }

  // Write per-city JSON
  fs.mkdirSync(OUT_STATE_DIR, { recursive: true });

  for (const [slug, bucket] of cityMap.entries()) {
    const outFile = path.join(OUT_STATE_DIR, `${slug}.json`);
    bucket.items.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    fs.writeFileSync(outFile, JSON.stringify(bucket.items, null, 2));
  }

  // Write cities list for page gen
  const cityList = Array.from(cityMap.entries())
    .map(([slug, bucket]) => ({
      state: "texas",
      city: slug,
      query: `${bucket.cityName}, Texas, USA`,
    }))
    .sort((a, b) => a.query.localeCompare(b.query));

  fs.mkdirSync(path.dirname(OUT_CITY_LIST), { recursive: true });
  fs.writeFileSync(OUT_CITY_LIST, JSON.stringify(cityList, null, 2));

  console.log(`✅ Built ${cityList.length} Texas cities`);
  console.log(`ℹ️ Skipped ${skippedBad} facilities (bad city/address)\n`);
}

run();
