const fs = require("fs");
const path = require("path");

// Usage:
//   node scripts/generate-city-pages.js texas
//   node scripts/generate-city-pages.js california
//   node scripts/generate-city-pages.js texas houston
const STATE_ARG = String(process.argv[2] || "texas").trim().toLowerCase();
const CITY_FILTER_ARG = String(process.argv[3] || "").trim().toLowerCase();

const CITY_LIST_PATH = path.join("scripts", `cities-${STATE_ARG}.json`);
const TEMPLATE_PATH = "city-template.html";
const OUTPUT_BASE = ".";
const NEIGHBORS_PATH = path.join("data", STATE_ARG, "_neighbors.json");
const CURATED_BASE = path.join("data", "manual");
const CITY_DATA_BASE = "data";
const BASE_URL = "https://junkscout.io";

function safeReadJson(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return fallback;
  }
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

function isHoustonCity(state, city) {
  return String(state || "").toLowerCase() === "texas" && String(city || "").toLowerCase() === "houston";
}

function isDallasCity(state, city) {
  return String(state || "").toLowerCase() === "texas" && String(city || "").toLowerCase() === "dallas";
}

function isMiamiCity(state, city) {
  return String(state || "").toLowerCase() === "florida" && String(city || "").toLowerCase() === "miami";
}

function isAustinCity(state, city) {
  return String(state || "").toLowerCase() === "texas" && String(city || "").toLowerCase() === "austin";
}

function isSanAntonioCity(state, city) {
  return String(state || "").toLowerCase() === "texas" && String(city || "").toLowerCase() === "san-antonio";
}

function isLosAngelesCity(state, city) {
  return String(state || "").toLowerCase() === "california" && String(city || "").toLowerCase() === "los-angeles";
}

function isSanFranciscoCity(state, city) {
  return String(state || "").toLowerCase() === "california" && String(city || "").toLowerCase() === "san-francisco";
}

function isAtlantaCity(state, city) {
  return String(state || "").toLowerCase() === "georgia" && String(city || "").toLowerCase() === "atlanta";
}

function hasCuratedManualData(state, city) {
  return getCuratedItems(getCuratedObject(state, city)).length > 0;
}

function isEnhancedManualCity(state, city) {
  return hasCuratedManualData(state, city);
}

function shouldBlendCuratedWithData(state, city) {
  if (isHoustonCity(state, city)) return false;
  if (!hasCuratedManualData(state, city)) return false;
  return getDataFileItems(state, city).length > 0;
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

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function mapsUrlForItem(item) {
  const address = String(item?.address || "").trim();
  const lat = toNumber(item?.lat ?? item?.latitude);
  const lng = toNumber(item?.lng ?? item?.lon ?? item?.longitude);

  if (address) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  }
  if (lat !== null && lng !== null) {
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  }
  return "";
}

function normalizeType(rawType) {
  const t = String(rawType || "").toLowerCase();
  if (t.includes("landfill")) return { label: "Landfill", badgeClass: "badge--orange" };
  if (t.includes("transfer")) return { label: "Transfer", badgeClass: "badge--orange" };
  if (t.includes("recycl")) return { label: "Recycling", badgeClass: "badge--blue" };
  if (t.includes("hazard")) return { label: "Hazardous", badgeClass: "badge--orange" };
  if (t.includes("dumpster")) return { label: "Public dumpster", badgeClass: "badge--gray" };
  if (t.includes("depository")) return { label: "Drop-off", badgeClass: "badge--blue" };
  return { label: "Drop-off", badgeClass: "badge--gray" };
}

