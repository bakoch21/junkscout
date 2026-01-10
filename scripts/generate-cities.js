/**
 * generate-cities.js
 *
 * Fetches dump / landfill / recycling locations from OpenStreetMap (Nominatim + Overpass)
 * and writes static JSON files to /data/{state}/{city}.json
 */

const fs = require("fs");
const path = require("path");

const CITY_LIST_PATH = "./scripts/cities-texas.json";
const OUTPUT_BASE = "./data";

// Overpass endpoint (more reliable than overpass-api.de for big queries)
const OVERPASS_URL = "https://overpass.kumi.systems/api/interpreter";
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function cleanStr(s) {
  return (s || "").toString().trim();
}

function hasRealName(name) {
  const n = cleanStr(name).toLowerCase();
  if (!n) return false;
  if (n === "unnamed site") return false;
  if (n === "unnamed") return false;

  // Optional: filter generic junk names (toggle if you want)
  if (n === "recycle facility") return false;
  if (n === "recycling") return false;
  if (n === "landfill") return false;
  if (n === "transfer station") return false;

  return true;
}

function hasUsefulAddress(address) {
  const a = cleanStr(address);
  if (!a) return false;
  // Most “real” addresses contain a street number
  return /\d/.test(a);
}

// Build Overpass query using bbox: south, west, north, east
function OVERPASS_QUERY_BBOX(south, west, north, east) {
  return `
[out:json][timeout:25];
(
  nwr["amenity"="waste_transfer_station"](${south},${west},${north},${east});
  nwr["amenity"="recycling"](${south},${west},${north},${east});
  nwr["landuse"="landfill"](${south},${west},${north},${east});
);
out center tags;
`;
}

function normalizeType(tags = {}) {
  if (tags.landuse === "landfill") return "landfill";
  if (tags.amenity === "waste_transfer_station") return "transfer_station";
  if (tags.amenity === "recycling") return "recycling";
  return "other";
}

function pickLatLng(el) {
  // node has el.lat/el.lon, way/relation has el.center.lat/el.center.lon when using `out center`
  if (typeof el.lat === "number" && typeof el.lon === "number") {
    return { lat: el.lat, lng: el.lon };
  }
  if (
    el.center &&
    typeof el.center.lat === "number" &&
    typeof el.center.lon === "number"
  ) {
    return { lat: el.center.lat, lng: el.center.lon };
  }
  return { lat: null, lng: null };
}

async function geocodeToBbox(query) {
  const url =
    `${NOMINATIM_URL}?format=json&limit=1&q=` + encodeURIComponent(query);

  const res = await fetch(url, {
    headers: {
      "User-Agent": "JunkScout/1.0 (local script)",
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Nominatim failed (${res.status}): ${body.slice(0, 300)}`);
  }

  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error(`Nominatim returned no results for: ${query}`);
  }

  // boundingbox is [south, north, west, east] as strings
  const bb = data[0].boundingbox;
  const south = parseFloat(bb[0]);
  const north = parseFloat(bb[1]);
  const west = parseFloat(bb[2]);
  const east = parseFloat(bb[3]);

  return { south, west, north, east };
}

async function fetchOverpassByBbox(bbox) {
  const query = OVERPASS_QUERY_BBOX(bbox.south, bbox.west, bbox.north, bbox.east);

  const res = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      "User-Agent": "JunkScout/1.0 (local script)",
    },
    body: `data=${encodeURIComponent(query)}`,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Overpass failed (${res.status}): ${body.slice(0, 300)}`);
  }

  return res.json();
}

// Retry wrapper for Overpass (504/429/timeouts happen a lot on big cities)
async function fetchOverpassWithRetry(bbox, tries = 4) {
  let lastErr;

  for (let i = 1; i <= tries; i++) {
    try {
      return await fetchOverpassByBbox(bbox);
    } catch (err) {
      lastErr = err;
      const msg = err?.message || String(err);

      const retryable =
        msg.includes("504") ||
        msg.includes("429") ||
        msg.toLowerCase().includes("timeout");

      if (!retryable || i === tries) throw err;

      const wait = 1500 * i;
      console.log(
        `   ⚠️ Overpass hiccup (${i}/${tries}). Waiting ${wait}ms then retrying...`
      );
      await sleep(wait);
    }
  }

  throw lastErr;
}

async function run() {
  const cities = JSON.parse(fs.readFileSync(CITY_LIST_PATH, "utf-8"));

  for (const entry of cities) {
    const { state, city, query } = entry;

    console.log(`\n📍 Fetching ${query}...`);

    try {
      const bbox = await geocodeToBbox(query);
      const json = await fetchOverpassWithRetry(bbox);

      const elements = Array.isArray(json.elements) ? json.elements : [];

      const results = elements
        .map((el) => {
          const { lat, lng } = pickLatLng(el);

          const website =
            el.tags?.website ||
            el.tags?.["contact:website"] ||
            el.tags?.["url"] ||
            null;

          const addressParts = [
            el.tags?.["addr:housenumber"],
            el.tags?.["addr:street"],
            el.tags?.["addr:city"],
            el.tags?.["addr:state"],
            el.tags?.["addr:postcode"],
          ].filter(Boolean);

          const address = addressParts.join(" ");
          const rawName = el.tags?.name || "";

          return {
            name: cleanStr(rawName),
            type: normalizeType(el.tags),
            address,
            lat,
            lng,
            website,
            osm_url: `https://www.openstreetmap.org/${el.type}/${el.id}`,
          };
        })
        .filter((r) => r.lat && r.lng)
        // 🔥 핵심: Unnamed junk removal
        .filter((r) => {
          const okName = hasRealName(r.name);
          const okAddr = hasUsefulAddress(r.address);
          const okWeb = !!r.website;
          return okName || okAddr || okWeb;
        });

      const outDir = path.join(OUTPUT_BASE, state);
      const outFile = path.join(outDir, `${city}.json`);

      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(outFile, JSON.stringify(results, null, 2));

      console.log(`✅ Wrote ${results.length} locations → ${outFile}`);
    } catch (err) {
      console.error(`❌ Failed for ${city}`);
      console.error(err && err.message ? err.message : err);
    }

    await sleep(2500);
  }
}

run().catch((e) => {
  console.error("Fatal error:");
  console.error(e);
});
