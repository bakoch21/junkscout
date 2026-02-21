// city.js
// Renders city results from either:
// 1) Curated overlay JSON injected into the page (Option A), OR
// 2) Fallback: /data/{state}/{city}.json
//
// Hub filter UX (uniform pills):
// - Type: single-select pills (no dropdown)
// - Advanced filters (collapsed):
//    - Materials (collapsed)
//    - Features (collapsed)
// - Inline "Details" expander per card
//
// Facility pages exist when a facility_id is available.

function ensureRobotsMeta(content = "index,follow") {
  const existing = document.querySelector('meta[name="robots"]');
  if (existing) return;

  const meta = document.createElement("meta");
  meta.setAttribute("name", "robots");
  meta.setAttribute("content", content);
  document.head.appendChild(meta);
}

function titleCaseFromSlug(slug = "") {
  return String(slug || "")
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function titleCaseWordsFromSlug(slug = "") {
  return String(slug || "")
    .split("-")
    .filter(Boolean)
    .map((w) => w.toLowerCase())
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function getRouteParts() {
  // 1) Prefer explicit dataset if generator injects it
  const b = document.body;
  const ds = b?.dataset || {};
  if (ds.state && ds.city) return { state: String(ds.state), city: String(ds.city) };

  // 2) Support hash routes like #texas/houston or #/texas/houston
  const hash = (window.location.hash || "").replace(/^#\/?/, "").trim();
  if (hash) {
    const parts = hash.split("/").filter(Boolean);
    const state = parts[0] || "";
    const city = parts[1] || "";

    // If someone uses #houston, assume texas
    if (!city && state) return { state: "texas", city: state };

    return { state, city };
  }

  // 3) Path routes:
  // - /texas/houston/  -> state=texas, city=houston
  // - /houston/        -> DEFAULT state=texas, city=houston
  const parts = window.location.pathname.replace(/^\/|\/$/g, "").split("/").filter(Boolean);

  if (parts.length >= 2) {
    return { state: parts[0] || "", city: parts[1] || "" };
  }

  if (parts.length === 1) {
    return { state: "texas", city: parts[0] || "" };
  }

  return { state: "", city: "" };
}

function setMetaDescription(desc) {
  let meta = document.querySelector('meta[name="description"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute("name", "description");
    document.head.appendChild(meta);
  }
  meta.setAttribute("content", desc);
}

function setCanonical(url) {
  let link = document.querySelector('link[rel="canonical"]');
  if (!link) {
    link = document.createElement("link");
    link.setAttribute("rel", "canonical");
    document.head.appendChild(link);
  }
  link.setAttribute("href", url);
}

function applyCitySEO({ cityName, stateName }) {
  const pretty = cityName + ", " + stateName;
  const isHouston = String(cityName).toLowerCase() === "houston" && String(stateName).toUpperCase() === "TX";
  const isDallas = String(cityName).toLowerCase() === "dallas" && String(stateName).toUpperCase() === "TX";
  const isAustin = String(cityName).toLowerCase() === "austin" && String(stateName).toUpperCase() === "TX";
  const isSanAntonio = String(cityName).toLowerCase() === "san antonio" && String(stateName).toUpperCase() === "TX";
  const isLosAngeles = String(cityName).toLowerCase() === "los angeles" && String(stateName).toUpperCase() === "CA";

  const titleEl = document.getElementById("cityTitle");
  if (titleEl) {
    titleEl.textContent = isHouston
      ? "Houston Trash Dump, Transfer Stations & Landfills"
      : isDallas
      ? "Dallas Trash Dump, Transfer Stations & Landfills"
      : isAustin
      ? "Austin Trash Dump, Transfer Stations & Landfills"
      : isSanAntonio
      ? "San Antonio Trash Dump, Transfer Stations & Landfills"
      : isLosAngeles
      ? "Los Angeles Trash Dump, Transfer Stations & Landfills"
      : "Where to dump trash in " + pretty;
  }

  const ansEl = document.getElementById("cityAnswer");
  if (ansEl) {
    ansEl.textContent = isHouston
      ? "Compare Houston dump, landfill, transfer station, and recycling drop-off options with fees, hours, resident rules, and accepted materials."
      : isDallas
      ? "Compare Dallas dump, landfill, transfer station, and recycling drop-off options with fees, hours, resident rules, and accepted materials."
      : isAustin
      ? "Compare Austin dump, landfill, transfer station, and recycling drop-off options with fees, hours, resident rules, and accepted materials."
      : isSanAntonio
      ? "Compare San Antonio dump, landfill, transfer station, and recycling drop-off options with fees, hours, resident rules, and accepted materials."
      : isLosAngeles
      ? "Compare Los Angeles dump, landfill, transfer station, and recycling drop-off options with fees, hours, resident rules, and accepted materials."
      : "Find public landfills, transfer stations, and recycling drop-offs in " + pretty + ", " +
        "with hours, rules, and accepted materials when available.";
  }

  const subEl = document.getElementById("citySubhead");
  if (subEl) {
    subEl.textContent = isHouston
      ? "Need to dump trash in Houston fast? Use this where to dump guide and confirm rules before you drive."
      : isDallas
      ? "Need to dump trash in Dallas fast? Start with these verified options and confirm rules before you drive."
      : isAustin
      ? "Need to dump trash in Austin fast? Start with these verified options and confirm rules before you drive."
      : isSanAntonio
      ? "Need to dump trash in San Antonio fast? Start with these verified options and confirm rules before you drive."
      : isLosAngeles
      ? "Need to dump trash in Los Angeles fast? Start with these verified options and confirm rules before you drive."
      : "Public landfills, transfer stations, and disposal sites in " + cityName + ". " +
        "Always confirm fees, residency rules, and accepted materials before visiting.";
  }

  const inlineCity = document.getElementById("cityNameInline");
  if (inlineCity) inlineCity.textContent = cityName;

  if (isHouston) {
    document.title = "Houston Trash Dump, Transfer Stations & Landfills | JunkScout";
    setMetaDescription(
      "Compare Houston dump, landfill, transfer station, and recycling drop-off options with fees, hours, resident rules, and accepted materials."
    );

    const faqDumpWhere = document.getElementById("faqDumpWhere");
    if (faqDumpWhere) faqDumpWhere.textContent = "Where can I dump trash in Houston today?";

    const faqDumpFree = document.getElementById("faqDumpFree");
    if (faqDumpFree) faqDumpFree.textContent = "Where can I drop off trash for free in Houston?";

    const faqDumpFreeBody = document.getElementById("faqDumpFreeBody");
    if (faqDumpFreeBody) {
      faqDumpFreeBody.textContent =
        "Some Houston facilities offer free resident drop-off with ID and proof of address, while private transfer stations and landfills usually charge by load size or weight.";
    }
  } else if (isDallas) {
    document.title = "Dallas Trash Dump, Transfer Stations & Landfills | JunkScout";
    setMetaDescription(
      "Compare Dallas dump, landfill, transfer station, and recycling drop-off options with fees, hours, resident rules, and accepted materials."
    );

    const faqDumpWhere = document.getElementById("faqDumpWhere");
    if (faqDumpWhere) faqDumpWhere.textContent = "Where can I dump trash in Dallas today?";

    const faqDumpFree = document.getElementById("faqDumpFree");
    if (faqDumpFree) faqDumpFree.textContent = "Where can I drop off trash for free in Dallas?";

    const faqDumpFreeBody = document.getElementById("faqDumpFreeBody");
    if (faqDumpFreeBody) {
      faqDumpFreeBody.textContent =
        "Some Dallas-area facilities offer resident-focused or lower-cost drop-off options, while private transfer stations and landfills usually charge by load size or material type.";
    }
  } else if (isAustin) {
    document.title = "Austin Trash Dump, Transfer Stations & Landfills | JunkScout";
    setMetaDescription(
      "Compare Austin dump, landfill, transfer station, and recycling drop-off options with fees, hours, resident rules, and accepted materials."
    );

    const faqDumpWhere = document.getElementById("faqDumpWhere");
    if (faqDumpWhere) faqDumpWhere.textContent = "Where can I dump trash in Austin today?";

    const faqDumpFree = document.getElementById("faqDumpFree");
    if (faqDumpFree) faqDumpFree.textContent = "Where can I drop off trash for free in Austin?";

    const faqDumpFreeBody = document.getElementById("faqDumpFreeBody");
    if (faqDumpFreeBody) {
      faqDumpFreeBody.textContent =
        "Some Austin-area facilities offer resident-focused or lower-cost drop-off options, while private transfer stations and landfills usually charge by load size or material type.";
    }
  } else if (isSanAntonio) {
    document.title = "San Antonio Trash Dump, Transfer Stations & Landfills | JunkScout";
    setMetaDescription(
      "Compare San Antonio dump, landfill, transfer station, and recycling drop-off options with fees, hours, resident rules, and accepted materials."
    );

    const faqDumpWhere = document.getElementById("faqDumpWhere");
    if (faqDumpWhere) faqDumpWhere.textContent = "Where can I dump trash in San Antonio today?";

    const faqDumpFree = document.getElementById("faqDumpFree");
    if (faqDumpFree) faqDumpFree.textContent = "Where can I drop off trash for free in San Antonio?";

    const faqDumpFreeBody = document.getElementById("faqDumpFreeBody");
    if (faqDumpFreeBody) {
      faqDumpFreeBody.textContent =
        "Some San Antonio-area facilities offer resident-focused or lower-cost drop-off options, while private transfer stations and landfills usually charge by load size or material type.";
    }
  } else if (isLosAngeles) {
    document.title = "Los Angeles Trash Dump, Transfer Stations & Landfills | JunkScout";
    setMetaDescription(
      "Compare Los Angeles dump, landfill, transfer station, and recycling drop-off options with fees, hours, resident rules, and accepted materials."
    );

    const faqDumpWhere = document.getElementById("faqDumpWhere");
    if (faqDumpWhere) faqDumpWhere.textContent = "Where can I dump trash in Los Angeles today?";

    const faqDumpFree = document.getElementById("faqDumpFree");
    if (faqDumpFree) faqDumpFree.textContent = "Where can I drop off trash for free in Los Angeles?";

    const faqDumpFreeBody = document.getElementById("faqDumpFreeBody");
    if (faqDumpFreeBody) {
      faqDumpFreeBody.textContent =
        "Some Los Angeles-area services offer resident-focused or lower-cost drop-off options, while private transfer stations and landfills usually charge by load size or material type.";
    }
  } else {
    document.title = cityName + ", " + stateName + " Trash Dump, Transfer Stations & Landfills | JunkScout";
    setMetaDescription(
      "Find public landfills, transfer stations, and recycling drop-offs in " + pretty + ". " +
      "Hours, fees, and accepted materials when available - always confirm before visiting."
    );
  }

  const canonical = window.location.origin + window.location.pathname;
  setCanonical(canonical);
}

function alignResultsAnchor(targetEl) {
  if (!targetEl) return;
  const hash = String(window.location.hash || "").toLowerCase();
  if (!hash.startsWith("#results")) return;

  const run = () => {
    const nav = document.querySelector(".nav");
    const navHeight = nav ? nav.getBoundingClientRect().height : 0;
    const top = Math.max(
      0,
      Math.round(targetEl.getBoundingClientRect().top + window.scrollY - navHeight - 12)
    );
    window.scrollTo(0, top);
  };

  requestAnimationFrame(() => {
    requestAnimationFrame(run);
  });
}

/** =========================
 * Curated overlay (Option A)
 * ========================= */
function readCuratedOverlay() {
  const el = document.getElementById("CURATED:JSON");
  if (!el) return null;

  try {
    const raw = (el.textContent || "").trim();
    if (!raw) return null;
    const json = JSON.parse(raw);
    return json && typeof json === "object" ? json : null;
  } catch {
    return null;
  }
}

function getCuratedItems(curated) {
  if (!curated || typeof curated !== "object") return null;

  const candidate =
    curated.facilities ||
    curated.locations ||
    curated.items ||
    curated.results ||
    curated.data ||
    null;

  if (Array.isArray(candidate)) return candidate;

  if (candidate && typeof candidate === "object") {
    if (Array.isArray(candidate.list)) return candidate.list;
    if (Array.isArray(candidate.items)) return candidate.items;
    if (Array.isArray(candidate.results)) return candidate.results;
  }

  return null;
}

function shouldBlendCuratedWithData(state, city) {
  const stateSlug = String(state || "").toLowerCase();
  const citySlug = String(city || "").toLowerCase();
  return (
    (stateSlug === "texas" && ["dallas", "austin", "san-antonio"].includes(citySlug)) ||
    (stateSlug === "california" && citySlug === "los-angeles")
  );
}

async function fetchCityDataPayload(state, city, quiet = false) {
  const dataUrl = `/data/${state}/${city}.json`;
  try {
    const res = await fetch(dataUrl, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to load ${dataUrl} (${res.status})`);
    return await res.json();
  } catch (err) {
    if (!quiet) console.error(err);
    return null;
  }
}

/** =========================
 * Helpers
 * ========================= */

function escapeHtml(str = "") {
  return String(str).replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[m]));
}

function safeLower(s) {
  return String(s || "").toLowerCase();
}

function arrLower(a) {
  return Array.isArray(a) ? a.map((x) => safeLower(x)) : [];
}

function normalizeType(rawType) {
  const s = safeLower(rawType);

  if (s.includes("hazard")) return { key: "hazardous_waste", label: "Hazardous" };
  if (s.includes("transfer")) return { key: "transfer_station", label: "Transfer" };
  if (s.includes("recycl") || s.includes("reuse")) return { key: "recycling", label: "Recycling" };
  if (s.includes("landfill")) return { key: "landfill", label: "Landfill" };
  if (s.includes("dumpster")) return { key: "public_dumpster", label: "Public dumpster" };

  const k = safeLower(rawType).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const lbl = rawType ? String(rawType).trim() : "Other";
  return { key: k || "other", label: lbl };
}

/** =========================
 * Materials normalization
 * ========================= */

function normalizeMaterialsFromAccepted(item) {
  if (Array.isArray(item?.normalized_materials) && item.normalized_materials.length) {
    return item.normalized_materials.map(String);
  }

  const accepted = arrLower(item?.accepted_materials);
  const out = new Set();

  const hasAny = (s, needles) => needles.some((n) => s.includes(n));

  for (const raw of accepted) {
    const s = String(raw || "").toLowerCase();

    if (hasAny(s, ["household trash", "household garbage", "garbage", "trash", "general trash", "solid waste"])) {
      out.add("Household Trash");
    }

    if (hasAny(s, ["bulk", "furniture", "mattress", "household goods", "building materials"])) {
      out.add("Bulk Items & Furniture");
    }

    if (hasAny(s, ["yard", "tree", "brush", "limb", "green waste"])) {
      out.add("Yard Waste & Tree Debris");
    }

    if (hasAny(s, ["recycl", "plastics", "paper", "glass", "metals", "aluminum", "tin", "newspaper", "magazines", "cardboard"])) {
      out.add("Recycling");
    }

    if (s.includes("tire")) out.add("Tires");

    if (hasAny(s, ["construction", "demolition", "c&d", "debris"])) {
      out.add("Construction & Demolition Debris");
    }

    if (hasAny(s, ["hazard", "pesticide", "fertilizer", "chemical", "cleaner", "pool", "gas", "fuel", "solvent"])) {
      out.add("Hazardous Waste");
    }

    if (hasAny(s, ["used motor oil", "used oil", "motor oil", "oil"])) {
      out.add("Used Motor Oil");
    }

    if (s.includes("batter")) out.add("Batteries");
    if (hasAny(s, ["paint", "stain", "thinner", "chemical"])) out.add("Paint & Chemicals");
    if (s.includes("propane")) out.add("Propane");
    if (hasAny(s, ["mercury", "thermometer"])) out.add("Mercury Items");

    if (hasAny(s, ["electronics", "e-waste", "tv", "computer", "laptop"])) out.add("Electronics");
    if (s.includes("appliance")) out.add("Appliances");
  }

  const ordered = [
    "Household Trash",
    "Recycling",
    "Tires",
    "Yard Waste & Tree Debris",
    "Bulk Items & Furniture",
    "Construction & Demolition Debris",
    "Hazardous Waste",
    "Used Motor Oil",
    "Batteries",
    "Paint & Chemicals",
    "Propane",
    "Mercury Items",
    "Appliances",
    "Electronics",
  ];

  return ordered.filter((x) => out.has(x));
}

function initialFilterStateFromQuery() {
  const params = new URLSearchParams(window.location.search || "");
  const materialParam = safeLower(params.get("material") || "");
  const typeParam = safeLower(params.get("type") || "");

  const materialMap = {
    furniture: "Bulk Items & Furniture",
    mattresses: "Bulk Items & Furniture",
    construction: "Construction & Demolition Debris",
    "construction-debris": "Construction & Demolition Debris",
    "c-and-d": "Construction & Demolition Debris",
    tires: "Tires",
    appliances: "Appliances",
    electronics: "Electronics",
    "paint-chemicals": "Paint & Chemicals",
    paint: "Paint & Chemicals",
    chemicals: "Paint & Chemicals",
    "yard-waste": "Yard Waste & Tree Debris",
    "scrap-metal": "Recycling",
  };

  const typeMap = {
    landfill: "landfill",
    transfer: "transfer_station",
    "transfer-station": "transfer_station",
    recycling: "recycling",
    hazardous: "hazardous_waste",
    "hazardous-waste": "hazardous_waste",
    dumpster: "public_dumpster",
  };

  const materials = new Set();
  const mappedMaterial = materialMap[materialParam];
  if (mappedMaterial) materials.add(mappedMaterial);

  const mappedType = typeMap[typeParam] || "all";

  return {
    type: mappedType,
    flags: new Set(),
    materials,
  };
}

function deriveFlags(item) {
  const fees = safeLower(item?.fees);
  const rules = safeLower(item?.rules);
  const accepted = arrLower(item?.accepted_materials);

  const hasFree =
    fees.includes("free") ||
    fees.includes("no charge") ||
    fees.includes("donation");

  const hasFee =
    fees.includes("fee") ||
    fees.includes("by weight") ||
    fees.includes("by load") ||
    fees.includes("per ton") ||
    fees.includes("charge");

  const residentish =
    rules.includes("resident") ||
    rules.includes("proof") ||
    rules.includes("houston residents") ||
    rules.includes("county residents");

  const acceptsGarbage =
    accepted.some((x) =>
      x.includes("garbage") ||
      x.includes("household trash") ||
      x === "trash" ||
      x.includes("general trash")
    );

  const acceptsHeavy =
    accepted.some((x) =>
      x.includes("heavy trash") ||
      x.includes("construction") ||
      x.includes("c&d") ||
      x.includes("bulk") ||
      x.includes("appliances") ||
      x.includes("furniture")
    );

  const flags = [];

  if (hasFree && residentish) flags.push("free_to_residents");
  else if (hasFree) flags.push("free");

  if (acceptsGarbage) flags.push("accepts_garbage");
  if (acceptsHeavy) flags.push("accepts_heavy_trash");

  if (!hasFree && (hasFee || fees.includes("varies"))) flags.push("fee_charge_likely");

  return flags;
}

const FEATURE_DEFS = {
  free_to_residents: { label: "Free to residents", color: "green" },
  free: { label: "Free", color: "green" },
  accepts_garbage: { label: "Accepts garbage", color: "blue" },
  accepts_heavy_trash: { label: "Accepts heavy trash", color: "orange" },
  fee_charge_likely: { label: "Fee likely", color: "gray" },
};

function badge(text, color) {
  return `<span class="badge badge--${color}">${text}</span>`;
}

/** =========================
 * Map (Leaflet)
 * ========================= */

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function isValidCoordPair(lat, lng) {
  if (lat === null || lng === null) return false;
  if (lat < -90 || lat > 90) return false;
  if (lng < -180 || lng > 180) return false;
  // Treat source placeholder coordinates as invalid (commonly 0,0).
  if (Math.abs(lat) < 0.000001 && Math.abs(lng) < 0.000001) return false;
  return true;
}

function getCoords(item) {
  const lat = toNum(item?.lat ?? item?.latitude);
  const lng = toNum(item?.lng ?? item?.lon ?? item?.longitude);
  if (!isValidCoordPair(lat, lng)) return { lat: null, lng: null };
  return { lat, lng };
}

// Coordinate normalization: accept lat|latitude and lng|lon|longitude
function getLat(item) {
  return getCoords(item).lat;
}
function getLng(item) {
  return getCoords(item).lng;
}

function getIdForItem(item) {
  return item?.facility_id || item?.id || item?.name || "";
}

function normalizeKeyText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function mergeUniqueStrings(a, b) {
  const out = [];
  const seen = new Set();
  for (const raw of [...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])]) {
    const val = String(raw || "").trim();
    if (!val) continue;
    const key = val.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(val);
  }
  return out;
}

function itemCompletenessScore(item) {
  if (!item || typeof item !== "object") return 0;

  let score = 0;
  const hasText = (v) => String(v || "").trim().length > 0;

  if (hasText(item.name)) score += 4;
  if (hasText(item.address)) score += 4;
  if (hasText(item.type)) score += 3;
  if (hasText(item.facility_id) || hasText(item.id)) score += 3;
  if (hasText(item.source)) score += 2;
  if (hasText(item.website)) score += 1;
  if (hasText(item.phone)) score += 1;
  if (hasText(item.hours)) score += 1;
  if (hasText(item.fees)) score += 1;
  if (hasText(item.rules)) score += 1;
  if (hasCoords(item)) score += 2;

  const accepted = Array.isArray(item.accepted_materials) ? item.accepted_materials.length : 0;
  const notAccepted = Array.isArray(item.not_accepted) ? item.not_accepted.length : 0;
  score += Math.min(3, accepted) + Math.min(2, notAccepted);

  return score;
}

function mergeDuplicateItems(a, b) {
  const primary = itemCompletenessScore(a) >= itemCompletenessScore(b) ? a : b;
  const secondary = primary === a ? b : a;
  const out = { ...(secondary || {}), ...(primary || {}) };

  const accepted = mergeUniqueStrings(primary?.accepted_materials, secondary?.accepted_materials);
  if (accepted.length) out.accepted_materials = accepted;

  const notAccepted = mergeUniqueStrings(primary?.not_accepted, secondary?.not_accepted);
  if (notAccepted.length) out.not_accepted = notAccepted;

  const normalizedMaterials = mergeUniqueStrings(primary?.normalized_materials, secondary?.normalized_materials);
  if (normalizedMaterials.length) out.normalized_materials = normalizedMaterials;

  return out;
}

function dedupeSignature(item) {
  const name = normalizeKeyText(item?.name);
  const address = normalizeKeyText(item?.address);
  const type = normalizeType(item?.type).key;
  if (name && address) return `na:${name}|${address}|${type}`;

  const lat = getLat(item);
  const lng = getLng(item);
  if (name && lat !== null && lng !== null) {
    return `nl:${name}|${lat.toFixed(4)}|${lng.toFixed(4)}|${type}`;
  }

  return "";
}

function dedupeCityItems(items) {
  const rows = Array.isArray(items) ? items : [];
  if (rows.length <= 1) return rows;

  const byId = new Map();
  const withoutId = [];

  for (const row of rows) {
    if (!row || typeof row !== "object") continue;

    const id = String(row?.facility_id || row?.id || "").trim().toLowerCase();
    if (!id) {
      withoutId.push(row);
      continue;
    }

    const existing = byId.get(id);
    byId.set(id, existing ? mergeDuplicateItems(existing, row) : row);
  }

  const stage1 = [...byId.values(), ...withoutId];
  const bySignature = new Map();
  const keepAsIs = [];

  for (const row of stage1) {
    const sig = dedupeSignature(row);
    if (!sig) {
      keepAsIs.push(row);
      continue;
    }

    const existing = bySignature.get(sig);
    bySignature.set(sig, existing ? mergeDuplicateItems(existing, row) : row);
  }

  return [...bySignature.values(), ...keepAsIs];
}

function hasCoords(item) {
  const lat = getLat(item);
  const lng = getLng(item);
  return lat !== null && lng !== null;
}

function buildPopupHtml(item) {
  const name = escapeHtml(item?.name || "Location");
  const address = item?.address
    ? `<div class="muted small" style="margin-top:2px">${escapeHtml(item.address)}</div>`
    : "";

  const lat = getLat(item);
  const lng = getLng(item);

  const dirs = item?.address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.address)}`
    : (lat !== null && lng !== null ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}` : "#");

  const facilityId = String(item?.facility_id || item?.id || "").trim();
  const facilityHref = facilityId ? `/facility/${encodeURIComponent(facilityId)}/` : "";

  return `
    <div style="min-width:180px">
      <div style="font-weight:800; line-height:1.2">${name}</div>
      ${address}
      <div style="margin-top:8px; display:flex; gap:10px; align-items:center; flex-wrap:wrap">
        <a class="link" href="${dirs}" target="_blank" rel="noopener">Directions</a>
        ${facilityHref ? `<a class="link" href="${facilityHref}">Facility page</a>` : ""}
      </div>
    </div>
  `;
}

// Robust Leaflet wait (handles slow CDN + caching weirdness)
async function waitForLeaflet({ timeoutMs = 5000, stepMs = 50 } = {}) {
  const start = Date.now();
  while (!window.L) {
    if (Date.now() - start > timeoutMs) return false;
    await new Promise((r) => setTimeout(r, stepMs));
  }
  return true;
}

function makeMapController() {
  const mapEl = document.getElementById("map");
  const wrap = document.getElementById("mapWrap") || mapEl?.parentElement;

  const hasLeaflet = typeof window !== "undefined" && window.L;
  if (!mapEl || !wrap || !hasLeaflet) {
    if (wrap) wrap.style.display = "none";
    return {
      enabled: false,
      setMarkers: () => {},
      panToId: () => false,
    };
  }

  const L = window.L;

  // Guard against "Map container is already initialized."
  // (happens if scripts get executed twice due to caching/hot reload)
  try {
    if (mapEl._leaflet_id) {
      wrap.style.display = "none";
      return { enabled: false, setMarkers: () => {}, panToId: () => false };
    }
  } catch {}

  const map = L.map(mapEl, { scrollWheelZoom: false });

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(map);

  const group = L.layerGroup().addTo(map);
  const markerById = new Map();

  function fitToMarkers() {
    const markers = Array.from(markerById.values());
    if (!markers.length) return;

    const bounds = L.latLngBounds(markers.map((m) => m.getLatLng()));
    map.fitBounds(bounds.pad(0.15), { animate: false });
  }

  function setMarkers(items, onMarkerClick) {
    group.clearLayers();
    markerById.clear();

    const withCoords = (items || []).filter(hasCoords);

    if (!withCoords.length) {
      wrap.style.display = "none";
      return;
    }

    wrap.style.display = "";
    withCoords.forEach((item) => {
      const id = getIdForItem(item);
      const lat = getLat(item);
      const lng = getLng(item);
      if (!id || lat === null || lng === null) return;

      const m = L.marker([lat, lng]).addTo(group);
      m.bindPopup(buildPopupHtml(item));

      m.on("click", () => {
        if (typeof onMarkerClick === "function") onMarkerClick(id);
      });

      markerById.set(id, m);
    });

    fitToMarkers();
  }

  function panToId(id) {
    const m = markerById.get(id);
    if (!m) return false;
    map.setView(m.getLatLng(), Math.max(map.getZoom(), 13), { animate: true });
    try { m.openPopup(); } catch {}
    return true;
  }

  map.setView([31.0, -99.0], 5);

  return { enabled: true, setMarkers, panToId };
}

/** =========================
 * Filters UI (uniform pills)
 * ========================= */

function buildFilterBar({ resultsEl, onChange, initialState = null }) {
  const wrap = document.createElement("section");
  wrap.setAttribute("aria-label", "Filters");
  wrap.style.marginTop = "18px";
  wrap.style.marginBottom = "10px";
  wrap.style.padding = "14px 14px 12px";
  wrap.style.border = "1px solid var(--border)";
  wrap.style.borderRadius = "16px";
  wrap.style.background = "rgba(29,29,31,0.03)";
  wrap.style.boxShadow = "0 6px 18px rgba(0,0,0,.04)";

  const topRow = document.createElement("div");
  topRow.style.display = "flex";
  topRow.style.alignItems = "baseline";
  topRow.style.justifyContent = "space-between";
  topRow.style.gap = "12px";
  topRow.style.flexWrap = "wrap";

  const title = document.createElement("div");
  title.style.minWidth = "220px";
  title.innerHTML = `
    <div style="font-weight:800">Filter results</div>
    <div class="muted small" style="margin-top:2px">Start with Type. Open Advanced filters for Materials + Features.</div>
  `;

  const rightBox = document.createElement("div");
  rightBox.style.display = "flex";
  rightBox.style.alignItems = "center";
  rightBox.style.gap = "10px";
  rightBox.style.flexShrink = "0";

  const countEl = document.createElement("div");
  countEl.className = "muted";
  countEl.style.fontWeight = "700";
  countEl.style.whiteSpace = "nowrap";
  countEl.textContent = "Showing 0 of 0";

  const reset = document.createElement("button");
  reset.className = "btn btn--ghost";
  reset.type = "button";
  reset.textContent = "Reset";
  reset.style.padding = "8px 12px";
  reset.style.whiteSpace = "nowrap";

  rightBox.appendChild(countEl);
  rightBox.appendChild(reset);

  topRow.appendChild(title);
  topRow.appendChild(rightBox);

  const body = document.createElement("div");
  body.style.display = "grid";
  body.style.gap = "12px";
  body.style.marginTop = "12px";

  const typeBlock = document.createElement("div");
  typeBlock.innerHTML = `<div class="muted small" style="font-weight:700; margin-bottom:8px">Type</div>`;

  const typeChips = document.createElement("div");
  typeChips.style.display = "flex";
  typeChips.style.gap = "8px";
  typeChips.style.flexWrap = "wrap";
  typeChips.style.alignItems = "flex-start";
  typeBlock.appendChild(typeChips);

  const adv = document.createElement("details");
  adv.style.borderTop = "1px solid rgba(0,0,0,0.06)";
  adv.style.paddingTop = "10px";

  const summary = document.createElement("summary");
  summary.style.cursor = "pointer";
  summary.style.listStyle = "none";
  summary.style.display = "flex";
  summary.style.alignItems = "baseline";
  summary.style.justifyContent = "space-between";
  summary.style.gap = "10px";
  summary.style.fontWeight = "800";
  summary.style.padding = "6px 2px";

  const summaryLeft = document.createElement("span");
  summaryLeft.textContent = "Advanced filters";

  const summaryRight = document.createElement("span");
  summaryRight.className = "muted small";
  summaryRight.textContent = "Materials + Features";

  summary.appendChild(summaryLeft);
  summary.appendChild(summaryRight);
  adv.appendChild(summary);

  const advBody = document.createElement("div");
  advBody.style.marginTop = "10px";
  advBody.style.display = "grid";
  advBody.style.gap = "12px";

  const matsDetails = document.createElement("details");
  matsDetails.open = false;

  const matsSummary = document.createElement("summary");
  matsSummary.style.cursor = "pointer";
  matsSummary.style.listStyle = "none";
  matsSummary.style.fontWeight = "800";
  matsSummary.style.padding = "6px 2px";
  matsSummary.innerHTML = `Materials <span class="muted small" style="font-weight:600; margin-left:8px">Pick one or more</span>`;
  matsDetails.appendChild(matsSummary);

  const matsBody = document.createElement("div");
  matsBody.style.marginTop = "10px";

  const materialsChips = document.createElement("div");
  materialsChips.style.display = "flex";
  materialsChips.style.gap = "8px";
  materialsChips.style.flexWrap = "wrap";
  materialsChips.style.alignItems = "flex-start";
  matsBody.appendChild(materialsChips);
  matsDetails.appendChild(matsBody);

  const featsDetails = document.createElement("details");
  featsDetails.open = false;

  const featsSummary = document.createElement("summary");
  featsSummary.style.cursor = "pointer";
  featsSummary.style.listStyle = "none";
  featsSummary.style.fontWeight = "800";
  featsSummary.style.padding = "6px 2px";
  featsSummary.innerHTML = `Features <span class="muted small" style="font-weight:600; margin-left:8px">Narrow further</span>`;
  featsDetails.appendChild(featsSummary);

  const featsBody = document.createElement("div");
  featsBody.style.marginTop = "10px";

  const featureChips = document.createElement("div");
  featureChips.style.display = "flex";
  featureChips.style.gap = "8px";
  featureChips.style.flexWrap = "wrap";
  featureChips.style.alignItems = "flex-start";
  featsBody.appendChild(featureChips);
  featsDetails.appendChild(featsBody);

  const tip = document.createElement("div");
  tip.className = "muted small";
  tip.style.lineHeight = "1.35";
  tip.textContent =
    "Tip: hazardous items may require appointments and residency rules. Construction debris often goes to paid landfills/transfer stations.";

  advBody.appendChild(matsDetails);
  advBody.appendChild(featsDetails);
  advBody.appendChild(tip);
  adv.appendChild(advBody);

  body.appendChild(typeBlock);
  body.appendChild(adv);

  wrap.appendChild(topRow);
  wrap.appendChild(body);

  const initialType = initialState?.type || "all";
  const initialFlags = new Set(initialState?.flags || []);
  const initialMaterials = new Set(initialState?.materials || []);

  const state = {
    type: initialType,
    flags: initialFlags,
    materials: initialMaterials,
    typeBtnByKey: new Map(),
    materialCounts: {},
    featureCounts: {},
    typeOptions: [],
  };

  function setCounts(shown, total) {
    countEl.textContent = `Showing ${shown} of ${total}`;
  }

  function stylePill(btn, on) {
    btn.style.opacity = on ? "1" : "0.55";
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  }

  function makeTypePill(key, label) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "badge badge--rule gray";
    btn.style.cursor = "pointer";
    btn.style.border = "1px solid rgba(0,0,0,0.10)";
    btn.style.maxWidth = "100%";
    btn.textContent = label;

    btn.addEventListener("click", () => {
      state.type = key;
      for (const [k, b] of state.typeBtnByKey.entries()) stylePill(b, k === key);
      onChange({ type: state.type, flags: new Set(state.flags), materials: new Set(state.materials) });
    });

    return btn;
  }

  function makeFeatureChip(key, count) {
    const def = FEATURE_DEFS[key];
    if (!def) return null;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `badge badge--rule ${def.color}`;
    btn.textContent = `${def.label}${typeof count === "number" ? ` (${count})` : ""}`;
    btn.style.cursor = "pointer";
    btn.style.border = "1px solid rgba(0,0,0,0.10)";
    btn.style.maxWidth = "100%";
    stylePill(btn, state.flags.has(key));

    btn.addEventListener("click", () => {
      if (state.flags.has(key)) state.flags.delete(key);
      else state.flags.add(key);

      stylePill(btn, state.flags.has(key));
      onChange({ type: state.type, flags: new Set(state.flags), materials: new Set(state.materials) });
    });

    return btn;
  }

  function makeMaterialChip(label, count) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "badge badge--rule gray";
    btn.style.cursor = "pointer";
    btn.style.border = "1px solid rgba(0,0,0,0.10)";
    btn.style.maxWidth = "100%";

    const render = () => {
      const on = state.materials.has(label);
      stylePill(btn, on);
      btn.innerHTML = `${on ? "✓ " : ""}${escapeHtml(label)} <span style="opacity:.75">· ${count}</span>`;
    };

    render();

    btn.addEventListener("click", () => {
      if (state.materials.has(label)) state.materials.delete(label);
      else state.materials.add(label);
      render();
      onChange({ type: state.type, flags: new Set(state.flags), materials: new Set(state.materials) });
    });

    return btn;
  }

  function setTypeOptions(typeOptions) {
    state.typeOptions = typeOptions || [];
    typeChips.innerHTML = "";
    state.typeBtnByKey.clear();

    const all = makeTypePill("all", "All types");
    typeChips.appendChild(all);
    state.typeBtnByKey.set("all", all);

    (typeOptions || []).forEach((t) => {
      const label = `${t.label}${typeof t.count === "number" ? ` (${t.count})` : ""}`;
      const pill = makeTypePill(t.key, label);
      typeChips.appendChild(pill);
      state.typeBtnByKey.set(t.key, pill);
    });

    const resolvedType = state.typeBtnByKey.has(state.type) ? state.type : "all";
    state.type = resolvedType;
    for (const [k, b] of state.typeBtnByKey.entries()) stylePill(b, k === resolvedType);
  }

  function setFeatureChips(featureCounts) {
    state.featureCounts = featureCounts || {};
    featureChips.innerHTML = "";

    const order = ["free_to_residents", "free", "accepts_heavy_trash", "accepts_garbage", "fee_charge_likely"];
    order.forEach((k) => {
      const c = state.featureCounts[k];
      if (!c) return;
      const chip = makeFeatureChip(k, c);
      if (chip) featureChips.appendChild(chip);
    });
  }

  function setMaterialsCounts(materialCounts) {
    state.materialCounts = materialCounts || {};
    materialsChips.innerHTML = "";

    const labelsSorted = Object.keys(state.materialCounts).sort(
      (a, b) => (state.materialCounts[b] || 0) - (state.materialCounts[a] || 0)
    );

    labelsSorted.forEach((label) => {
      const chip = makeMaterialChip(label, state.materialCounts[label] || 0);
      materialsChips.appendChild(chip);
    });

    if (state.materials.size > 0) {
      adv.open = true;
      matsDetails.open = true;
    }
    if (state.flags.size > 0) {
      adv.open = true;
      featsDetails.open = true;
    }
  }

  reset.addEventListener("click", () => {
    state.type = "all";
    state.flags = new Set();
    state.materials = new Set();

    for (const [k, b] of state.typeBtnByKey.entries()) stylePill(b, k === "all");

    setMaterialsCounts(state.materialCounts);
    setFeatureChips(state.featureCounts);

    adv.open = false;
    matsDetails.open = false;
    featsDetails.open = false;

    onChange({ type: "all", flags: new Set(), materials: new Set() });
  });

  resultsEl.parentNode.insertBefore(wrap, resultsEl);

  return { setTypeOptions, setFeatureChips, setMaterialsCounts, setCounts };
}

/** =========================
 * Inline Details expander + card→map
 * ========================= */

function attachHandlers(resultsEl, mapCtl) {
  if (resultsEl.__bound) return;
  resultsEl.__bound = true;

  // Details toggle
  resultsEl.addEventListener("click", (e) => {
    if (e.target.closest("a")) return;

    const detailsBtn = e.target.closest("button[data-details-toggle]");
    if (!detailsBtn) return;

    const id = detailsBtn.getAttribute("data-details-toggle");
    const panel = resultsEl.querySelector(`[data-details-panel="${CSS.escape(id)}"]`);
    if (!panel) return;

    const open = panel.getAttribute("data-open") === "1";
    panel.setAttribute("data-open", open ? "0" : "1");
    panel.style.display = open ? "none" : "block";
    detailsBtn.textContent = open ? "Details" : "Hide details";
  });

  resultsEl.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const detailsBtn = e.target.closest("button[data-details-toggle]");
    if (!detailsBtn) return;
    e.preventDefault();
    detailsBtn.click();
  });

  // Card click → pan to marker (ignore clicks on links/buttons)
  resultsEl.addEventListener("click", (e) => {
    if (!mapCtl || !mapCtl.enabled) return;
    if (e.target.closest("a")) return;
    if (e.target.closest("button")) return;

    const card = e.target.closest("article.card");
    if (!card) return;

    const id = card.getAttribute("data-id") || "";
    if (!id) return;

    mapCtl.panToId(id);
  });
}

function renderTypeBadge(typeKey) {
  if (typeKey === "recycling") return badge("Recycling", "blue");
  if (typeKey === "transfer_station") return badge("Transfer", "orange");
  if (typeKey === "landfill") return badge("Landfill", "orange");
  if (typeKey === "hazardous_waste") return badge("Hazardous", "orange");
  if (typeKey === "public_dumpster") return badge("Public dumpster", "gray");
  return badge("Other", "gray");
}

function renderDetailsPanel(item, id) {
  const rows = [];

  if (item.phone) rows.push(`<div><strong>Phone:</strong> ${escapeHtml(item.phone)}</div>`);
  if (item.hours) rows.push(`<div><strong>Hours:</strong> ${escapeHtml(item.hours)}</div>`);
  if (item.fees) rows.push(`<div><strong>Fees:</strong> ${escapeHtml(item.fees)}</div>`);
  if (item.rules) rows.push(`<div><strong>Rules:</strong> ${escapeHtml(item.rules)}</div>`);

  if (Array.isArray(item.accepted_materials) && item.accepted_materials.length) {
    rows.push(
      `<div style="margin-top:8px"><strong>Accepted:</strong><ul style="margin:6px 0 0 18px">${item.accepted_materials
        .slice(0, 12)
        .map((x) => `<li>${escapeHtml(x)}</li>`)
        .join("")}</ul></div>`
    );
  }

  if (Array.isArray(item.not_accepted) && item.not_accepted.length) {
    rows.push(
      `<div style="margin-top:8px"><strong>Not accepted:</strong><ul style="margin:6px 0 0 18px">${item.not_accepted
        .slice(0, 12)
        .map((x) => `<li>${escapeHtml(x)}</li>`)
        .join("")}</ul></div>`
    );
  }

  const src = item.source ? `<a class="link" href="${item.source}" target="_blank" rel="noopener">Source</a>` : "";
  const ver = item.verified_date ? `<span class="muted small">Verified: ${escapeHtml(item.verified_date)}</span>` : "";

  return `
    <div data-details-panel="${escapeHtml(id)}" data-open="0"
         style="display:none; margin-top:10px; padding:10px 12px; border:1px solid var(--border); border-radius:12px; background:rgba(255,255,255,.65)">
      <div class="muted small" style="display:flex; justify-content:space-between; gap:10px; align-items:baseline; margin-bottom:8px; flex-wrap:wrap">
        <span>Details</span>
        <span style="display:flex; gap:10px; align-items:baseline; flex-wrap:wrap">${ver} ${src}</span>
      </div>
      <div class="small" style="line-height:1.45; display:grid; gap:6px">
        ${rows.length ? rows.join("") : `<div class="muted">No extra details yet.</div>`}
      </div>
    </div>
  `;
}

function renderCard(item) {
  const norm = normalizeType(item.type);
  const typeBadge = renderTypeBadge(norm.key);

  const lat = getLat(item);
  const lng = getLng(item);

  const mapsUrl = item.address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.address)}`
    : (lat !== null && lng !== null ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}` : "#");

  const facilityId = String(item.facility_id || item.id || "").trim();
  const facilityHref = facilityId ? `/facility/${encodeURIComponent(facilityId)}/` : "";

  const toggleId = getIdForItem(item) || Math.random().toString(36).slice(2);
  const detailsPanel = renderDetailsPanel(item, toggleId);

  const dataId = escapeHtml(toggleId);

  return `
    <article class="card" data-id="${dataId}">
      <div class="card__kicker">${typeBadge}</div>
      <h3>${escapeHtml(item.name || "Unnamed location")}</h3>
      ${item.address ? `<p class="card__meta">${escapeHtml(item.address)}</p>` : ""}

      <div style="display:flex; gap:12px; margin-top:10px; flex-wrap:wrap; align-items:center">
        <a class="link" href="${mapsUrl}" target="_blank" rel="noopener">Directions</a>
        ${facilityHref ? `<a class="link" href="${facilityHref}">Facility page</a>` : ""}
        <button type="button" class="btn btn--ghost" data-details-toggle="${dataId}" style="padding:8px 12px">
          Details
        </button>
      </div>

      ${detailsPanel}
    </article>
  `;
}

/** =========================
 * Main load
 * ========================= */

async function loadCityData() {
  const resultsEl =
    document.getElementById("results") ||
    document.querySelector("[data-results]") ||
    document.querySelector("main");

  if (!resultsEl) {
    console.warn("[city.js] No results container found. Expected #results.");
    return;
  }

  ensureRobotsMeta("index,follow");

  const { state, city } = getRouteParts();
  const cityName = titleCaseFromSlug(city);
  const stateName = titleCaseWordsFromSlug(state);

  if (!state || !city) {
    resultsEl.innerHTML =
      "<p class='muted'>City route not detected (expected #state/city or /state/city/).</p>";
    return;
  }

  applyCitySEO({ cityName, stateName });

  let items = null;

  const curated = readCuratedOverlay();
  const curatedItems = getCuratedItems(curated);

  if (curatedItems && curatedItems.length) {
    items = curatedItems;

    if (shouldBlendCuratedWithData(state, city)) {
      let fallback = await fetchCityDataPayload(state, city, true);
      if (fallback && !Array.isArray(fallback) && Array.isArray(fallback.facilities)) {
        fallback = fallback.facilities;
      }
      if (Array.isArray(fallback) && fallback.length) {
        items = [...curatedItems, ...fallback];
      }
    }
  } else {
    items = await fetchCityDataPayload(state, city, false);
    if (!items) {
      resultsEl.innerHTML = "<p class='muted'>Unable to load locations right now.</p>";
      return;
    }
  }

  // Normalize "city object" JSON -> array
  if (items && !Array.isArray(items) && Array.isArray(items.facilities)) {
    items = items.facilities;
  }

  if (!Array.isArray(items) || items.length === 0) {
    resultsEl.innerHTML = "<p class='muted'>No locations found.</p>";
    return;
  }

  items = dedupeCityItems(items);

  const enriched = items.map((it) => {
    const t = normalizeType(it.type);
    const mats = normalizeMaterialsFromAccepted(it);
    return {
      ...it,
      __typeKey: t.key,
      __typeLabel: t.label,
      __flags: deriveFlags(it),
      __materials: mats,
      __id: getIdForItem(it),
    };
  });

  // Ensure Leaflet is ready (CDN/cache can be weird on live)
  await waitForLeaflet({ timeoutMs: 5000, stepMs: 50 });

  const mapCtl = makeMapController();

  // Type options
  const typeCount = new Map();
  enriched.forEach((it) => {
    const k = it.__typeKey || "other";
    typeCount.set(k, (typeCount.get(k) || 0) + 1);
  });

  const typeOptions = Array.from(typeCount.entries())
    .map(([key, count]) => {
      const first = enriched.find((x) => x.__typeKey === key);
      const label = first?.__typeLabel || key;
      return { key, label, count };
    })
    .sort((a, b) => {
      const rank = (k) => {
        if (k === "landfill") return 1;
        if (k === "transfer_station") return 2;
        if (k === "recycling") return 3;
        if (k === "hazardous_waste") return 4;
        if (k === "public_dumpster") return 5;
        return 99;
      };
      const ra = rank(a.key), rb = rank(b.key);
      if (ra !== rb) return ra - rb;
      return a.label.localeCompare(b.label);
    });

  // Feature counts
  const featureCounts = {};
  enriched.forEach((it) => {
    (it.__flags || []).forEach((f) => {
      featureCounts[f] = (featureCounts[f] || 0) + 1;
    });
  });

  // Materials counts
  const materialCounts = {};
  enriched.forEach((it) => {
    (it.__materials || []).forEach((m) => {
      materialCounts[m] = (materialCounts[m] || 0) + 1;
    });
  });

  function render(itemsToRender) {
    resultsEl.innerHTML = itemsToRender.length
      ? itemsToRender.map((it) => renderCard(it)).join("")
      : "<p class='muted'>No locations match those filters.</p>";

    mapCtl.setMarkers(itemsToRender, (id) => {
      const card = resultsEl.querySelector(`article.card[data-id="${CSS.escape(id)}"]`);
      if (card) {
        card.scrollIntoView({ behavior: "smooth", block: "start" });
        card.style.outline = "2px solid rgba(46,110,166,0.35)";
        card.style.outlineOffset = "4px";
        setTimeout(() => { card.style.outline = ""; card.style.outlineOffset = ""; }, 1200);
      }
    });
  }

  function applyFilters(filterState) {
    const filtered = enriched.filter((it) => {
      if (filterState.type && filterState.type !== "all") {
        if (it.__typeKey !== filterState.type) return false;
      }

      if (filterState.flags && filterState.flags.size > 0) {
        for (const needed of filterState.flags) {
          if (!(it.__flags || []).includes(needed)) return false;
        }
      }

      if (filterState.materials && filterState.materials.size > 0) {
        const mats = it.__materials || [];
        let any = false;
        for (const needed of filterState.materials) {
          if (mats.includes(needed)) {
            any = true;
            break;
          }
        }
        if (!any) return false;
      }

      return true;
    });

    filterBar.setCounts(filtered.length, enriched.length);
    render(filtered);
    attachHandlers(resultsEl, mapCtl);
  }

  const queryInitial = initialFilterStateFromQuery();
  const allowedTypes = new Set(["all", ...typeOptions.map((x) => x.key)]);
  const allowedMaterials = new Set(Object.keys(materialCounts));

  const effectiveInitial = {
    type: allowedTypes.has(queryInitial.type) ? queryInitial.type : "all",
    flags: new Set(),
    materials: new Set(
      Array.from(queryInitial.materials || []).filter((m) => allowedMaterials.has(m))
    ),
  };

  const filterBar = buildFilterBar({
    resultsEl,
    onChange: applyFilters,
    initialState: effectiveInitial,
  });

  filterBar.setTypeOptions(typeOptions);
  filterBar.setMaterialsCounts(materialCounts);
  filterBar.setFeatureChips(featureCounts);

  const hasInitialFilters =
    effectiveInitial.type !== "all" ||
    effectiveInitial.flags.size > 0 ||
    effectiveInitial.materials.size > 0;

  if (hasInitialFilters) {
    applyFilters({
      type: effectiveInitial.type,
      flags: new Set(effectiveInitial.flags),
      materials: new Set(effectiveInitial.materials),
    });
  } else {
    filterBar.setCounts(enriched.length, enriched.length);
    render(enriched);
    attachHandlers(resultsEl, mapCtl);
  }

  alignResultsAnchor(resultsEl);
}

document.addEventListener("DOMContentLoaded", loadCityData);