function normalizeKeyText(value = "") {
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
    const value = String(raw || "").trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function itemCompletenessScore(item) {
  if (!item || typeof item !== "object") return 0;
  const hasText = (v) => String(v || "").trim().length > 0;

  let score = 0;
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

  const lat = toNumber(item?.lat ?? item?.latitude);
  const lng = toNumber(item?.lng ?? item?.lon ?? item?.longitude);
  if (lat !== null && lng !== null) score += 2;

  const acceptedCount = Array.isArray(item.accepted_materials) ? item.accepted_materials.length : 0;
  const notAcceptedCount = Array.isArray(item.not_accepted) ? item.not_accepted.length : 0;
  score += Math.min(3, acceptedCount) + Math.min(2, notAcceptedCount);
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
  const type = normalizeType(item?.type).label.toLowerCase();
  if (name && address) return `na:${name}|${address}|${type}`;

  const lat = toNumber(item?.lat ?? item?.latitude);
  const lng = toNumber(item?.lng ?? item?.lon ?? item?.longitude);
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

function getCuratedObject(state, city) {
  const stateDir = String(state || "").toLowerCase();
  const citySlug = String(city || "").toLowerCase();
  const resolvedPath = path.join(CURATED_BASE, stateDir, `${citySlug}.resolved.json`);
  const rawPath = path.join(CURATED_BASE, stateDir, `${citySlug}.json`);
  return safeReadJson(resolvedPath) || safeReadJson(rawPath) || null;
}

function getCuratedItems(curated) {
  if (!curated || typeof curated !== "object") return [];

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

  return [];
}

function getDataFileItems(state, city) {
  const dataPath = path.join(CITY_DATA_BASE, state, `${city}.json`);
  const data = safeReadJson(dataPath, null);
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object" && Array.isArray(data.facilities)) {
    return data.facilities;
  }
  return [];
}

function readCityDataItems(state, city) {
  const curated = getCuratedObject(state, city);
  const curatedItems = getCuratedItems(curated);

  if (curatedItems.length > 0 && shouldBlendCuratedWithData(state, city)) {
    const baseItems = getDataFileItems(state, city);
    if (baseItems.length > 0) {
      return {
        items: dedupeCityItems([...curatedItems, ...baseItems]),
        source: "curated_blend",
      };
    }
  }

  if (curatedItems.length > 0) {
    return { items: dedupeCityItems(curatedItems), source: "curated" };
  }

  const dataItems = getDataFileItems(state, city);
  if (dataItems.length > 0) {
    return { items: dedupeCityItems(dataItems), source: "data_file" };
  }
  return { items: [], source: "none" };
}

function cityHasRenderableData(state, city) {
  const { items } = readCityDataItems(state, city);
  return Array.isArray(items) && items.length > 0;
}

function buildInitialResultsHtml(items = [], options = {}) {
  const requestedLimit = Number(options?.limit);
  const limit = Number.isFinite(requestedLimit) && requestedLimit > 0 ? Math.floor(requestedLimit) : 12;
  const slice = Array.isArray(items) ? items.slice(0, limit) : [];
  if (slice.length === 0) return `<p class="muted">No locations found.</p>`;

  return slice
    .map((item) => {
      const name = escapeHtml(item?.name || "Unnamed location");
      const address = String(item?.address || "").trim();
      const facilityId = String(item?.facility_id || item?.id || "").trim();
      const facilityHref = facilityId ? `/facility/${encodeURIComponent(facilityId)}/` : "";
      const mapsUrl = mapsUrlForItem(item);
      const rawSourceUrl = String(item?.source || item?.website || item?.osm_url || "").trim();
      const sourceUrl =
        /^https?:\/\//i.test(rawSourceUrl) && rawSourceUrl.toLowerCase() !== "https://osm"
          ? rawSourceUrl
          : "";

      const t = normalizeType(item?.type);
      const badgeHtml = `<span class="badge ${t.badgeClass}">${escapeHtml(t.label)}</span>`;

      const accepted = Array.isArray(item?.accepted_materials) ? item.accepted_materials : [];
      const acceptedSummary =
        accepted.length > 0
          ? `<p class="card__meta">Accepts: ${escapeHtml(accepted.slice(0, 3).join(", "))}</p>`
          : "";

      const verified = String(item?.verified_date || "").trim();
      const verifiedLine = verified
        ? `<p class="card__meta">Verified ${escapeHtml(verified)}</p>`
        : "";

      return `
        <article class="card">
          <div class="card__kicker">${badgeHtml}</div>
          <h3>${name}</h3>
          ${address ? `<p class="card__meta">${escapeHtml(address)}</p>` : ""}
          ${acceptedSummary}
          ${verifiedLine}
          <div style="display:flex; gap:12px; margin-top:10px; flex-wrap:wrap; align-items:center">
            ${mapsUrl ? `<a class="link" href="${escapeHtml(mapsUrl)}" target="_blank" rel="noopener">Directions</a>` : ""}
            ${facilityHref ? `<a class="link" href="${facilityHref}">Facility page</a>` : ""}
            ${sourceUrl ? `<a class="link" href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener">Source</a>` : ""}
          </div>
        </article>
      `.trim();
    })
    .join("\n");
}

function injectInitialResults(html, resultsHtml) {
  const regex = /(<section class="cards" id="results"[^>]*>)[\s\S]*?(<\/section>)/i;
  if (regex.test(html)) {
    return html.replace(regex, `$1\n${resultsHtml}\n$2`);
  }
  return html;
}

function buildMeta({ state, city }) {
  const cityName = titleCaseFromSlug(city);
  const stateAbbrev = stateAbbrevFromSlug(state);
  let title = `${cityName}, ${stateAbbrev} Trash Dump, Transfer Stations & Landfills | JunkScout`;
  let description =
    `Public dumps, landfills, transfer stations, and recycling drop-offs near ${cityName}, ${stateAbbrev} with rules and accepted materials when available.`;

  if (isHoustonCity(state, city)) {
    title = "Houston Trash Dump, Transfer Stations & Landfills | JunkScout";
    description =
      "Compare Houston dump, landfill, transfer station, and recycling drop-off options with fees, hours, resident rules, and accepted materials.";
  } else if (isDallasCity(state, city)) {
    title = "Dallas Trash Dump, Transfer Stations & Landfills | JunkScout";
    description =
      "Compare Dallas dump, landfill, transfer station, and recycling drop-off options with fees, hours, resident rules, and accepted materials.";
  } else if (isMiamiCity(state, city)) {
    title = "Miami Trash Dump, Transfer Stations & Landfills | JunkScout";
    description =
      "Compare Miami-Dade trash and recycling centers, home chemical collection sites, and nearby disposal options with hours, resident rules, and accepted materials.";
  } else if (isAustinCity(state, city)) {
    title = "Austin Trash Dump, Transfer Stations & Landfills | JunkScout";
    description =
      "Compare Austin dump, landfill, transfer station, and recycling drop-off options with fees, hours, resident rules, and accepted materials.";
  } else if (isSanAntonioCity(state, city)) {
    title = "San Antonio Trash Dump, Transfer Stations & Landfills | JunkScout";
    description =
      "Compare San Antonio dump, landfill, transfer station, and recycling drop-off options with fees, hours, resident rules, and accepted materials.";
  } else if (isLosAngelesCity(state, city)) {
    title = "Los Angeles Trash Dump, Transfer Stations & Landfills | JunkScout";
    description =
      "Compare Los Angeles dump, landfill, transfer station, and recycling drop-off options with fees, hours, resident rules, and accepted materials.";
  } else if (isSanFranciscoCity(state, city)) {
    title = "San Francisco Trash Dump, Transfer Stations & Landfills | JunkScout";
    description =
      "Compare San Francisco dump, landfill, transfer station, and recycling drop-off options with fees, hours, resident rules, and accepted materials.";
  } else if (isAtlantaCity(state, city)) {
    title = "Atlanta Trash Dump, Transfer Stations & Landfills | JunkScout";
    description =
      "Compare Atlanta dump, landfill, transfer station, and recycling drop-off options with fees, hours, resident rules, and accepted materials.";
  } else if (isEnhancedManualCity(state, city)) {
    title = `${cityName} Trash Dump, Transfer Stations & Landfills | JunkScout`;
    description =
      `Compare ${cityName} dump, landfill, transfer station, and recycling drop-off options with fees, hours, resident rules, and accepted materials.`;
  }

  const canonicalPath = `/${state}/${city}/`;
  const canonicalUrl = `${BASE_URL}${canonicalPath}`;

  return {
    title,
    description,
    canonicalPath,
    canonicalUrl,
    ogTitle: title,
    ogDesc: description,
  };
}

function buildJsonLd({ state, city, meta }) {
  const cityName = titleCaseFromSlug(city);
  const stateName = titleCaseFromSlug(state);
  const stateAbbrev = stateAbbrevFromSlug(state);

  const url = meta.canonicalUrl;
  const stateUrl = `${BASE_URL}/${state}/`;
  const siteUrl = `${BASE_URL}/`;

  const graph = [
    {
      "@type": "Organization",
      "@id": `${siteUrl}#org`,
      name: "JunkScout",
      url: siteUrl,
    },
    {
      "@type": "WebSite",
      "@id": `${siteUrl}#website`,
      name: "JunkScout",
      url: siteUrl,
      publisher: { "@id": `${siteUrl}#org` },
      potentialAction: {
        "@type": "SearchAction",
        target: {
          "@type": "EntryPoint",
          urlTemplate: `${BASE_URL}/?where={search_term_string}`,
        },
        "query-input": "required name=search_term_string",
      },
    },
    {
      "@type": "BreadcrumbList",
      "@id": `${url}#breadcrumb`,
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: siteUrl },
        { "@type": "ListItem", position: 2, name: stateName, item: stateUrl },
        { "@type": "ListItem", position: 3, name: cityName, item: url },
      ],
    },
    {
      "@type": "Place",
      "@id": `${url}#place`,
      name: `Dump and landfill options in ${cityName}, ${stateName}`,
      address: {
        "@type": "PostalAddress",
        addressLocality: cityName,
        addressRegion: stateAbbrev,
        addressCountry: "US",
      },
      hasMap: `https://www.google.com/maps/search/${encodeURIComponent(`dump landfill ${cityName} ${stateAbbrev}`)}`,
      url,
    },
    {
      "@type": "WebPage",
      "@id": `${url}#webpage`,
      name: meta.title,
      description: meta.description,
      url,
      isPartOf: { "@id": `${siteUrl}#website` },
      about: { "@id": `${url}#place` },
      breadcrumb: { "@id": `${url}#breadcrumb` },
    },
  ];

  if (isHoustonCity(state, city)) {
    graph.push({
      "@type": "FAQPage",
      "@id": `${url}#faq`,
      mainEntity: [
        {
          "@type": "Question",
          name: "Where can I dump trash in Houston today?",
          acceptedAnswer: {
            "@type": "Answer",
            text:
              "Houston residents usually start with City of Houston depositories or recycling centers for household cleanup, use Environmental Service Centers for paint and chemicals, and compare private transfer or landfill options for heavier paid loads.",
          },
        },
        {
          "@type": "Question",
          name: "Where can I drop off trash for free in Houston?",
          acceptedAnswer: {
            "@type": "Answer",
            text:
              "Some Houston city and county programs are free for eligible residents with valid ID and proof of address, but they usually limit visit counts, load types, or accepted materials.",
          },
        },
        {
          "@type": "Question",
          name: "What do Houston transfer stations and landfills charge?",
          acceptedAnswer: {
            "@type": "Answer",
            text:
              "Transfer station and landfill fees usually vary by load size, weight, and material type. Check the listing source links and confirm current rates before driving.",
          },
        },
        {
          "@type": "Question",
          name: "Are there landfills near Houston that accept large loads?",
          acceptedAnswer: {
            "@type": "Answer",
            text:
              "Yes. Houston-area options such as Atascocita, Fairbanks, and private transfer facilities can take larger paid loads, but material rules and pricing vary by site.",
          },
        },
      ],
    });
  } else if (isDallasCity(state, city)) {
    graph.push({
      "@type": "FAQPage",
      "@id": `${url}#faq`,
      mainEntity: [
        {
          "@type": "Question",
          name: "Where can I dump trash in Dallas today?",
          acceptedAnswer: {
            "@type": "Answer",
            text:
              "Dallas residents usually compare the three city transfer stations and McCommas Bluff Landfill for household self-haul loads, then use the Dallas County home chemical collection center for paint, batteries, and other hazardous household items.",
          },
        },
        {
          "@type": "Question",
          name: "Where can I drop off trash for free in Dallas?",
          acceptedAnswer: {
            "@type": "Answer",
            text:
              "Dallas residents in passenger cars, pickups, and trailers under 15 feet hauling waste from their residence can use city landfill and transfer station services at no charge with valid ID and proof of residency.",
          },
        },
        {
          "@type": "Question",
          name: "What do Dallas transfer stations and landfills charge?",
          acceptedAnswer: {
            "@type": "Answer",
            text:
              "Fees vary by load size, material type, and facility policy. Check source links and verify before you drive.",
          },
        },
      ],
    });
  } else if (isMiamiCity(state, city)) {
    graph.push({
      "@type": "FAQPage",
      "@id": `${url}#faq`,
      mainEntity: [
        {
          "@type": "Question",
          name: "Where can I dump trash in Miami today?",
          acceptedAnswer: {
            "@type": "Answer",
            text:
              "Eligible Miami-Dade residents usually use neighborhood trash and recycling centers for bulky household cleanup, yard cuttings, and small construction debris, then use the county home chemical centers for paint, batteries, bulbs, and electronics.",
          },
        },
        {
          "@type": "Question",
          name: "Where can I drop off trash for free in Miami?",
          acceptedAnswer: {
            "@type": "Answer",
            text:
              "Miami-Dade neighborhood centers and home chemical centers are resident services tied to eligible waste-fee customers or Miami-Dade residents, not general public landfills. Bring valid Florida ID and confirm the county rules before visiting.",
          },
        },
        {
          "@type": "Question",
          name: "Are Miami trash and recycling centers open daily?",
          acceptedAnswer: {
            "@type": "Answer",
            text:
              "Yes. Miami-Dade lists neighborhood trash and recycling centers as open daily from 7 a.m. to 5:30 p.m., while the home chemical centers run Wednesday through Sunday from 9 a.m. to 5 p.m.",
          },
        },
      ],
    });
  } else if (isAustinCity(state, city)) {
    graph.push({
      "@type": "FAQPage",
      "@id": `${url}#faq`,
      mainEntity: [
        {
          "@type": "Question",
          name: "Where can I dump trash in Austin today?",
          acceptedAnswer: {
            "@type": "Answer",
            text:
              "Austin has city, county, and private options including recycling drop-offs, transfer stations, and landfill access depending on your load.",
          },
        },
        {
          "@type": "Question",
          name: "Where can I drop off trash for free in Austin?",
          acceptedAnswer: {
            "@type": "Answer",
            text:
              "Some Austin-area services include resident-focused or low-cost options for specific materials. Always confirm current rules, fees, and accepted items before visiting.",
          },
        },
        {
          "@type": "Question",
          name: "What do Austin transfer stations and landfills charge?",
          acceptedAnswer: {
            "@type": "Answer",
            text:
              "Fees vary by load size, material type, and facility policy. Check the source links and call ahead for current pricing.",
          },
        },
      ],
    });
  } else if (isSanAntonioCity(state, city)) {
    graph.push({
      "@type": "FAQPage",
      "@id": `${url}#faq`,
      mainEntity: [
        {
          "@type": "Question",
          name: "Where can I dump trash in San Antonio today?",
          acceptedAnswer: {
            "@type": "Answer",
            text:
              "Most San Antonio residents start with the city's bulky waste collection centers for household cleanup, use the Culebra HHW site or city HHW events for paint and chemicals, and compare private options such as TDS Starcrest or Covel Gardens when they need paid transfer or landfill disposal.",
          },
        },
        {
          "@type": "Question",
          name: "Where can I drop off trash for free in San Antonio?",
          acceptedAnswer: {
            "@type": "Answer",
            text:
              "San Antonio bulky drop-off and household hazardous waste services are free for eligible solid waste customers who show a recent CPS Energy bill with the environmental fee plus photo ID. Free landfill days also exist, but only on select city event dates.",
          },
        },
        {
          "@type": "Question",
          name: "What do San Antonio transfer stations and landfills charge?",
          acceptedAnswer: {
            "@type": "Answer",
            text:
              "Private San Antonio disposal sites usually charge by material category, weight, or load type, while city-run bulky and HHW programs use eligibility rules instead of a standard public gate fee. Check the source link on each listing before you drive.",
          },
        },
      ],
    });
  } else if (isLosAngelesCity(state, city)) {
    graph.push({
      "@type": "FAQPage",
      "@id": `${url}#faq`,
      mainEntity: [
        {
          "@type": "Question",
          name: "Where can I dump trash in Los Angeles today?",
          acceptedAnswer: {
            "@type": "Answer",
            text:
              "Los Angeles-area residents typically compare S.A.F.E. centers for household hazardous waste or e-waste, South Gate or Puente Hills for transfer-station access, and regional landfill options such as Scholl Canyon or Sunshine Canyon depending on the load.",
          },
        },
        {
          "@type": "Question",
          name: "Where can I drop off trash for free in Los Angeles?",
          acceptedAnswer: {
            "@type": "Answer",
            text:
              "Los Angeles household hazardous waste programs and some residential recycling programs can be free for eligible household quantities, while most transfer stations and landfills charge by load size or weight. Some S.A.F.E. locations have limited schedules or e-waste-only rules, so confirm eligibility before visiting.",
          },
        },
        {
          "@type": "Question",
          name: "What do Los Angeles transfer stations and landfills charge?",
          acceptedAnswer: {
            "@type": "Answer",
            text:
              "Fees vary by load size, material type, and operator policy. Check source links and verify rates before you drive.",
          },
        },
      ],
    });
  } else if (isSanFranciscoCity(state, city)) {
    graph.push({
      "@type": "FAQPage",
      "@id": `${url}#faq`,
      mainEntity: [
        {
          "@type": "Question",
          name: "Where can I dump trash in San Francisco today?",
          acceptedAnswer: {
            "@type": "Answer",
            text:
              "San Francisco has city-focused and regional options including transfer stations, recycling centers, and nearby landfill access depending on load type and rules.",
          },
        },
        {
          "@type": "Question",
          name: "Where can I drop off trash for free in San Francisco?",
          acceptedAnswer: {
            "@type": "Answer",
            text:
              "Some San Francisco-area services are resident-focused and may offer low-cost or no-cost drop-off for specific items. Confirm eligibility, limits, and current rules before visiting.",
          },
        },
        {
          "@type": "Question",
          name: "What do San Francisco transfer stations and landfills charge?",
          acceptedAnswer: {
            "@type": "Answer",
            text:
              "Fees vary by load size, material type, and operator policy. Check source links and verify current pricing before you drive.",
          },
        },
      ],
    });
  } else if (isAtlantaCity(state, city)) {
    graph.push({
      "@type": "FAQPage",
      "@id": `${url}#faq`,
      mainEntity: [
        {
          "@type": "Question",
          name: "Where can I dump trash in Atlanta today?",
          acceptedAnswer: {
            "@type": "Answer",
            text:
              "Atlanta has a mix of city, county, nonprofit, and private options including transfer stations, landfill access, hard-to-recycle drop-offs, and recycling centers depending on your load.",
          },
        },
        {
          "@type": "Question",
          name: "Where can I recycle or drop off specialty items in Atlanta?",
          acceptedAnswer: {
            "@type": "Answer",
            text:
              "Atlanta-area residents often use CHaRM sites, city recycling events, and municipal recycling centers for paint, batteries, electronics, glass, tires, and specialty materials. Confirm the current accepted-items list before visiting.",
          },
        },
        {
          "@type": "Question",
          name: "What do Atlanta transfer stations and landfills charge?",
          acceptedAnswer: {
            "@type": "Answer",
            text:
              "Fees vary by facility, load type, and residency rules. Check source links and confirm rates, eligibility, and accepted materials before you drive.",
          },
        },
      ],
    });
  } else if (isEnhancedManualCity(state, city)) {
    graph.push({
      "@type": "FAQPage",
      "@id": `${url}#faq`,
      mainEntity: [
        {
          "@type": "Question",
          name: `Where can I dump trash in ${cityName} today?`,
          acceptedAnswer: {
            "@type": "Answer",
            text:
              `${cityName} has a mix of public drop-off sites, transfer stations, landfills, recycling centers, and specialty programs depending on your load. Use the city guide to compare source-linked options before you drive.`,
          },
        },
        {
          "@type": "Question",
          name: `Are there free or resident-only dump options in ${cityName}?`,
          acceptedAnswer: {
            "@type": "Answer",
            text:
              `Some ${cityName}-area services are resident-focused and may offer free or lower-cost drop-off for specific materials. Always confirm proof-of-address rules, item limits, and current eligibility before arrival.`,
          },
        },
        {
          "@type": "Question",
          name: `What do ${cityName} transfer stations and landfills charge?`,
          acceptedAnswer: {
            "@type": "Answer",
            text:
              `Fees vary by load size, material type, operator, and residency. Check the source links for each facility and verify the latest rates before you drive.`,
          },
        },
        {
          "@type": "Question",
          name: `What materials can I bring to a drop-off site in ${cityName}?`,
          acceptedAnswer: {
            "@type": "Answer",
            text:
              `Accepted materials vary by site and can include household trash, yard waste, construction debris, recyclables, tires, electronics, paint, batteries, and other specialty items. Always confirm the posted acceptance list before visiting.`,
          },
        },
      ],
    });
  }

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

