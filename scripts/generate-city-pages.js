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

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, (ch) => {
    if (ch === "&") return "&amp;";
    if (ch === "<") return "&lt;";
    if (ch === ">") return "&gt;";
    if (ch === '"') return "&quot;";
    return "&#39;";
  });
}

function buildMeta({ state, city }) {
  const cityName = titleCaseFromSlug(city);
  const stateAbbrev = stateAbbrevFromSlug(state);
  const title = `Find dumps and landfills in ${cityName}, ${stateAbbrev} | JunkScout`;
  const description =
    `Public dumps, landfills, transfer stations, and recycling drop-offs near ${cityName}, ${stateAbbrev} with rules and accepted materials when available.`;
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

function buildNearbyHtml({ state, city, neighborsMap }) {
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
    .filter(Boolean);

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

  const resolvedPath = path.join(CURATED_BASE, stateDir, `${citySlug}.resolved.json`);
  const rawPath = path.join(CURATED_BASE, stateDir, `${citySlug}.json`);

  const curated = safeReadJson(resolvedPath) || safeReadJson(rawPath);
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

  for (const entry of filtered) {
    const state = String(entry.state).toLowerCase();
    const city = String(entry.city).toLowerCase();

    const meta = buildMeta({ state, city });

    let outputHtml = template;
    outputHtml = injectHeadMeta(outputHtml, meta);
    outputHtml = injectJsonLd(outputHtml, buildJsonLd({ state, city, meta }));
    outputHtml = injectBodySeed(outputHtml, state, city);
    outputHtml = injectStateHubLink(outputHtml, state);
    outputHtml = injectPopularCities(outputHtml, state);

    const nearbyHtml = buildNearbyHtml({ state, city, neighborsMap });
    outputHtml = injectNearby(outputHtml, nearbyHtml);
    outputHtml = injectCuratedOverlay(outputHtml, state, city);

    const outDir = path.join(OUTPUT_BASE, state, city);
    const outFile = path.join(outDir, "index.html");

    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(outFile, outputHtml, "utf-8");

    console.log(`Wrote city page: ${outFile}`);
  }

  console.log(`Generated ${filtered.length} city page(s).`);
}

run();
