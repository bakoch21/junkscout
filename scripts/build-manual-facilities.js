// scripts/build-manual-facilities.js
// Promotes curated/manual city facilities into real facility JSON files under ./data/facilities
//
// Usage (CMD):
//   node scripts/build-manual-facilities.js texas houston
//
// Input:
//   ./data/manual/<state>/<city>.json
//
// Output:
//   ./data/facilities/f_manual_<hash>.json   (one per manual facility)
//   ./data/manual/<state>/<city>.resolved.json  (same as input but with facility_id per item)

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const stateArg = String(process.argv[2] || "").toLowerCase();
const cityArg = String(process.argv[3] || "").toLowerCase();

if (!stateArg || !cityArg) {
  console.error("❌ Usage: node scripts/build-manual-facilities.js <state> <city>");
  console.error("   Example: node scripts/build-manual-facilities.js texas houston");
  process.exit(1);
}

const MANUAL_IN = path.join(".", "data", "manual", stateArg, `${cityArg}.json`);
const MANUAL_OUT_RESOLVED = path.join(".", "data", "manual", stateArg, `${cityArg}.resolved.json`);
const FACILITIES_DIR = path.join(".", "data", "facilities");

function safeReadJson(p) {
  try {
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch {
    return null;
  }
}

function writeJson(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2), "utf-8");
}

function slugify(s = "") {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function normalizeAddress(s = "") {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/,/g, "")
    .replace(/\s+/g, " ");
}

function stableIdFrom(name, address, type) {
  const key = `${slugify(name)}|${normalizeAddress(address)}|${slugify(type)}`;
  const h = crypto.createHash("sha1").update(key).digest("hex").slice(0, 12);
  return `f_manual_${h}`;
}

// Map human labels to your canonical types used across the site
function canonicalType(type = "") {
  const t = String(type || "").toLowerCase();

  if (t.includes("hazard")) return "hazardous_waste";
  if (t.includes("transfer")) return "transfer_station";
  if (t.includes("recycl")) return "recycling";
  if (t.includes("landfill")) return "landfill";
  if (t.includes("dump")) return "landfill";

  // default bucket so UI still works
  return "drop_off";
}

function appearsIn(stateSlug, citySlug) {
  return [{ state: stateSlug, city: citySlug }];
}

function run() {
  const manual = safeReadJson(MANUAL_IN);
  if (!manual) {
    console.error(`❌ Missing or invalid manual file: ${MANUAL_IN}`);
    process.exit(1);
  }

  const facilities = Array.isArray(manual.facilities) ? manual.facilities : [];
  if (facilities.length === 0) {
    console.error(`❌ No facilities[] found in: ${MANUAL_IN}`);
    process.exit(1);
  }

  fs.mkdirSync(FACILITIES_DIR, { recursive: true });

  const resolved = { ...manual };
  resolved.facilities = facilities.map((x) => ({ ...x }));

  let wrote = 0;

  for (const item of resolved.facilities) {
    const name = item.name || "";
    const address = item.address || "";
    const type = item.type || "";

    if (!name && !address) continue;

    const id = stableIdFrom(name, address, type);
    item.facility_id = id;

    // Build a real facility record compatible with the rest of your system
    const facilityRecord = {
      id,
      name: name || "Unnamed site",
      type: canonicalType(type),
      // keep the human label too (helpful for debugging / later)
      type_label: type || undefined,

      address: address || "",
      phone: item.phone || "",

      // Your rich manual fields (facility.js will render these)
      hours: item.hours || "",
      fees: item.fees || "",
      rules: item.rules || "",
      accepted_materials: Array.isArray(item.accepted_materials) ? item.accepted_materials : [],
      not_accepted: Array.isArray(item.not_accepted) ? item.not_accepted : [],
      verified_date: item.verified_date || manual.last_updated || "",

      // Keep the original “source” URL. We also set osm_url so your existing
      // “Source” link works without changing templates.
      source: item.source || "",
      osm_url: item.source || "",

      // Best-effort website: if you ever add explicit website fields later,
      // they’ll naturally display via facility.js
      website: item.website || "",

      // For back-links and context on facility pages
      appears_in: appearsIn(stateArg, cityArg),
    };

    // Clean undefined keys
    Object.keys(facilityRecord).forEach((k) => {
      if (facilityRecord[k] === undefined) delete facilityRecord[k];
    });

    const outPath = path.join(FACILITIES_DIR, `${id}.json`);

    // Don’t overwrite if already exists — stable IDs mean it should match
    if (!fs.existsSync(outPath)) {
      writeJson(outPath, facilityRecord);
      wrote += 1;
    } else {
      // If it exists, update it (safe) so edits in manual file propagate
      writeJson(outPath, facilityRecord);
    }
  }

  writeJson(MANUAL_OUT_RESOLVED, resolved);

  console.log(`✅ Resolved manual city file → ${MANUAL_OUT_RESOLVED}`);
  console.log(`✅ Wrote/updated manual facility records in → ${FACILITIES_DIR}`);
  console.log(`   Total manual facilities processed: ${resolved.facilities.length}`);
  console.log(`   Records written/updated: ${resolved.facilities.length} (stable IDs)`);
}

run();