function injectBodySeed(html, state, city, options = {}) {
  const attrs = [
    `data-state="${escapeHtml(state)}"`,
    `data-city="${escapeHtml(city)}"`,
  ];

  if (options.enhancedCity) attrs.push(`data-enhanced-city="1"`);
  if (options.blendCuratedWithData) attrs.push(`data-blend-curated-with-data="1"`);

  return html.replace("<body>", `<body ${attrs.join(" ")}>`);
}

function normalizeQuickStartType(rawType = "") {
  const value = String(rawType || "").toLowerCase();
  if (value.includes("hazard")) {
    return {
      key: "hazardous-waste",
      title: "Hazardous waste options",
      meta: "Paint, chemicals, batteries, and specialty drop-off",
    };
  }
  if (value.includes("recycl") || value.includes("reuse")) {
    return {
      key: "recycling",
      title: "Recycling drop-off",
      meta: "Sorted recyclables, electronics, and reusable materials",
    };
  }
  if (value.includes("transfer")) {
    return {
      key: "transfer",
      title: "Transfer stations",
      meta: "Mixed loads and faster unload options",
    };
  }
  if (value.includes("landfill")) {
    return {
      key: "landfill",
      title: "Landfills",
      meta: "Large loads and heavy disposal",
    };
  }
  if (value.includes("dumpster")) {
    return {
      key: "dumpster",
      title: "Public dumpster options",
      meta: "Fast neighborhood and city drop-off points",
    };
  }
  return {
    key: "drop-off",
    title: "Drop-off sites",
    meta: "General public options with source-linked rules",
  };
}

function buildGenericQuickStartBlock({ state, city, items }) {
  const priorityOrder = [
    "hazardous-waste",
    "recycling",
    "transfer",
    "landfill",
    "dumpster",
    "drop-off",
  ];
  const byKey = new Map();

  for (const item of Array.isArray(items) ? items : []) {
    const quickType = normalizeQuickStartType(item?.type);
    if (!byKey.has(quickType.key)) byKey.set(quickType.key, quickType);
  }

  const cards = priorityOrder
    .map((key) => byKey.get(key))
    .filter(Boolean)
    .slice(0, 4);

  if (cards.length === 0) return "";

  return `
<section class="quickstart" aria-label="Start here">
  <div class="quickstart__head">
    <div class="quickstart__titleline">Start here</div>
  </div>
  <div class="quickstart__grid">
    ${cards
      .map(
        (card) => `
    <a class="quickstart__item" href="/${escapeHtml(state)}/${escapeHtml(city)}/?type=${escapeHtml(card.key)}#results">
      <span class="quickstart__title">${escapeHtml(card.title)}</span>
      <span class="quickstart__meta">${escapeHtml(card.meta)}</span>
      <span class="quickstart__arrow" aria-hidden="true">&rsaquo;</span>
    </a>`
      )
      .join("\n")}
  </div>
</section>
`.trim();
}

function injectGenericEnhancedIntentCopy(html, { state, city, items }) {
  const cityName = titleCaseFromSlug(city);
  const stateName = titleCaseFromSlug(state);
  const quickStartBlock = buildGenericQuickStartBlock({ state, city, items });

  let output = html;
  output = output.replace(
    /(<h1 id="cityTitle">)[\s\S]*?(<\/h1>)/,
    `$1Where to dump trash in ${escapeHtml(cityName)}, ${escapeHtml(stateName)}$2`
  );
  output = output.replace(
    /(<p class="subhead" id="cityAnswer">)[\s\S]*?(<\/p>)/,
    `$1Find public landfills, transfer stations, and recycling drop-offs in ${escapeHtml(cityName)}, ${escapeHtml(stateName)}, with hours, rules, and accepted materials when available.$2`
  );
  output = output.replace(
    /(<p class="muted" id="citySubhead"[^>]*>)[\s\S]*?(<\/p>)/,
    `$1Need to dump trash in ${escapeHtml(cityName)} fast? Start with these verified options and confirm rules before you drive.$2${quickStartBlock ? `\n${quickStartBlock}` : ""}`
  );
  output = output.replace(
    /(<span id="cityNameInline">)[\s\S]*?(<\/span>)/,
    `$1${escapeHtml(cityName)}$2`
  );
  output = output.replace(
    /(<h2 id="faqDumpWhere">)[\s\S]*?(<\/h2>)/,
    `$1Where can I dump trash in ${escapeHtml(cityName)} today?$2`
  );
  output = output.replace(
    /(<h2 id="faqDumpFree">)[\s\S]*?(<\/h2>)/,
    `$1Where can I drop off trash for free in ${escapeHtml(cityName)}?$2`
  );
  output = output.replace(
    /(<p id="faqDumpFreeBody">)[\s\S]*?(<\/p>)/,
    `$1Some ${escapeHtml(cityName)}-area services are resident-focused and may offer free or lower-cost drop-off for specific materials, while private transfer stations and landfills usually charge by load size or material type.$2`
  );
  return output;
}

function buildNearbyHtml({ state, city, neighborsMap, validCitySet }) {
  const itemsRaw = neighborsMap?.[city] || neighborsMap?.[String(city).toLowerCase()] || [];
  if (!Array.isArray(itemsRaw) || itemsRaw.length === 0) return "";

  const items = itemsRaw
    .map((n) => {
      const slug =
        (n && (n.slug || n.city || n.city_slug || n.to)) ||
        (typeof n === "string" ? n : null);
      if (!slug) return null;

      const cleanSlug = String(slug).trim().toLowerCase().replace(/\s+/g, "-");
      const label =
        n && (n.label || n.name)
          ? String(n.label || n.name)
          : titleCaseFromSlug(cleanSlug);

      const d =
        (n && (n.distance_mi ?? n.distanceMiles ?? n.mi ?? n.distance)) ?? null;
      const distanceText =
        typeof d === "number" && Number.isFinite(d) && d >= 1 ? `${Math.round(d)} mi` : "";

      return { slug: cleanSlug, label, distanceText };
    })
    .filter(Boolean)
    .filter((x) => x.slug !== city)
    .filter((x) => {
      if (!validCitySet || !(validCitySet instanceof Set)) return true;
      return validCitySet.has(x.slug);
    });

  if (items.length === 0) return "";

  const cityName = titleCaseFromSlug(city);
  const stateName = titleCaseFromSlug(state);

  return `
<section class="seo-copy" aria-label="Nearby locations">
  <h2>Nearby dump and landfill locations</h2>
  <p class="muted">
    If you do not see the right option in ${escapeHtml(cityName)}, check these nearby cities in ${escapeHtml(stateName)}.
  </p>

  <div class="cityhub__grid" style="margin-top:10px">
    ${items
      .map((x) => `
      <a class="cityhub__pill" href="/${escapeHtml(state)}/${escapeHtml(x.slug)}/">
        ${escapeHtml(x.label)}${x.distanceText ? ` <span class="muted" style="font-weight:600">&middot; ${escapeHtml(x.distanceText)}</span>` : ""}
      </a>
    `)
      .join("")}
  </div>
</section>
`.trim();
}

