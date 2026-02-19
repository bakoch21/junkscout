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
  return state.toUpperCase();
}

function isHoustonCity(state, city) {
  return String(state || "").toLowerCase() === "texas" && String(city || "").toLowerCase() === "houston";
}

function isDallasCity(state, city) {
  return String(state || "").toLowerCase() === "texas" && String(city || "").toLowerCase() === "dallas";
}

function shouldBlendCuratedWithData(state, city) {
  return isDallasCity(state, city);
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

function buildInitialResultsHtml(items = []) {
  const slice = Array.isArray(items) ? items.slice(0, 12) : [];
  if (slice.length === 0) return `<p class="muted">No locations found.</p>`;

  return slice
    .map((item) => {
      const name = escapeHtml(item?.name || "Unnamed location");
      const address = String(item?.address || "").trim();
      const facilityId = String(item?.facility_id || item?.id || "").trim();
      const facilityHref = facilityId ? `/facility/${encodeURIComponent(facilityId)}/` : "";
      const mapsUrl = mapsUrlForItem(item);

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
              "Houston residents can use city neighborhood depositories and recycling centers for many household items. Private transfer stations and landfills also accept paid loads.",
          },
        },
        {
          "@type": "Question",
          name: "Where can I drop off trash for free in Houston?",
          acceptedAnswer: {
            "@type": "Answer",
            text:
              "Some Houston drop-off locations are free for residents with proof of address and valid ID. Visit limits and material restrictions can apply.",
          },
        },
        {
          "@type": "Question",
          name: "What do garbage transfer stations in Houston charge?",
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
              "Yes. Several landfill and transfer options near Houston accept larger loads, but accepted materials, hours, and fees vary by site.",
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
              "Dallas has municipal and private options including transfer stations, landfill access points, and recycling drop-offs depending on load type and eligibility.",
          },
        },
        {
          "@type": "Question",
          name: "Where can I drop off trash for free in Dallas?",
          acceptedAnswer: {
            "@type": "Answer",
            text:
              "Some Dallas-area services are resident-focused and may include low-cost or free options for specific materials. Always confirm residency rules, limits, and current fees.",
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

function injectBodySeed(html, state, city) {
  return html.replace("<body>", `<body data-state="${escapeHtml(state)}" data-city="${escapeHtml(city)}">`);
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
        typeof d === "number" && Number.isFinite(d) ? `${Math.round(d)} mi` : "";

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
    <a class="quickstart__item" href="/texas/houston/?type=dumpster#results">
      <span class="quickstart__title">Public dumpster options</span>
      <span class="quickstart__meta">Fast neighborhood drop-off points</span>
      <span class="quickstart__arrow" aria-hidden="true">&rsaquo;</span>
    </a>
  </div>
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
    "$1Need to dump trash in Houston fast? Use this where to dump guide and confirm rules before you drive.$2\n" + quickStartBlock
  );

  out = out.replace(
    /(<h2[^>]*id="faqDumpWhere"[^>]*>)[\s\S]*?(<\/h2>)/i,
    "$1Where can I dump trash in Houston today?$2"
  );

  out = out.replace(
    /(<h2[^>]*id="faqDumpFree"[^>]*>)[\s\S]*?(<\/h2>)/i,
    "$1Where can I drop off trash for free in Houston?$2"
  );

  out = out.replace(
    /(<p[^>]*id="faqDumpFreeBody"[^>]*>)[\s\S]*?(<\/p>)/i,
    "$1Some Houston facilities offer free resident drop-off with ID and proof of address, while private transfer stations and landfills usually charge by load size or weight.$2"
  );

  out = out.replace(
    "<h2>What items are typically accepted?</h2>",
    "<h2>Garbage transfer stations in Houston: what they accept</h2>"
  );

  out = out.replace(
    "<h2>Fees, hours, and resident requirements</h2>",
    "<h2>Houston landfill and transfer station fees, hours, and rules</h2>"
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
      <span class="quickstart__meta">Electronics, recyclables, and sorted materials</span>
      <span class="quickstart__arrow" aria-hidden="true">&rsaquo;</span>
    </a>
    <a class="quickstart__item" href="/texas/dallas/?type=transfer#results">
      <span class="quickstart__title">Transfer stations</span>
      <span class="quickstart__meta">Fast unload options for mixed loads</span>
      <span class="quickstart__arrow" aria-hidden="true">&rsaquo;</span>
    </a>
    <a class="quickstart__item" href="/texas/dallas/?type=landfill#results">
      <span class="quickstart__title">Landfills</span>
      <span class="quickstart__meta">Large loads and heavy disposal</span>
      <span class="quickstart__arrow" aria-hidden="true">&rsaquo;</span>
    </a>
    <a class="quickstart__item" href="/texas/dallas/?type=dumpster#results">
      <span class="quickstart__title">Public dumpster options</span>
      <span class="quickstart__meta">Simple drop-off points and city options</span>
      <span class="quickstart__arrow" aria-hidden="true">&rsaquo;</span>
    </a>
  </div>
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
    "$1Need to dump trash in Dallas fast? Start with these verified options and confirm rules before you drive.$2\n" + quickStartBlock
  );

  out = out.replace(
    /(<h2[^>]*id="faqDumpWhere"[^>]*>)[\s\S]*?(<\/h2>)/i,
    "$1Where can I dump trash in Dallas today?$2"
  );

  out = out.replace(
    /(<h2[^>]*id="faqDumpFree"[^>]*>)[\s\S]*?(<\/h2>)/i,
    "$1Where can I drop off trash for free in Dallas?$2"
  );

  out = out.replace(
    /(<p[^>]*id="faqDumpFreeBody"[^>]*>)[\s\S]*?(<\/p>)/i,
    "$1Some Dallas-area facilities offer resident-focused or lower-cost drop-off options, while private transfer stations and landfills usually charge by load size or material type.$2"
  );

  out = out.replace(
    "<h2>What items are typically accepted?</h2>",
    "<h2>Dallas transfer stations and recycling centers: what they accept</h2>"
  );

  out = out.replace(
    "<h2>Fees, hours, and resident requirements</h2>",
    "<h2>Dallas landfill and transfer station fees, hours, and rules</h2>"
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

  for (const entry of filtered) {
    const state = String(entry.state).toLowerCase();
    const city = String(entry.city).toLowerCase();
    const { items } = readCityDataItems(state, city);
    if (!Array.isArray(items) || items.length === 0) {
      skippedNoData.push(`${state}/${city}`);
      continue;
    }
    renderable.push(entry);
    cityItemsByKey.set(`${state}/${city}`, items);
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

    const meta = buildMeta({ state, city });

    let outputHtml = template;
    outputHtml = injectHeadMeta(outputHtml, meta);
    outputHtml = injectJsonLd(outputHtml, buildJsonLd({ state, city, meta }));
    outputHtml = injectBodySeed(outputHtml, state, city);
    outputHtml = injectInitialResults(outputHtml, buildInitialResultsHtml(cityItems));
    outputHtml = injectStateHubLink(outputHtml, state);
    outputHtml = injectPopularCities(outputHtml, state);

    const nearbyHtml = buildNearbyHtml({ state, city, neighborsMap, validCitySet });
    outputHtml = injectNearby(outputHtml, nearbyHtml);
    outputHtml = injectCuratedOverlay(outputHtml, state, city);

    if (isHoustonCity(state, city)) {
      outputHtml = injectHoustonIntentCopy(outputHtml);
    } else if (isDallasCity(state, city)) {
      outputHtml = injectDallasIntentCopy(outputHtml);
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
