// scripts/geocode-city.js
// Usage: node scripts/geocode-city.js data/manual/texas/houston.json

const fs = require("fs/promises");
const path = require("path");

const CACHE_PATH = path.resolve(".geocode-cache.json");

// Census Geocoder docs: onelineaddress endpoint
// https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?... :contentReference[oaicite:2]{index=2}
const CENSUS_ENDPOINT =
  "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress";

function looksGeocodableAddress(addr) {
  if (!addr) return false;
  const s = String(addr).toLowerCase();
  if (s.includes("n/a")) return false;
  if (s.includes("check")) return false;
  if (s.includes("varies")) return false;
  if (s.includes("area (")) return false;
  // basic: must contain a number and a comma
  return /\d/.test(s) && s.includes(",");
}

async function loadCache() {
  try {
    const raw = await fs.readFile(CACHE_PATH, "utf8");
    const json = JSON.parse(raw);
    return json && typeof json === "object" ? json : {};
  } catch {
    return {};
  }
}

async function saveCache(cache) {
  await fs.writeFile(CACHE_PATH, JSON.stringify(cache, null, 2), "utf8");
}

async function geocodeCensus(address) {
  const params = new URLSearchParams({
    address,
    benchmark: "Public_AR_Current",
    format: "json",
  });

  const url = `${CENSUS_ENDPOINT}?${params.toString()}`;
  const res = await fetch(url, {
    headers: {
      // not required, but nice to be explicit
      "Accept": "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Census ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();

  const matches = data?.result?.addressMatches || [];
  if (!matches.length) return null;

  // Take best match
  const m = matches[0];
  const coords = m?.coordinates;
  if (!coords || typeof coords.x !== "number" || typeof coords.y !== "number") return null;

  // Census returns { x: lon, y: lat }
  return { lat: coords.y, lng: coords.x, match: m?.matchedAddress || "" };
}

async function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error("Usage: node scripts/geocode-city.js <path-to-city-json>");
    process.exit(1);
  }

  const absIn = path.resolve(inputPath);
  const raw = await fs.readFile(absIn, "utf8");
  const cityObj = JSON.parse(raw);

  if (!cityObj || !Array.isArray(cityObj.facilities)) {
    throw new Error("Expected JSON with a top-level { facilities: [...] }");
  }

  const cache = await loadCache();

  let geocodedCount = 0;
  let skipped = 0;

  const facilities = [];
  for (const f of cityObj.facilities) {
    const addr = f.address || "";
    const key = `${f.name || ""}||${addr}`.trim();

    if (!looksGeocodableAddress(addr)) {
      facilities.push({ ...f });
      skipped++;
      continue;
    }

    if (cache[key]) {
      facilities.push({ ...f, ...cache[key] });
      if (cache[key].lat && cache[key].lng) geocodedCount++;
      continue;
    }

    try {
      const hit = await geocodeCensus(addr);
      if (hit) {
        cache[key] = { lat: hit.lat, lng: hit.lng, geocode_match: hit.match, geocode_source: "census" };
        facilities.push({ ...f, ...cache[key] });
        geocodedCount++;
      } else {
        cache[key] = { geocode_source: "census", geocode_error: "no_match" };
        facilities.push({ ...f });
      }
    } catch (e) {
      cache[key] = { geocode_source: "census", geocode_error: String(e.message || e) };
      facilities.push({ ...f });
    }

    // Be polite anyway: tiny pacing
    await new Promise((r) => setTimeout(r, 250));
  }

  const outObj = { ...cityObj, facilities };
  const outPath = absIn.replace(/\.json$/i, ".geocoded.json");
  await fs.writeFile(outPath, JSON.stringify(outObj, null, 2), "utf8");
  await saveCache(cache);

  console.log(`✅ Geocoded: ${geocodedCount}`);
  console.log(`↷ Skipped (non-address/ambiguous): ${skipped}`);
  console.log(`📄 Output: ${outPath}`);
  console.log(`🧠 Cache: ${CACHE_PATH}`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