function injectNearby(html, nearbyHtml) {
  if (!nearbyHtml) return html;

  const markerRegex = /<!--\s*NEARBY:START\s*-->[\s\S]*?<!--\s*NEARBY:END\s*-->/;
  if (markerRegex.test(html)) {
    return html.replace(markerRegex, `<!-- NEARBY:START -->\n${nearbyHtml}\n<!-- NEARBY:END -->`);
  }

  if (html.includes("</main>")) return html.replace("</main>", `\n${nearbyHtml}\n</main>`);
  return html.replace("</body>", `\n${nearbyHtml}\n</body>`);
}

function buildStateHubLinkHtml(state) {
  const stateName = titleCaseFromSlug(state);
  return `
<div class="cityhub__backnav">
  <a class="cityhub__backlink" href="/${escapeHtml(state)}/">&larr; Back to ${escapeHtml(stateName)} cities</a>
</div>
`.trim();
}

function injectStateHubLink(html, state) {
  const stateHtml = buildStateHubLinkHtml(state);
  const markerRegex = /<!--\s*STATEHUBLINK:START\s*-->[\s\S]*?<!--\s*STATEHUBLINK:END\s*-->/;

  if (markerRegex.test(html)) {
    return html.replace(markerRegex, `<!-- STATEHUBLINK:START -->\n${stateHtml}\n<!-- STATEHUBLINK:END -->`);
  }

  if (html.includes('id="citySubhead"')) {
    return html.replace(/(<p[^>]*id="citySubhead"[\s\S]*?<\/p>)/, `$1\n${stateHtml}`);
  }

  if (html.includes('id="results"')) {
    return html.replace(/(<section[^>]*id="results"[^>]*>)/, `${stateHtml}\n$1`);
  }

  return html;
}

function buildPopularCitiesHtml(state) {
  if (String(state || "").toLowerCase() !== "california") return "";

  const stateName = titleCaseFromSlug(state);
  const popular = [
    { slug: "los-angeles", label: "Los Angeles" },
    { slug: "san-diego", label: "San Diego" },
    { slug: "san-francisco", label: "San Francisco" },
    { slug: "san-jose", label: "San Jose" },
    { slug: "sacramento", label: "Sacramento" },
  ];

  return `
<section class="seo-copy" aria-label="Popular California locations" style="margin-top:18px">
  <h2>Popular ${escapeHtml(stateName)} locations</h2>
  <p class="muted">Browse major cities while we expand coverage.</p>
  <div class="cityhub__grid" style="margin-top:10px">
    ${popular
      .map((x) => `<a class="cityhub__pill" href="/${escapeHtml(state)}/${escapeHtml(x.slug)}/">${escapeHtml(x.label)}</a>`)
      .join("")}
  </div>
</section>
`.trim();
}

function injectPopularCities(html, state) {
  const block = buildPopularCitiesHtml(state);
  if (!block) return html;

  const markerRegex = /<!--\s*POPULARCITIES:START\s*-->[\s\S]*?<!--\s*POPULARCITIES:END\s*-->/;
  if (markerRegex.test(html)) {
    return html.replace(markerRegex, `<!-- POPULARCITIES:START -->\n${block}\n<!-- POPULARCITIES:END -->`);
  }

  if (html.includes("<!-- SEO COPY START -->")) {
    return html.replace("<!-- SEO COPY START -->", `${block}\n\n<!-- SEO COPY START -->`);
  }

  return html.replace("</main>", `\n${block}\n</main>`);
}

function buildCuratedScriptTag(state, city) {
  const stateDir = String(state || "").toLowerCase();
  const citySlug = String(city || "").toLowerCase();
  const curated = getCuratedObject(stateDir, citySlug);
  if (!curated) return "";

  if (!curated.city) curated.city = titleCaseFromSlug(citySlug);
  if (!curated.state) curated.state = stateAbbrevFromSlug(stateDir);

  const json = JSON.stringify(curated);
  return `<script id="CURATED:JSON" type="application/json">\n${json}\n</script>`;
}

function injectCuratedOverlay(html, state, city) {
  const scriptTag = buildCuratedScriptTag(state, city);
  if (!scriptTag) return html;

  const markerRegex = /<!--\s*CURATED:START\s*-->[\s\S]*?<!--\s*CURATED:END\s*-->/;
  if (markerRegex.test(html)) {
    return html.replace(markerRegex, `<!-- CURATED:START -->\n${scriptTag}\n<!-- CURATED:END -->`);
  }

  if (html.includes("</body>")) return html.replace("</body>", `\n${scriptTag}\n</body>`);
  return `${html}\n${scriptTag}\n`;
}

function injectHoustonIntentCopy(html) {
  let out = html;
  const quickStartBlock = `
<section class="quickstart" aria-label="Start here">
  <div class="quickstart__head">
    <div class="quickstart__titleline">Start here</div>
  </div>
  <div class="quickstart__grid">
    <a class="quickstart__item" href="/texas/houston/?type=recycling#results">
      <span class="quickstart__title">Free resident drop-off</span>
      <span class="quickstart__meta">City depositories and recycling centers</span>
      <span class="quickstart__arrow" aria-hidden="true">&rsaquo;</span>
    </a>
    <a class="quickstart__item" href="/texas/houston/?type=transfer#results">
      <span class="quickstart__title">Transfer stations</span>
      <span class="quickstart__meta">Paid mixed loads and general debris</span>
      <span class="quickstart__arrow" aria-hidden="true">&rsaquo;</span>
    </a>
    <a class="quickstart__item" href="/texas/houston/?type=landfill#results">
      <span class="quickstart__title">Landfills</span>
      <span class="quickstart__meta">Large loads and heavy disposal</span>
      <span class="quickstart__arrow" aria-hidden="true">&rsaquo;</span>
    </a>
    <a class="quickstart__item" href="/texas/houston/?type=hazardous-waste#results">
      <span class="quickstart__title">Household hazardous waste</span>
      <span class="quickstart__meta">Paint, chemicals, oil, and batteries</span>
      <span class="quickstart__arrow" aria-hidden="true">&rsaquo;</span>
    </a>
  </div>
</section>
<section class="report__box" aria-label="Houston guide review" style="margin-top:12px">
  <h2 style="margin:0; font-size:22px">Houston guide review</h2>
  <p class="muted" style="margin-top:8px">Last reviewed March 5, 2026 using City of Houston depository, recycling, reuse, and Environmental Service Center pages plus Harris County Precinct 4, WM, and Waste Connections sources.</p>
</section>
`.trim();

  out = out.replace(
    /(<h1[^>]*id="cityTitle"[^>]*>)[\s\S]*?(<\/h1>)/i,
    "$1Houston Trash Dump, Transfer Stations & Landfills$2"
  );

  out = out.replace(
    /(<p[^>]*id="cityAnswer"[^>]*>)[\s\S]*?(<\/p>)/i,
    "$1Compare Houston dump, landfill, transfer station, and recycling drop-off options with fees, hours, resident rules, and accepted materials.$2"
  );

  out = out.replace(
    /(<p[^>]*id="citySubhead"[^>]*>)[\s\S]*?(<\/p>)/i,
    "$1Need to know where to dump trash in Houston fast? Start with resident drop-off and recycling centers, then move to paid transfer or landfill options for heavier loads.$2\n" + quickStartBlock
  );

  out = out.replace(
    /(<h2[^>]*id="faqDumpWhere"[^>]*>)[\s\S]*?(<\/h2>)/i,
    "$1Where can I dump trash in Houston today?$2"
  );

  out = out.replace(
    /(<h2[^>]*id="faqDumpWhere"[^>]*>[\s\S]*?<\/h2>\s*<p>)[\s\S]*?(<\/p>)/i,
    "$1Houston residents usually compare city neighborhood depositories for household cleanup, recycling centers for sorted materials, private transfer stations for mixed paid loads, and landfill options for heavier disposal. For paint, oil, batteries, and household chemicals, start with the Environmental Service Centers listed above rather than a standard trash site.$2"
  );

  out = out.replace(
    /(<h2[^>]*id="faqDumpFree"[^>]*>)[\s\S]*?(<\/h2>)/i,
    "$1Where can I drop off trash for free in Houston?$2"
  );

  out = out.replace(
    /(<p[^>]*id="faqDumpFreeBody"[^>]*>)[\s\S]*?(<\/p>)/i,
    "$1Some Houston city and county programs offer free resident drop-off with ID and proof of address, while private transfer stations and landfills usually charge by load size or weight. Free access usually comes with visit caps, homeowner-only rules, or tighter material limits.$2"
  );

  out = out.replace(
    "<h2>What items are typically accepted?</h2>",
    "<h2>Houston transfer stations and recycling centers: what they accept</h2>"
  );

  out = out.replace(
    "<h2>Fees, hours, and resident requirements</h2>",
    "<h2>Houston landfill and transfer station fees, hours, and rules</h2>"
  );

  out = out.replace(
    /(<section class="seo-copy" style="margin-top:26px">\s*<p>)[\s\S]*?(<\/p>)/i,
    "$1Compare public and private Houston disposal options with source links, hours, rules, and accepted materials so you can choose the right site before you drive.$2"
  );

  out = out.replace(
    /(<h2>Houston transfer stations and recycling centers: what they accept<\/h2>\s*<p>)[\s\S]*?(<\/p>)/i,
    "$1Houston city sites split by use case. Neighborhood depositories handle household trash, bulky cleanup, yard waste, and some recyclables. Recycling centers focus on sorted material streams such as bottles, cans, cardboard, motor oil, and tires. Private transfer and landfill sites are better fits for heavier mixed loads, brush, or construction debris.$2"
  );

  out = out.replace(
    /(<h2>Houston landfill and transfer station fees, hours, and rules<\/h2>\s*<p>)[\s\S]*?(<\/p>)/i,
    "$1Expect Houston transfer stations and landfills to charge by weight, vehicle class, or load type, while city-run sites are usually resident-only and free with ID and proof of address. Visit caps, covered-load rules, and hazardous-waste restrictions are common, so checking the source link first usually saves a wasted trip.$2"
  );

  out = out.replace(
    /<!-- NEARBY:START -->/i,
    `<h2>Best Houston option by load type</h2>
        <p>
          Use a <strong>city depository</strong> for household cleanup, yard waste, mattresses, and bulky items if you qualify as a Houston resident. Use a
          <strong>recycling center</strong> for sorted recyclables and used motor oil, an <strong>Environmental Service Center</strong> for paint, batteries, and chemicals,
          a <strong>transfer station</strong> for faster paid unloading of mixed debris, and a <strong>landfill</strong> when you have a larger disposal load or construction-heavy material.
        </p>

        <h2>Before you drive to a Houston drop-off site</h2>
        <p>
          Houston rules change sharply by operator. City-run sites ask for Texas ID and matching proof of address, county dumpster sites are homeowner-only, and private landfill or transfer operators set their own fees and material screens. If you have paint, oil, chemicals, or batteries, do not assume a standard trash site will take them.
        </p>

        <!-- NEARBY:START -->`
  );

  return out;
}

