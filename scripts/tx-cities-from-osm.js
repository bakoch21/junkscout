const fs = require("fs");

const input = "data/tx-osm-waste.json";
const raw = JSON.parse(fs.readFileSync(input, "utf8"));

function getLatLon(el) {
  if (el.type === "node") return { lat: el.lat, lon: el.lon };
  if (el.center) return { lat: el.center.lat, lon: el.center.lon };
  return null;
}

function normCity(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\w\s-]/g, "");
}

function titleCase(slug) {
  return slug
    .split(/[\s-]+/)
    .filter(Boolean)
    .map(w => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

// Best-effort city extraction from tags (OSM is inconsistent)
function cityFromTags(tags = {}) {
  return (
    tags["addr:city"] ||
    tags["contact:city"] ||
    tags["city"] ||
    tags["is_in:city"] ||
    "" // blank means "unknown"
  );
}

const counts = new Map();
const samples = new Map();

for (const el of raw.elements || []) {
  const tags = el.tags || {};
  const city = normCity(cityFromTags(tags));
  if (!city) continue;

  counts.set(city, (counts.get(city) || 0) + 1);

  if (!samples.has(city)) {
    const ll = getLatLon(el);
    samples.set(city, {
      name: tags.name || null,
      tagCity: cityFromTags(tags),
      lat: ll?.lat,
      lon: ll?.lon,
      kind:
        tags.amenity ||
        tags.landuse ||
        tags.waste ||
        tags.man_made ||
        "unknown",
    });
  }
}

// Turn into sorted list
const rows = [...counts.entries()]
  .map(([city, n]) => ({ city, n, sample: samples.get(city) }))
  .sort((a, b) => b.n - a.n);

console.log(`Found ${rows.length} cities with addr:city-like tags.\nTop 50:\n`);
console.table(rows.slice(0, 50).map(r => ({
  city: r.city,
  count: r.n,
  sample_name: r.sample?.name,
  sample_kind: r.sample?.kind
})));

// Write a JSON you can plug directly into scripts/cities-texas.json
const out = rows
  .filter(r => r.n >= 1) // change to >=2 if you want stricter
  .map(r => ({
    state: "texas",
    city: r.city.replace(/\s+/g, "-"),
    query: `${titleCase(r.city)} Texas USA`
  }));

fs.writeFileSync("scripts/cities-texas.from-osm.json", JSON.stringify(out, null, 2));
console.log("\nWrote: scripts/cities-texas.from-osm.json");
