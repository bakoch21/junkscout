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

function readCityDataItems(state, city) {
  const curated = getCuratedObject(state, city);
  const curatedItems = getCuratedItems(curated);
  if (curatedItems.length > 0) {
    return { items: curatedItems, source: "curated" };
  }

  const dataPath = path.join(CITY_DATA_BASE, state, `${city}.json`);
  const data = safeReadJson(dataPath, null);
  if (Array.isArray(data)) {
    return { items: data, source: "data_file" };
  }
  if (data && typeof data === "object" && Array.isArray(data.facilities)) {
    return { items: data.facilities, source: "data_file" };
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
  let title = `Find dumps and landfills in ${cityName}, ${stateAbbrev} | JunkScout`;
  let description =
    `Public dumps, landfills, transfer stations, and recycling drop-offs near ${cityName}, ${stateAbbrev} with rules and accepted materials when available.`;

  if (isHoustonCity(state, city)) {
    title = "Houston Dump, Landfill & Transfer Station Guide (Fees, Hours, Rules) | JunkScout";
    description =
      "Compare Houston dump, landfill, transfer station, and recycling drop-off options with fees, hours, resident rules, and accepted materials.";
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
<div style="margin-top:12px">
  <a class="link" href="/${escapeHtml(state)}/">&larr; Back to ${escapeHtml(stateName)} cities</a>
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

  out = out.replace(
    /(<h1[^>]*id="cityTitle"[^>]*>)[\s\S]*?(<\/h1>)/i,
    "$1Houston Dump, Landfill & Transfer Station Guide$2"
  );

  out = out.replace(
    /(<p[^>]*id="cityAnswer"[^>]*>)[\s\S]*?(<\/p>)/i,
    "$1Compare Houston dump, landfill, transfer station, and recycling drop-off options with fees, hours, resident rules, and accepted materials.$2"
  );

  out = out.replace(
    /(<p[^>]*id="citySubhead"[^>]*>)[\s\S]*?(<\/p>)/i,
    "$1Need to dump trash in Houston fast? Use this where to dump guide and confirm rules before you drive.$2"
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