function injectDallasIntentCopy(html) {
  let out = html;
  const quickStartBlock = `
<section class="quickstart" aria-label="Start here">
  <div class="quickstart__head">
    <div class="quickstart__titleline">Start here</div>
  </div>
  <div class="quickstart__grid">
    <a class="quickstart__item" href="/texas/dallas/?type=recycling#results">
      <span class="quickstart__title">Recycling drop-off</span>
      <span class="quickstart__meta">Electronics and resident recycling options</span>
      <span class="quickstart__arrow" aria-hidden="true">&rsaquo;</span>
    </a>
    <a class="quickstart__item" href="/texas/dallas/?type=transfer#results">
      <span class="quickstart__title">Transfer stations</span>
      <span class="quickstart__meta">Dallas resident self-haul options</span>
      <span class="quickstart__arrow" aria-hidden="true">&rsaquo;</span>
    </a>
    <a class="quickstart__item" href="/texas/dallas/?type=landfill#results">
      <span class="quickstart__title">Landfills</span>
      <span class="quickstart__meta">McCommas Bluff and larger loads</span>
      <span class="quickstart__arrow" aria-hidden="true">&rsaquo;</span>
    </a>
    <a class="quickstart__item" href="/texas/dallas/?type=hazardous-waste#results">
      <span class="quickstart__title">Household chemicals</span>
      <span class="quickstart__meta">Paint, oil, batteries, and cleaners</span>
      <span class="quickstart__arrow" aria-hidden="true">&rsaquo;</span>
    </a>
  </div>
</section>
<section class="report__box" aria-label="Dallas guide review" style="margin-top:12px">
  <h2 style="margin:0; font-size:22px">Dallas guide review</h2>
  <p class="muted" style="margin-top:8px">Last reviewed March 6, 2026 using Dallas Sanitation landfill, transfer station, and electronics recycling pages plus the Dallas County home chemical collection page.</p>
</section>
`.trim();

  out = out.replace(
    /(<h1[^>]*id="cityTitle"[^>]*>)[\s\S]*?(<\/h1>)/i,
    "$1Dallas Trash Dump, Transfer Stations & Landfills$2"
  );

  out = out.replace(
    /(<p[^>]*id="cityAnswer"[^>]*>)[\s\S]*?(<\/p>)/i,
    "$1Compare Dallas dump, landfill, transfer station, and recycling drop-off options with fees, hours, resident rules, and accepted materials.$2"
  );

  out = out.replace(
    /(<p[^>]*id="citySubhead"[^>]*>)[\s\S]*?(<\/p>)/i,
    "$1Need to dump trash in Dallas fast? Start with Dallas transfer stations or McCommas Bluff, then use the county home chemical center for paint, oil, batteries, and other hazardous items.$2\n" + quickStartBlock
  );

  out = out.replace(
    /(<h2[^>]*id="faqDumpWhere"[^>]*>)[\s\S]*?(<\/h2>)/i,
    "$1Where can I dump trash in Dallas today?$2"
  );

  out = out.replace(
    /(<h2[^>]*id="faqDumpWhere"[^>]*>[\s\S]*?<\/h2>\s*<p>)[\s\S]*?(<\/p>)/i,
    "$1Dallas residents usually start with the three city transfer stations or McCommas Bluff for household cleanup. Electronics can go to McCommas Bluff or the city transfer stations, while paint, batteries, cleaners, and other hazardous items belong at the Dallas County Home Chemical Collection Center.$2"
  );

  out = out.replace(
    /(<h2[^>]*id="faqDumpFree"[^>]*>)[\s\S]*?(<\/h2>)/i,
    "$1Where can I drop off trash for free in Dallas?$2"
  );

  out = out.replace(
    /(<p[^>]*id="faqDumpFreeBody"[^>]*>)[\s\S]*?(<\/p>)/i,
    "$1Dallas residents hauling waste from their residence in passenger cars, pickups, and trailers under 15 feet can use city landfill and transfer station services at no charge with valid ID and proof of residency. Dallas County household chemicals have their own eligibility rules and schedules, so confirm the listing first.$2"
  );

  out = out.replace(
    "<h2>What items are typically accepted?</h2>",
    "<h2>Dallas transfer stations and recycling centers: what they accept</h2>"
  );

  out = out.replace(
    "<h2>Fees, hours, and resident requirements</h2>",
    "<h2>Dallas landfill and transfer station fees, hours, and rules</h2>"
  );

  out = out.replace(
    /(<section class="seo-copy" style="margin-top:26px">\s*<p>)[\s\S]*?(<\/p>)/i,
    "$1Compare Dallas disposal options with source links, hours, resident rules, and accepted materials so you can choose the right site before you drive.$2"
  );

  out = out.replace(
    /(<h2>Dallas transfer stations and recycling centers: what they accept<\/h2>\s*<p>)[\s\S]*?(<\/p>)/i,
    "$1Dallas transfer stations and McCommas Bluff cover most resident cleanup needs, including household waste, brush, furniture, tires, and recyclables, while the city's electronics recycling program handles TVs, monitors, computers, printers, and other approved devices. Household chemicals, automotive fluids, and similar hazardous items should go to the Dallas County home chemical center instead of a standard trash site.$2"
  );

  out = out.replace(
    /(<h2>Dallas landfill and transfer station fees, hours, and rules<\/h2>\s*<p>)[\s\S]*?(<\/p>)/i,
    "$1Dallas city drop-off is structured around residency. McCommas Bluff runs earlier and later hours for larger loads, Bachman also serves small commercial customers, and Fair Oaks and Westmoreland have short weekday resident windows. Always bring current ID, proof of Dallas residency, and confirm whether your load belongs at the city site or the county chemical program.$2"
  );

  out = out.replace(
    /<!-- NEARBY:START -->/i,
    `<h2>Best Dallas option by load type</h2>
        <p>
          Use a <strong>Dallas transfer station</strong> for most resident self-haul cleanup, <strong>McCommas Bluff Landfill</strong> for larger disposal loads,
          <strong>Dallas electronics recycling</strong> for TVs and computers, and the <strong>Dallas County Home Chemical Collection Center</strong> for paint,
          batteries, cleaners, pesticides, and other hazardous household items.
        </p>

        <h2>Before you drive to a Dallas drop-off site</h2>
        <p>
          Dallas resident access depends on documentation and vehicle type. The city expects a current driver's license and proof of Dallas residency, the county
          chemical center has participating-city rules, and oversize or commercial loads can push you into a different fee structure. Checking the source link
          first usually prevents a wasted trip.
        </p>

        <!-- NEARBY:START -->`
  );

  return out;
}

function injectMiamiIntentCopy(html) {
  let out = html;
  const quickStartBlock = `
<section class="quickstart" aria-label="Start here">
  <div class="quickstart__head">
    <div class="quickstart__titleline">Start here</div>
  </div>
  <div class="quickstart__grid">
    <a class="quickstart__item" href="/florida/miami/?type=transfer#results">
      <span class="quickstart__title">Neighborhood TRCs</span>
      <span class="quickstart__meta">Bulky trash, yard waste, and small debris loads</span>
      <span class="quickstart__arrow" aria-hidden="true">&rsaquo;</span>
    </a>
    <a class="quickstart__item" href="/florida/miami/?type=hazardous-waste#results">
      <span class="quickstart__title">Home chemical centers</span>
      <span class="quickstart__meta">Paint, batteries, bulbs, and electronics</span>
      <span class="quickstart__arrow" aria-hidden="true">&rsaquo;</span>
    </a>
    <a class="quickstart__item" href="/florida/miami/?type=transfer#results">
      <span class="quickstart__title">Used oil and electronics</span>
      <span class="quickstart__meta">Only certain county TRCs accept them</span>
      <span class="quickstart__arrow" aria-hidden="true">&rsaquo;</span>
    </a>
    <a class="quickstart__item" href="/florida/miami/#faqDumpFree">
      <span class="quickstart__title">County resident rules</span>
      <span class="quickstart__meta">Florida ID and service-area eligibility matter</span>
      <span class="quickstart__arrow" aria-hidden="true">&rsaquo;</span>
    </a>
  </div>
</section>
<section class="report__box" aria-label="Miami guide review" style="margin-top:12px">
  <h2 style="margin:0; font-size:22px">Miami guide review</h2>
  <p class="muted" style="margin-top:8px">Last reviewed March 6, 2026 using Miami-Dade's neighborhood trash and recycling center service page plus the county spring-cleaning home chemical collection guidance.</p>
</section>
`.trim();

  out = out.replace(
    /(<h1[^>]*id="cityTitle"[^>]*>)[\s\S]*?(<\/h1>)/i,
    "$1Miami Trash Dump, Transfer Stations & Landfills$2"
  );

  out = out.replace(
    /(<p[^>]*id="cityAnswer"[^>]*>)[\s\S]*?(<\/p>)/i,
    "$1Compare Miami-Dade trash and recycling centers, home chemical collection sites, and nearby disposal options with hours, resident rules, and accepted materials.$2"
  );

  out = out.replace(
    /(<p[^>]*id="citySubhead"[^>]*>)[\s\S]*?(<\/p>)/i,
    "$1Need to dump trash in Miami fast? Start with Miami-Dade neighborhood TRCs for bulky cleanup and the home chemical centers for paint, batteries, electronics, and chemicals.$2\n" + quickStartBlock
  );

  out = out.replace(
    /(<h2[^>]*id="faqDumpWhere"[^>]*>)[\s\S]*?(<\/h2>)/i,
    "$1Where can I dump trash in Miami today?$2"
  );

  out = out.replace(
    /(<h2[^>]*id="faqDumpWhere"[^>]*>[\s\S]*?<\/h2>\s*<p>)[\s\S]*?(<\/p>)/i,
    "$1Most Miami household drop-off traffic goes to Miami-Dade Neighborhood Trash and Recycling Centers, which handle bulky cleanup, yard cuttings, and small construction debris for eligible residents. Use the county home chemical collection centers for paint, cleaners, batteries, bulbs, and home electronics instead of a standard trash site.$2"
  );

  out = out.replace(
    /(<h2[^>]*id="faqDumpFree"[^>]*>)[\s\S]*?(<\/h2>)/i,
    "$1Where can I drop off trash for free in Miami?$2"
  );

  out = out.replace(
    /(<p[^>]*id="faqDumpFreeBody"[^>]*>)[\s\S]*?(<\/p>)/i,
    "$1Miami-Dade neighborhood centers and home chemical centers are resident services, not general public landfills. Eligible customers usually do not pay a standard gate fee, but they do need valid Florida ID tied to an eligible waste-fee account, and oversize vehicles must use county landfill options instead.$2"
  );

  out = out.replace(
    "<h2>What items are typically accepted?</h2>",
    "<h2>Miami trash and recycling centers: what they accept</h2>"
  );

  out = out.replace(
    "<h2>Fees, hours, and resident requirements</h2>",
    "<h2>Miami drop-off hours, resident rules, and county limits</h2>"
  );

  out = out.replace(
    /(<section class="seo-copy" style="margin-top:26px">\s*<p>)[\s\S]*?(<\/p>)/i,
    "$1Compare Miami-Dade neighborhood centers and home chemical drop-off sites with source links, hours, resident rules, and accepted materials so you can choose the right option before you drive.$2"
  );

  out = out.replace(
    /(<h2>Miami trash and recycling centers: what they accept<\/h2>\s*<p>)[\s\S]*?(<\/p>)/i,
    "$1Miami-Dade TRCs focus on bulky household cleanup, yard cuttings, and construction debris loads up to three cubic yards. Some centers also take used motor oil, used electronics, cardboard, tires, or white goods, while the county home chemical centers handle household cleaners, paint thinners, fertilizers, batteries, bulbs, and laptops.$2"
  );

  out = out.replace(
    /(<h2>Miami drop-off hours, resident rules, and county limits<\/h2>\s*<p>)[\s\S]*?(<\/p>)/i,
    "$1Miami-Dade lists neighborhood TRCs as open daily from 7:00 AM to 5:30 PM and the home chemical centers as open Wednesday through Sunday from 9:00 AM to 5:00 PM. Florida ID is scanned against the county waste-fee customer database, oversize vehicles are not allowed at TRCs, and regular garbage, food, and kitchen waste are prohibited there.$2"
  );

  out = out.replace(
    /<!-- NEARBY:START -->/i,
    `<h2>Best Miami option by load type</h2>
        <p>
          Use a <strong>Miami-Dade neighborhood TRC</strong> for bulky household cleanup, tree and yard cuttings, and smaller construction debris loads,
          then use a <strong>home chemical collection center</strong> for paint, cleaners, batteries, bulbs, and many household electronics. If your vehicle
          is oversize or your load falls outside TRC rules, Miami-Dade directs you to county landfill options with per-ton pricing.
        </p>

        <h2>Before you drive to a Miami drop-off site</h2>
        <p>
          In Miami, eligibility matters as much as distance. The county scans Florida ID against an eligible waste-fee account, some centers have special
          rules for tires, white goods, mattresses, or electronics, and regular garbage or kitchen waste are not accepted at the neighborhood TRCs. Check
          the source link first so you arrive at the right center with the right load.
        </p>

        <!-- NEARBY:START -->`
  );

  return out;
}

