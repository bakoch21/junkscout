// scripts/import-tceq-msw.js
//
// Reads:  data/sources/tceq/msw-facilities-texas.csv
// Writes: data/facilities/*.json + data/facilities/index.json
//
// Goal: generate canonical JunkScout facilities from TCEQ MSW list.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const SRC_CSV = path.join("data", "sources", "tceq", "msw-facilities-texas.csv");
const OUT_DIR = path.join("data", "facilities");

// ---------- small helpers ----------
function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function writeJson(p, obj) {
  ensureDir(path.dirname(p));
  fs.writeFileSync(p, JSON.stringify(obj, null, 2));
}

function slugify(s) {
  return (s || "")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function clean(s) {
  const v = (s ?? "").toString().trim();
  return v.length ? v : "";
}

function sha1_12(s) {
  return crypto.createHash("sha1").update(s).digest("hex").slice(0, 12);
}

// Minimal CSV parser that handles quoted commas/newlines.
// (Good enough for typical government exports.)
function parseCsv(csvText) {
  const rows = [];
  let row = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const ch = csvText[i];
    const next = csvText[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }

    if (ch === ",") {
      row.push(cur);
      cur = "";
      continue;
    }

    if (ch === "\n") {
      row.push(cur);
      rows.push(row);
      row = [];
      cur = "";
      continue;
    }

    if (ch === "\r") continue;

    cur += ch;
  }

  // last cell
  row.push(cur);
  rows.push(row);

  const headers = rows[0].map((h) => h.trim());
  const out = [];

  for (let r = 1; r < rows.length; r++) {
    const values = rows[r];
    if (!values || values.length === 1 && values[0] === "") continue;

    const obj = {};
    for (let c = 0; c < headers.length; c++) {
      obj[headers[c]] = values[c] ?? "";
    }
    out.push(obj);
  }

  return out;
}

// Basic “type” mapping (you can refine later).
// For now: MSW list = mostly landfills + transfer stations, but not perfectly labeled.
// We'll default to landfill unless we see hints.
function inferType(physicalTypeText, siteName) {
  const t = `${physicalTypeText || ""} ${siteName || ""}`.toLowerCase();

  // common words
  if (t.includes("transfer")) return "transfer_station";
  if (t.includes("recycl")) return "recycling";
  if (t.includes("compost")) return "recycling";

  // physical type codes sometimes include multiple (e.g., "1 AE & 4 AE")
  // We'll treat "1" and "4" as landfill-ish.
  if (/\b1\b/.test(t) || /\b4\b/.test(t)) return "landfill";

  return "landfill";
}

function buildAddress(r) {
  const line1 = clean(r["Phys Addr Line 1"]);
  const line2 = clean(r["Phys Addr Line 2"]);
  const city = clean(r["Phys Addr City"]);
  const state = clean(r["Phys Addr State"]);
  const zip = clean(r["Phys Addr Zip"]);

  const parts = [line1, line2, city, state, zip].filter(Boolean);
  if (parts.length) return parts.join(" ");

  // fallback
  const near = clean(r["Near Phys Loc Txt"]);
  const nearCity = clean(r["Near Phys Loc City"]);
  const nearState = clean(r["Near Phys Loc State"]);
  const nearZip = clean(r["Near Phys Loc Zip"]);
  const nearParts = [near, nearCity, nearState, nearZip].filter(Boolean);
  return nearParts.join(" ");
}

function numOrNull(v) {
  const n = Number((v ?? "").toString().trim());
  return Number.isFinite(n) ? n : null;
}

function main() {
  if (!fs.existsSync(SRC_CSV)) {
    console.error(`❌ Missing source CSV: ${SRC_CSV}`);
    console.error(`Put the exported CSV here: data/sources/tceq/msw-facilities-texas.csv`);
    process.exit(1);
  }

  ensureDir(OUT_DIR);

  const csvText = fs.readFileSync(SRC_CSV, "utf-8");
  const rows = parseCsv(csvText);

  // filter to active MSW
  const filtered = rows.filter((r) => {
    const program = clean(r["Program"]).toUpperCase();
    const status = clean(r["Physical Site Status"]).toUpperCase();
    return program === "MSW" && status === "ACTIVE";
  });

  const facilities = [];
  const seen = new Set();

  for (const r of filtered) {
    const name = clean(r["Site Name"]) || "Unnamed site";
    const rn = clean(r["RN"]);
    const addl = clean(r["Additional ID"]);
    const physType = clean(r["Physical Type"]);

    // Stable id seed (TCEQ identifiers + coords)
    const lat = numOrNull(r["Latitude"]);
    const lng = numOrNull(r["Longitude"]);
    const idSeed = `tceq|rn:${rn}|addl:${addl}|name:${name}|lat:${lat}|lng:${lng}`;
    const id = "f_" + sha1_12(idSeed);

    if (seen.has(id)) continue;
    seen.add(id);

    const facility = {
      id,
      slug: slugify(name) || id,
      name,
      type: inferType(physType, name),
      address: buildAddress(r),
      lat,
      lng,
      website: null, // TCEQ sheet doesn’t include site URL
      osm_url: null, // optional later via matching
      appears_in: [], // we’ll backfill via city proximity later

      // keep raw TCEQ fields for future filtering/badges
      tceq: {
        program: clean(r["Program"]),
        rn,
        additional_id: addl,
        physical_type: physType,
        legal_status: clean(r["Legal Status"]),
        legal_status_date: clean(r["Legal Status Date"]),
        county: clean(r["County"]),
        region: clean(r["Region"]),
        physical_site_status: clean(r["Physical Site Status"]),
      },
    };

    facilities.push(facility);

    // write per-facility JSON
    writeJson(path.join(OUT_DIR, `${facility.id}.json`), facility);
  }

  facilities.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  writeJson(path.join(OUT_DIR, "index.json"), facilities);

  console.log(`✅ Imported ${facilities.length} ACTIVE MSW facilities from TCEQ → ${OUT_DIR}`);
}

main();
