// scripts/fetch_overpass_austin.js
// Fetch Austin-area waste-related locations from OpenStreetMap via Overpass
// Output: data/texas/austin.json

const fs = require("fs");
const path = require("path");

const OUT_PATH = path.join(__dirname, "..", "data", "texas", "austin.json");

// Broad list (your choice): landfill + transfer + waste disposal + recycling + scrap + hazardous waste
// We'll query within the "Austin" administrative area.
const OVERPASS_QUERY = `
[out:json][timeout:25];
area["name"="Austin"]["admin_level"~"8|10"]->.a;

(
  // Landfills
  way(area.a)["landuse"="landfill"];
  relation(area.a)["landuse"="landfill"];

  // Waste-related amenities
  node(area.a)["amenity"="waste_transfer_station"];
  way(area.a)["amenity"="waste_transfer_station"];
  relation(area.a)["amenity"="waste_transfer_station"];

  node(area.a)["amenity"="waste_disposal"];
  way(area.a)["amenity"="waste_disposal"];
  relation(area.a)["amenity"="waste_disposal"];

  // Recycling centres (often useful for "junk")
  node(area.a)["amenity"="recycling"];
  way(area.a)["amenity"="recycling"];
  relation(area.a)["amenity"="recycling"];

  // Scrap yards
  node(area.a)["amenity"="scrap_yard"];
  way(area.a)["amenity"="scrap_yard"];
  relation(area.a)["amenity"="scrap_yard"];

  // Hazardous waste sites (OSM tagging is inconsistent; this catches some)
  node(area.a)["amenity"="hazardous_waste"];
  way(area.a)["amenity"="hazardous_waste"];
  relation(area.a)["amenity"="hazardous_waste"];
);

out center tags;
`;

function classify(tags = {}) {
  if (tags.landuse === "landfill") return "landfill";
  const a = tags.amenity;
  if (a === "waste_transfer_station") return "transfer_station";
  if (a === "waste_disposal") return "waste_disposal";
  if (a === "recycling") return "recycling";
  if (a === "scrap_yard") return "scrap_yard";
  if (a === "hazardous_waste") return "hazardous_waste";
  return "other";
}

function pickContact(tags = {}) {
  const website = tags["contact:website"] || tags.website || "";
  const phone = tags["contact:phone"] || tags.phone || "";
  return { website, phone };
}

function formatAddress(tags = {}) {
  const parts = [];
  const hn = tags["addr:housenumber"];
  const st = tags["addr:street"];
  const city = tags["addr:city"] || "Austin";
  const state = tags["addr:state"] || "TX";
  const pc = tags["addr:postcode"];
  const line1 = [hn, st].filter(Boolean).join(" ");
  if (line1) parts.push(line1);
  parts.push([city, state].filter(Boolean).join(", "));
  if (pc) parts[parts.length - 1] += ` ${pc}`;
  const addr = parts.join(", ").replace(/\s+,/g, ",").trim();
  return addr || "";
}

function osmUrl(el) {
  if (el.type === "node") return `https://www.openstreetmap.org/node/${el.id}`;
  if (el.type === "way") return `https://www.openstreetmap.org/way/${el.id}`;
  if (el.type === "relation") return `https://www.openstreetmap.org/relation/${el.id}`;
  return "";
}

async function main() {
  console.log("Fetching Overpass data for Austin…");

  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body: new URLSearchParams({ data: OVERPASS_QUERY }),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Overpass request failed: ${res.status} ${res.statusText}\n${txt.slice(0, 500)}`);
  }

  const json = await res.json();
  const elements = json.elements || [];

  const cleaned = elements
    .map((el) => {
      const tags = el.tags || {};
      const name = tags.name || "";
      const type = classify(tags);

      // center is returned for ways/relations; nodes have lat/lon directly
      const lat = el.lat ?? el.center?.lat ?? null;
      const lng = el.lon ?? el.center?.lon ?? null;

      const { website, phone } = pickContact(tags);
      const address = formatAddress(tags);

      return {
        name,
        type,
        lat,
        lng,
        address,
        website,
        phone,
        osm_url: osmUrl(el),
      };
    })
    // Keep only things with a name and coordinates
    .filter((x) => x.name && typeof x.lat === "number" && typeof x.lng === "number")
    // De-dupe by name+coords
    .filter((x, idx, arr) => {
      const key = `${x.name}|${x.lat.toFixed(5)}|${x.lng.toFixed(5)}`;
      return arr.findIndex((y) => `${y.name}|${y.lat.toFixed(5)}|${y.lng.toFixed(5)}` === key) === idx;
    })
    // Sort: landfills first, then transfer, then disposal, then recycling/scrap/other
    .sort((a, b) => {
      const order = {
        landfill: 1,
        transfer_station: 2,
        waste_disposal: 3,
        hazardous_waste: 4,
        recycling: 5,
        scrap_yard: 6,
        other: 99,
      };
      return (order[a.type] || 99) - (order[b.type] || 99) || a.name.localeCompare(b.name);
    });

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(cleaned, null, 2), "utf8");

  console.log(`Saved ${cleaned.length} locations to: ${OUT_PATH}`);
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