function injectAustinIntentCopy(html) {
  let out = html;
  const quickStartBlock = `
<section class="quickstart" aria-label="Start here">
  <div class="quickstart__head">
    <div class="quickstart__titleline">Start here</div>
  </div>
  <div class="quickstart__grid">
    <a class="quickstart__item" href="/texas/austin/?type=recycling#results">
      <span class="quickstart__title">Recycling drop-off</span>
      <span class="quickstart__meta">City and private recycling options</span>
      <span class="quickstart__arrow" aria-hidden="true">&rsaquo;</span>
    </a>
    <a class="quickstart__item" href="/texas/austin/?type=transfer#results">
      <span class="quickstart__title">Transfer stations</span>
      <span class="quickstart__meta">Mixed loads and faster unload</span>
      <span class="quickstart__arrow" aria-hidden="true">&rsaquo;</span>
    </a>
    <a class="quickstart__item" href="/texas/austin/?type=landfill#results">
      <span class="quickstart__title">Landfills</span>
      <span class="quickstart__meta">Large loads and heavy disposal</span>
      <span class="quickstart__arrow" aria-hidden="true">&rsaquo;</span>
    </a>
    <a class="quickstart__item" href="/texas/austin/?type=hazardous-waste#results">
      <span class="quickstart__title">Hazardous waste options</span>
      <span class="quickstart__meta">Special handling and appointment rules</span>
      <span class="quickstart__arrow" aria-hidden="true">&rsaquo;</span>
    </a>
  </div>
</section>
`.trim();

  out = out.replace(
    /(<h1[^>]*id="cityTitle"[^>]*>)[\s\S]*?(<\/h1>)/i,
    "$1Austin Trash Dump, Transfer Stations & Landfills$2"
  );

  out = out.replace(
    /(<p[^>]*id="cityAnswer"[^>]*>)[\s\S]*?(<\/p>)/i,
    "$1Compare Austin dump, landfill, transfer station, and recycling drop-off options with fees, hours, resident rules, and accepted materials.$2"
  );

  out = out.replace(
    /(<p[^>]*id="citySubhead"[^>]*>)[\s\S]*?(<\/p>)/i,
    "$1Need to dump trash in Austin fast? Start with these verified options and confirm rules before you drive.$2\n" + quickStartBlock
  );

  out = out.replace(
    /(<h2[^>]*id="faqDumpWhere"[^>]*>)[\s\S]*?(<\/h2>)/i,
    "$1Where can I dump trash in Austin today?$2"
  );

  out = out.replace(
    /(<h2[^>]*id="faqDumpFree"[^>]*>)[\s\S]*?(<\/h2>)/i,
    "$1Where can I drop off trash for free in Austin?$2"
  );

  out = out.replace(
    /(<p[^>]*id="faqDumpFreeBody"[^>]*>)[\s\S]*?(<\/p>)/i,
    "$1Some Austin-area facilities offer resident-focused or lower-cost drop-off options, while private transfer stations and landfills usually charge by load size or material type.$2"
  );

  out = out.replace(
    "<h2>What items are typically accepted?</h2>",
    "<h2>Austin transfer stations and recycling centers: what they accept</h2>"
  );

  out = out.replace(
    "<h2>Fees, hours, and resident requirements</h2>",
    "<h2>Austin landfill and transfer station fees, hours, and rules</h2>"
  );

  return out;
}

function injectSanAntonioIntentCopy(html) {
  let out = html;
  const quickStartBlock = `
<section class="quickstart" aria-label="Start here">
  <div class="quickstart__head">
    <div class="quickstart__titleline">Start here</div>
  </div>
  <div class="quickstart__grid">
    <a class="quickstart__item" href="/texas/san-antonio/?type=transfer#results">
      <span class="quickstart__title">Free resident bulky drop-off</span>
      <span class="quickstart__meta">City self-haul cleanup centers</span>
      <span class="quickstart__arrow" aria-hidden="true">&rsaquo;</span>
    </a>
    <a class="quickstart__item" href="/texas/san-antonio/?type=hazardous-waste#results">
      <span class="quickstart__title">Household hazardous waste</span>
      <span class="quickstart__meta">Paint, chemicals, oil, and batteries</span>
      <span class="quickstart__arrow" aria-hidden="true">&rsaquo;</span>
    </a>
    <a class="quickstart__item" href="/texas/san-antonio/?type=recycling#results">
      <span class="quickstart__title">Brush and recycling drop-off</span>
      <span class="quickstart__meta">Brush-only loads and green waste</span>
      <span class="quickstart__arrow" aria-hidden="true">&rsaquo;</span>
    </a>
    <a class="quickstart__item" href="/texas/san-antonio/?type=landfill#results">
      <span class="quickstart__title">Paid landfill and transfer</span>
      <span class="quickstart__meta">Private daily disposal options</span>
      <span class="quickstart__arrow" aria-hidden="true">&rsaquo;</span>
    </a>
  </div>
</section>
<section class="report__box" aria-label="San Antonio guide review" style="margin-top:12px">
  <h2 style="margin:0; font-size:22px">San Antonio guide review</h2>
  <p class="muted" style="margin-top:8px">Last reviewed March 6, 2026 using San Antonio Solid Waste bulky, HHW, brush, and landfill pages plus WM, Texas Disposal Systems, and the city service guide.</p>
</section>
`.trim();

  out = out.replace(
    /(<h1[^>]*id="cityTitle"[^>]*>)[\s\S]*?(<\/h1>)/i,
    "$1San Antonio Trash Dump, Transfer Stations & Landfills$2"
  );

  out = out.replace(
    /(<p[^>]*id="cityAnswer"[^>]*>)[\s\S]*?(<\/p>)/i,
    "$1Compare San Antonio dump, landfill, transfer station, and recycling drop-off options with fees, hours, resident rules, and accepted materials.$2"
  );

  out = out.replace(
    /(<p[^>]*id="citySubhead"[^>]*>)[\s\S]*?(<\/p>)/i,
    "$1Need to dump trash in San Antonio fast? Start with city bulky drop-off if you pay the environmental fee, use the HHW program for paint and chemicals, and move to paid landfill or transfer options only when your load falls outside city rules.$2\n" + quickStartBlock
  );

  out = out.replace(
    /(<h2[^>]*id="faqDumpWhere"[^>]*>)[\s\S]*?(<\/h2>)/i,
    "$1Where can I dump trash in San Antonio today?$2"
  );

  out = out.replace(
    /(<h2[^>]*id="faqDumpFree"[^>]*>)[\s\S]*?(<\/h2>)/i,
    "$1Where can I drop off trash for free in San Antonio?$2"
  );

  out = out.replace(
    /(<h2[^>]*id="faqDumpWhere"[^>]*>[\s\S]*?<\/h2>\s*<p>)[\s\S]*?(<\/p>)/i,
    "$1Most San Antonio household cleanup runs through the four city bulky waste collection centers, with the Culebra HHW drop-off site and scheduled HHW events handling paint, batteries, oil, and household chemicals. When you have construction debris, larger mixed loads, or a load that does not qualify for city drop-off, compare TDS Starcrest and Covel Gardens before you drive.$2"
  );

  out = out.replace(
    /(<p[^>]*id="faqDumpFreeBody"[^>]*>)[\s\S]*?(<\/p>)/i,
    "$1San Antonio's best free options are city-run and eligibility-based, not open-public gate sites. If you are a Solid Waste Management customer with a recent CPS Energy bill showing the environmental fee and matching photo ID, bulky drop-off and HHW services can be free. Free landfill days exist too, but only on select event dates.$2"
  );

  out = out.replace(
    "<h2>What items are typically accepted?</h2>",
    "<h2>San Antonio transfer stations and recycling centers: what they accept</h2>"
  );

  out = out.replace(
    "<h2>Fees, hours, and resident requirements</h2>",
    "<h2>San Antonio landfill and transfer station fees, hours, and rules</h2>"
  );

  out = out.replace(
    /(<section class="seo-copy" style="margin-top:26px">\s*<p>)[\s\S]*?(<\/p>)/i,
    "$1Compare San Antonio disposal options with source links, hours, resident rules, and accepted materials so you can choose the right site before you drive.$2"
  );

  out = out.replace(
    /(<h2>San Antonio transfer stations and recycling centers: what they accept<\/h2>\s*<p>)[\s\S]*?(<\/p>)/i,
    "$1San Antonio splits self-haul by program. City bulky centers handle household cleanup, furniture, appliances, tires, and smaller construction debris for eligible residents, while the brush sites take tree limbs, leaves, and other green waste only. Household hazardous waste, paint, oil, batteries, and similar materials belong at the Culebra HHW site or one of the city's scheduled HHW events instead of a standard trash drop-off.$2"
  );

  out = out.replace(
    /(<h2>San Antonio landfill and transfer station fees, hours, and rules<\/h2>\s*<p>)[\s\S]*?(<\/p>)/i,
    "$1San Antonio's city-run drop-off system is built around eligibility, not walk-up public gate fees. You usually need a recent CPS Energy bill showing the environmental fee plus matching photo ID. Private sites such as TDS Starcrest and Covel Gardens charge by material class, weight, or load type, and free landfill access only appears on select city event dates, so the source link on each card matters.$2"
  );

  out = out.replace(
    /<!-- NEARBY:START -->/i,
    `<h2>Best San Antonio option by load type</h2>
        <p>
          Use a <strong>city bulky waste collection center</strong> for general household cleanup if you qualify as a San Antonio solid waste customer.
          Use a <strong>brush recycling center</strong> for limbs and leaves, a <strong>city HHW site or HHW event</strong> for paint, chemicals, batteries, and automotive fluids,
          a <strong>transfer station</strong> for faster unloading of paid mixed debris, and a <strong>landfill</strong> when you have a larger disposal or construction-heavy load.
        </p>

        <h2>Before you drive to a San Antonio drop-off site</h2>
        <p>
          San Antonio rules change sharply by program. City sites usually require a recent CPS Energy bill with the environmental fee plus photo ID, brush and bulky loads are screened differently,
          and free landfill access is only available on certain city event dates. If you have paint, oil, batteries, or chemicals, do not assume a bulky site or landfill will take them.
        </p>

        <!-- NEARBY:START -->`
  );

  return out;
}

function injectLosAngelesIntentCopy(html) {
  let out = html;
  const quickStartBlock = `
<section class="quickstart" aria-label="Start here">
  <div class="quickstart__head">
    <div class="quickstart__titleline">Start here</div>
  </div>
  <div class="quickstart__grid">
    <a class="quickstart__item" href="/california/los-angeles/?type=hazardous-waste#results">
      <span class="quickstart__title">Household hazardous waste</span>
      <span class="quickstart__meta">S.A.F.E. centers and HHW drop-off</span>
      <span class="quickstart__arrow" aria-hidden="true">&rsaquo;</span>
    </a>
    <a class="quickstart__item" href="/california/los-angeles/?type=transfer#results">
      <span class="quickstart__title">Transfer stations</span>
      <span class="quickstart__meta">Mixed loads and faster unload</span>
      <span class="quickstart__arrow" aria-hidden="true">&rsaquo;</span>
    </a>
    <a class="quickstart__item" href="/california/los-angeles/?type=landfill#results">
      <span class="quickstart__title">Landfills</span>
      <span class="quickstart__meta">Large loads and heavy disposal</span>
      <span class="quickstart__arrow" aria-hidden="true">&rsaquo;</span>
    </a>
    <a class="quickstart__item" href="/california/los-angeles/?type=recycling#results">
      <span class="quickstart__title">Recycling drop-off</span>
      <span class="quickstart__meta">Metals, cardboard, and common recyclables</span>
      <span class="quickstart__arrow" aria-hidden="true">&rsaquo;</span>
    </a>
  </div>
</section>
<section class="report__box" aria-label="Los Angeles guide review" style="margin-top:12px">
  <h2 style="margin:0; font-size:22px">Los Angeles guide review</h2>
  <p class="muted" style="margin-top:8px">Last reviewed March 5, 2026 using LA Stormwater S.A.F.E. pages, LA County household hazardous waste pages, LACSD transfer and landfill pages, Glendale public works, Sunshine Canyon, and Burbank public works pages.</p>
</section>
`.trim();

  out = out.replace(
    /(<h1[^>]*id="cityTitle"[^>]*>)[\s\S]*?(<\/h1>)/i,
    "$1Los Angeles Trash Dump, Transfer Stations & Landfills$2"
  );

  out = out.replace(
    /(<p[^>]*id="cityAnswer"[^>]*>)[\s\S]*?(<\/p>)/i,
    "$1Compare Los Angeles dump, landfill, transfer station, and recycling drop-off options with fees, hours, resident rules, and accepted materials.$2"
  );

  out = out.replace(
    /(<p[^>]*id="citySubhead"[^>]*>)[\s\S]*?(<\/p>)/i,
    "$1Need to dump trash in Los Angeles fast? Start with source-linked options and confirm rules before you drive.$2\n" + quickStartBlock
  );

  out = out.replace(
    /(<section class="seo-copy" style="margin-top:26px">\s*<p>)[\s\S]*?(<\/p>)/i,
    "$1Compare public and private Los Angeles disposal options with source links, hours, rules, and accepted materials so you can choose the right site before you drive.$2"
  );

  out = out.replace(
    /(<h2[^>]*id="faqDumpWhere"[^>]*>)[\s\S]*?(<\/h2>)/i,
    "$1Where can I dump trash in Los Angeles today?$2"
  );

  out = out.replace(
    /(<h2[^>]*id="faqDumpWhere"[^>]*>[\s\S]*?<\/h2>\s*<p>)[\s\S]*?(<\/p>)/i,
    "$1For mixed self-haul loads, Los Angeles-area residents usually compare South Gate or Puente Hills transfer-station access, while landfill-scale loads often route to sites such as Scholl Canyon or Sunshine Canyon. For paint, chemicals, batteries, oil, and e-waste, start with the S.A.F.E. centers listed above rather than a landfill, and check the source link because some sites have narrower schedules or e-waste-only rules.$2"
  );

  out = out.replace(
    /(<h2[^>]*id="faqDumpFree"[^>]*>)[\s\S]*?(<\/h2>)/i,
    "$1Where can I drop off trash for free in Los Angeles?$2"
  );

  out = out.replace(
    /(<p[^>]*id="faqDumpFreeBody"[^>]*>)[\s\S]*?(<\/p>)/i,
    "$1Los Angeles household hazardous waste and e-waste programs are often free for household quantities, and some nearby municipal recycling programs offer low-cost or no-cost residential drop-off. Transfer stations and landfills usually charge by weight, load size, or material type, and some S.A.F.E. sites have narrower program scope than others.$2"
  );

  out = out.replace(
    "<h2>What items are typically accepted?</h2>",
    "<h2>Los Angeles transfer stations and recycling centers: what they accept</h2>"
  );

  out = out.replace(
    /(<h2>Los Angeles transfer stations and recycling centers: what they accept<\/h2>\s*<p>)[\s\S]*?(<\/p>)/i,
    "$1Los Angeles-area transfer stations typically handle mixed household trash, bulky items, and construction debris, while landfill and recycling rules split out loads such as clean dirt, concrete, cardboard, bottles and cans, used oil, and special recycling streams. Household hazardous waste, paint, batteries, and e-waste should go to a S.A.F.E. center instead of a landfill, and e-waste-only city sites should be treated as a separate category.$2"
  );

  out = out.replace(
    "<h2>Fees, hours, and resident requirements</h2>",
    "<h2>Los Angeles landfill and transfer station fees, hours, and rules</h2>"
  );

  out = out.replace(
    /(<h2>Los Angeles landfill and transfer station fees, hours, and rules<\/h2>\s*<p>)[\s\S]*?(<\/p>)/i,
    "$1Expect transfer stations and landfills to price by weight, vehicle class, or load type, while many hazardous-waste programs are resident-focused and ask for an address or other proof of eligibility. Covered-load rules, holiday schedules, and construction-debris restrictions are common, so the source link on each facility card matters.$2"
  );

  out = out.replace(
    /<!-- NEARBY:START -->/i,
    `<h2>Best Los Angeles option by load type</h2>
        <p>
          Use a <strong>S.A.F.E. center</strong> for paint, batteries, used oil, cleaners, and e-waste. Use a
          <strong>transfer station</strong> for mixed self-haul loads you want off the truck fast. Use a
          <strong>landfill</strong> for larger disposal loads, and use a <strong>recycling center</strong> when you already know the material stream is sortable.
        </p>

        <h2>Before you drive to a Los Angeles drop-off site</h2>
        <p>
          Los Angeles-area disposal rules split sharply by load type. Household hazardous waste, e-waste, and batteries have one set of rules; mixed trash and bulky items have another; and construction debris often has its own rate sheet and contamination rules. Some S.A.F.E. sites are temporary, temporarily closed, or limited to e-waste, so checking the source link first is usually worth the time.
        </p>

        <!-- NEARBY:START -->`
  );

  return out;
}

function injectSanFranciscoIntentCopy(html) {
  let out = html;
  const quickStartBlock = `
<section class="quickstart" aria-label="Start here">
  <div class="quickstart__head">
    <div class="quickstart__titleline">Start here</div>
  </div>
  <div class="quickstart__grid">
    <a class="quickstart__item" href="/california/san-francisco/?type=hazardous-waste#results">
      <span class="quickstart__title">Household hazardous waste</span>
      <span class="quickstart__meta">Appointment rules and resident-focused drop-off</span>
      <span class="quickstart__arrow" aria-hidden="true">&rsaquo;</span>
    </a>
    <a class="quickstart__item" href="/california/san-francisco/?type=transfer#results">
      <span class="quickstart__title">Transfer stations</span>
      <span class="quickstart__meta">Mixed loads and faster unload</span>
      <span class="quickstart__arrow" aria-hidden="true">&rsaquo;</span>
    </a>
    <a class="quickstart__item" href="/california/san-francisco/?type=landfill#results">
      <span class="quickstart__title">Landfills</span>
      <span class="quickstart__meta">Large loads and heavy disposal</span>
      <span class="quickstart__arrow" aria-hidden="true">&rsaquo;</span>
    </a>
    <a class="quickstart__item" href="/california/san-francisco/?type=recycling#results">
      <span class="quickstart__title">Recycling drop-off</span>
      <span class="quickstart__meta">Metals, cardboard, and common recyclables</span>
      <span class="quickstart__arrow" aria-hidden="true">&rsaquo;</span>
    </a>
  </div>
</section>
`.trim();

  out = out.replace(
    /(<h1[^>]*id="cityTitle"[^>]*>)[\s\S]*?(<\/h1>)/i,
    "$1San Francisco Trash Dump, Transfer Stations & Landfills$2"
  );

  out = out.replace(
    /(<p[^>]*id="cityAnswer"[^>]*>)[\s\S]*?(<\/p>)/i,
    "$1Compare San Francisco dump, landfill, transfer station, and recycling drop-off options with fees, hours, resident rules, and accepted materials.$2"
  );

  out = out.replace(
    /(<p[^>]*id="citySubhead"[^>]*>)[\s\S]*?(<\/p>)/i,
    "$1Need to dump trash in San Francisco fast? Start with these verified options and confirm rules before you drive.$2\n" + quickStartBlock
  );

  out = out.replace(
    /(<h2[^>]*id="faqDumpWhere"[^>]*>)[\s\S]*?(<\/h2>)/i,
    "$1Where can I dump trash in San Francisco today?$2"
  );

  out = out.replace(
    /(<h2[^>]*id="faqDumpFree"[^>]*>)[\s\S]*?(<\/h2>)/i,
    "$1Where can I drop off trash for free in San Francisco?$2"
  );

  out = out.replace(
    /(<p[^>]*id="faqDumpFreeBody"[^>]*>)[\s\S]*?(<\/p>)/i,
    "$1Some San Francisco-area services offer resident-focused or lower-cost drop-off options, while private transfer stations and landfills usually charge by load size or material type.$2"
  );

  out = out.replace(
    "<h2>What items are typically accepted?</h2>",
    "<h2>San Francisco transfer stations and recycling centers: what they accept</h2>"
  );

  out = out.replace(
    "<h2>Fees, hours, and resident requirements</h2>",
    "<h2>San Francisco landfill and transfer station fees, hours, and rules</h2>"
  );

  return out;
}

function injectAtlantaIntentCopy(html) {
  let out = html;
  const quickStartBlock = `
<section class="quickstart" aria-label="Start here">
  <div class="quickstart__head">
    <div class="quickstart__titleline">Start here</div>
  </div>
  <div class="quickstart__grid">
    <a class="quickstart__item" href="/georgia/atlanta/?type=hazardous-waste#results">
      <span class="quickstart__title">Hard-to-recycle and HHW</span>
      <span class="quickstart__meta">CHaRM sites, paint, batteries, and electronics</span>
      <span class="quickstart__arrow" aria-hidden="true">&rsaquo;</span>
    </a>
    <a class="quickstart__item" href="/georgia/atlanta/?type=transfer#results">
      <span class="quickstart__title">Transfer stations</span>
      <span class="quickstart__meta">Mixed loads, county drop-off, and faster unload</span>
      <span class="quickstart__arrow" aria-hidden="true">&rsaquo;</span>
    </a>
    <a class="quickstart__item" href="/georgia/atlanta/?type=landfill#results">
      <span class="quickstart__title">Landfills</span>
      <span class="quickstart__meta">Large loads and heavy disposal</span>
      <span class="quickstart__arrow" aria-hidden="true">&rsaquo;</span>
    </a>
    <a class="quickstart__item" href="/georgia/atlanta/?type=recycling#results">
      <span class="quickstart__title">Recycling drop-off</span>
      <span class="quickstart__meta">City events, municipal centers, and sorted materials</span>
      <span class="quickstart__arrow" aria-hidden="true">&rsaquo;</span>
    </a>
  </div>
</section>
`.trim();

  out = out.replace(
    /(<h1[^>]*id="cityTitle"[^>]*>)[\s\S]*?(<\/h1>)/i,
    "$1Atlanta Trash Dump, Transfer Stations & Landfills$2"
  );

  out = out.replace(
    /(<p[^>]*id="cityAnswer"[^>]*>)[\s\S]*?(<\/p>)/i,
    "$1Compare Atlanta dump, landfill, transfer station, and recycling drop-off options with fees, hours, resident rules, and accepted materials.$2"
  );

  out = out.replace(
    /(<p[^>]*id="citySubhead"[^>]*>)[\s\S]*?(<\/p>)/i,
    "$1Need to dump trash in Atlanta fast? Start with these verified options and confirm rules before you drive.$2\n" + quickStartBlock
  );

  out = out.replace(
    /(<h2[^>]*id="faqDumpWhere"[^>]*>)[\s\S]*?(<\/h2>)/i,
    "$1Where can I dump trash in Atlanta today?$2"
  );

  out = out.replace(
    /(<h2[^>]*id="faqDumpFree"[^>]*>)[\s\S]*?(<\/h2>)/i,
    "$1Where can I recycle or drop off specialty items in Atlanta?$2"
  );

  out = out.replace(
    /(<p[^>]*id="faqDumpFreeBody"[^>]*>)[\s\S]*?(<\/p>)/i,
    "$1Atlanta-area residents use a mix of city events, CHaRM sites, county facilities, and municipal recycling centers depending on the material. Always confirm residency rules, accepted items, and current fees before visiting.$2"
  );

  out = out.replace(
    "<h2>What items are typically accepted?</h2>",
    "<h2>Atlanta transfer stations and recycling centers: what they accept</h2>"
  );

  out = out.replace(
    "<h2>Fees, hours, and resident requirements</h2>",
    "<h2>Atlanta landfill and transfer station fees, hours, and rules</h2>"
  );

  return out;
}

function run() {
  if (!fs.existsSync(CITY_LIST_PATH)) {
    console.error(`City list not found: ${CITY_LIST_PATH}`);
    process.exit(1);
  }

  const cityList = safeReadJson(CITY_LIST_PATH, []);
  if (!Array.isArray(cityList)) {
    console.error(`Invalid city list JSON: ${CITY_LIST_PATH}`);
    process.exit(1);
  }

  let template = fs.readFileSync(TEMPLATE_PATH, "utf-8");
  template = template
    .replace(/<title>.*?<\/title>\s*/i, "")
    .replace(/<meta\s+name="description"[^>]*>\s*/i, "")
    .replace(/<link\s+rel="canonical"[^>]*>\s*/i, "");

  const neighborsMap = safeReadJson(NEIGHBORS_PATH, {});

  const filtered = cityList.filter((entry) => {
    const state = String(entry?.state || "").toLowerCase();
    const city = String(entry?.city || "").toLowerCase();
    if (!state || !city) return false;
    if (state !== STATE_ARG) return false;
    if (CITY_FILTER_ARG && city !== CITY_FILTER_ARG) return false;
    return true;
  });

  if (filtered.length === 0) {
    const cityMsg = CITY_FILTER_ARG ? ` city=${CITY_FILTER_ARG}` : "";
    console.error(`No city pages matched state=${STATE_ARG}${cityMsg}`);
    process.exit(1);
  }

  const renderable = [];
  const skippedNoData = [];
  const cityItemsByKey = new Map();
  const citySourceByKey = new Map();

  for (const entry of filtered) {
    const state = String(entry.state).toLowerCase();
    const city = String(entry.city).toLowerCase();
    const { items, source } = readCityDataItems(state, city);
    if (!Array.isArray(items) || items.length === 0) {
      skippedNoData.push(`${state}/${city}`);
      continue;
    }
    renderable.push(entry);
    cityItemsByKey.set(`${state}/${city}`, items);
    citySourceByKey.set(`${state}/${city}`, source);
  }

  if (renderable.length === 0) {
    const cityMsg = CITY_FILTER_ARG ? ` city=${CITY_FILTER_ARG}` : "";
    console.error(`No city pages had renderable data for state=${STATE_ARG}${cityMsg}`);
    process.exit(1);
  }

  const validCitySet = new Set(
    renderable
      .map((entry) => String(entry?.city || "").toLowerCase())
      .filter(Boolean)
  );

  for (const entry of renderable) {
    const state = String(entry.state).toLowerCase();
    const city = String(entry.city).toLowerCase();
    const key = `${state}/${city}`;
    const cityItems = cityItemsByKey.get(key) || [];
    const citySource = citySourceByKey.get(key) || "none";
    const isEnhanced = isEnhancedManualCity(state, city);

    const meta = buildMeta({ state, city });

    let outputHtml = template;
    outputHtml = injectHeadMeta(outputHtml, meta);
    outputHtml = injectJsonLd(outputHtml, buildJsonLd({ state, city, meta }));
    outputHtml = injectBodySeed(outputHtml, state, city, {
      enhancedCity: isEnhanced,
      blendCuratedWithData: citySource === "curated_blend",
    });
    const initialResultsLimit = (isLosAngelesCity(state, city) || isHoustonCity(state, city) || isMiamiCity(state, city)) ? 15 : 12;
    outputHtml = injectInitialResults(outputHtml, buildInitialResultsHtml(cityItems, { limit: initialResultsLimit }));
    outputHtml = injectStateHubLink(outputHtml, state);
    outputHtml = injectPopularCities(outputHtml, state);

    const nearbyHtml = buildNearbyHtml({ state, city, neighborsMap, validCitySet });
    outputHtml = injectNearby(outputHtml, nearbyHtml);
    outputHtml = injectCuratedOverlay(outputHtml, state, city);

    if (isHoustonCity(state, city)) {
      outputHtml = injectHoustonIntentCopy(outputHtml);
    } else if (isDallasCity(state, city)) {
      outputHtml = injectDallasIntentCopy(outputHtml);
    } else if (isMiamiCity(state, city)) {
      outputHtml = injectMiamiIntentCopy(outputHtml);
    } else if (isAustinCity(state, city)) {
      outputHtml = injectAustinIntentCopy(outputHtml);
    } else if (isSanAntonioCity(state, city)) {
      outputHtml = injectSanAntonioIntentCopy(outputHtml);
    } else if (isLosAngelesCity(state, city)) {
      outputHtml = injectLosAngelesIntentCopy(outputHtml);
    } else if (isSanFranciscoCity(state, city)) {
      outputHtml = injectSanFranciscoIntentCopy(outputHtml);
    } else if (isAtlantaCity(state, city)) {
      outputHtml = injectAtlantaIntentCopy(outputHtml);
    } else if (isEnhanced) {
      outputHtml = injectGenericEnhancedIntentCopy(outputHtml, { state, city, items: cityItems });
    }

    const outDir = path.join(OUTPUT_BASE, state, city);
    const outFile = path.join(outDir, "index.html");

    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(outFile, outputHtml, "utf-8");

    console.log(`Wrote city page: ${outFile}`);
  }

  if (skippedNoData.length > 0) {
    console.log(`Skipped ${skippedNoData.length} city page(s) with no data.`);
  }
  console.log(`Generated ${renderable.length} city page(s).`);
}

run();
