// scripts/generate-city-pages.js
const fs = require("fs");
const path = require("path");

// Usage:
//   node scripts/generate-city-pages.js texas
//   node scripts/generate-city-pages.js california
// If omitted, defaults to texas.
const STATE_ARG = (process.argv[2] || "texas").toLowerCase();

// City list source of truth: scripts/cities-<state>.json
const CITY_LIST_PATH = `./scripts/cities-${STATE_ARG}.json`;

const TEMPLATE_PATH = "./city-template.html";
const OUTPUT_BASE = "."; // project root

// Neighbors output (from scripts/build-neighbors.js)
const NEIGHBORS_PATH = `./data/${STATE_ARG}/_neighbors.json`;

// ✅ Canonical base (used for canonical, OG, and JSON-LD)
const BASE_URL = "https://junkscout.io";

function titleCaseFromSlug(slug = "") {
  return slug
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function stateAbbrevFromSlug(stateSlug = "") {
  const s = String(stateSlug || "").toLowerCase();
  if (s === "texas") return "TX";
  if (s === "california") return "CA";
  return stateSlug.toUpperCase();
}

function buildMeta({ state, city }) {
  const cityName = titleCaseFromSlug(city);
  const stateUpper = state.toUpperCase();

  const title = `Find dumps and landfills in ${cityName}, ${stateUpper} | JunkScout`;
  const description =
    `Public dumps, landfills, transfer stations, and recycling drop-offs near ${cityName}, ${stateUpper} — with rules and accepted materials when available.`;

  const canonicalPath = `/${state}/${city}/`;
  const canonicalUrl = `${BASE_URL}${canonicalPath}`;

  const ogTitle = title;
  const ogDesc = description;

  return { title, description, canonicalPath, canonicalUrl, ogTitle, ogDesc };
}

function buildJsonLd({ state, city, meta }) {
  const cityName = titleCaseFromSlug(city);
  const stateName = titleCaseFromSlug(state); // "Texas"
  const stateAbbrev = stateAbbrevFromSlug(state); // "TX" / "CA"

  const url = meta.canonicalUrl; // https://junkscout.io/texas/austin/
  const stateUrl = `${BASE_URL}/${state}/`; // https://junkscout.io/texas/
  const siteUrl = `${BASE_URL}/`; // https://junkscout.io/

  const webpageId = `${url}#webpage`;
  const breadcrumbId = `${url}#breadcrumb`;
  const placeId = `${url}#place`;
  const websiteId = `${siteUrl}#website`;
  const orgId = `${siteUrl}#org`;

  const searchTarget = `${BASE_URL}/?where={search_term_string}`;

  const graph = [
    {
      "@type": "Organization",
      "@id": orgId,
      name: "JunkScout",
      url: siteUrl,
    },
    {
      "@type": "WebSite",
      "@id": websiteId,
      name: "JunkScout",
      url: siteUrl,
      publisher: { "@id": orgId },
      potentialAction: {
        "@type": "SearchAction",
        target: { "@type": "EntryPoint", urlTemplate: searchTarget },
        "query-input": "required name=search_term_string",
      },
    },
    {
      "@type": "BreadcrumbList",
      "@id": breadcrumbId,
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: siteUrl },
        { "@type": "ListItem", position: 2, name: stateName, item: stateUrl },
        { "@type": "ListItem", position: 3, name: cityName, item: url },
      ],
    },
    {
      "@type": "Place",
      "@id": placeId,
      name: `Dump and landfill options in ${cityName}, ${stateName}`,
      address: {
        "@type": "PostalAddress",
        addressLocality: cityName,
        addressRegion: stateAbbrev,
        addressCountry: "US",
      },
      hasMap: `https://www.google.com/maps/search/${encodeURIComponent(
        `dump landfill ${cityName} ${stateAbbrev}`
      )}`,
      url,
    },
    {
      "@type": "WebPage",
      "@id": webpageId,
      name: meta.title,
      description: meta.description,
      url,
      isPartOf: { "@id": websiteId },
      about: { "@id": placeId },
      breadcrumb: { "@id": breadcrumbId },
    },
  ];

  const json = JSON.stringify(
    { "@context": "https://schema.org", "@graph": graph },
    null,
    2
  );

  return `<script type="application/ld+json">\n${json}\n</script>`;
}

function injectHeadMeta(html, meta) {
  const tags = `
  <title>${meta.title}</title>
  <meta name="description" content="${meta.description}" />
  <link rel="canonical" href="${meta.canonicalUrl}" />

  <meta property="og:type" content="website" />
  <meta property="og:title" content="${meta.ogTitle}" />
  <meta property="og:description" content="${meta.ogDesc}" />
  <meta property="og:url" content="${meta.canonicalUrl}" />

  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content="${meta.ogTitle}" />
  <meta name="twitter:description" content="${meta.ogDesc}" />
`;
  return html.replace("</head>", `${tags}\n</head>`);
}

function injectJsonLd(html, jsonLdScript) {
  const markerRegex = /<!--\s*JSONLD:START\s*-->[\s\S]*?<!--\s*JSONLD:END\s*-->/;

  if (markerRegex.test(html)) {
    return html.replace(
      markerRegex,
      `<!-- JSONLD:START -->\n${jsonLdScript}\n<!-- JSONLD:END -->`
    );
  }

  return html.replace("</head>", `\n${jsonLdScript}\n</head>`);
}

function injectBodySeed(html, { state, city }) {
  return html.replace("<body>", `<body data-state="${state}" data-city="${city}">`);
}

/**
 * Build the nearby cities HTML.
 * Reads neighbors map (generated by build-neighbors.js) and renders a simple list of links.
 */
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
      const label = n && (n.label || n.name) ? String(n.label || n.name) : titleCaseFromSlug(cleanSlug);

      const d =
        (n && (n.distance_mi ?? n.distanceMiles ?? n.mi ?? n.distance)) ??
        null;

      const distanceText =
        typeof d === "number" && isFinite(d) ? `${Math.round(d)} mi` : "";

      return { slug: cleanSlug, label, distanceText };
    })
    .filter(Boolean);

  if (items.length === 0) return "";

  const cityName = titleCaseFromSlug(city);
  const stateName = titleCaseFromSlug(state);

  return `
<section class="seo-copy" aria-label="Nearby locations">
  <h2>Nearby dump & landfill locations</h2>
  <p class="muted">
    If you don’t see the right option in ${cityName}, check these nearby cities in ${stateName}.
  </p>

  <div class="cityhub__grid" style="margin-top:10px">
    ${items
      .map(
        (x) => `
      <a class="cityhub__pill" href="/${state}/${x.slug}/">
        ${x.label}${x.distanceText ? ` <span class="muted" style="font-weight:600">· ${x.distanceText}</span>` : ""}
      </a>
    `
      )
      .join("")}
  </div>
</section>
`.trim();
}

function injectNearby(html, nearbyHtml) {
  if (!nearbyHtml) return html;

  const markerRegex = /<!--\s*NEARBY:START\s*-->[\s\S]*?<!--\s*NEARBY:END\s*-->/;

  if (markerRegex.test(html)) {
    return html.replace(
      markerRegex,
      `<!-- NEARBY:START -->\n${nearbyHtml}\n<!-- NEARBY:END -->`
    );
  }

  if (html.includes("</main>")) {
    return html.replace("</main>", `\n${nearbyHtml}\n</main>`);
  }

  return html.replace("</body>", `\n${nearbyHtml}\n</body>`);
}

/**
 * ✅ 1) Back-to-state hub link
 * Injected via markers:
 *   <!-- STATEHUBLINK:START --><!-- STATEHUBLINK:END -->
 */
function buildStateHubLinkHtml(state) {
  const stateName = titleCaseFromSlug(state);
  return `
<div style="margin-top:12px">
  <a class="link" href="/${state}/">← Back to ${stateName} cities</a>
</div>
`.trim();
}

function injectStateHubLink(html, state) {
  const stateHtml = buildStateHubLinkHtml(state);

  const markerRegex = /<!--\s*STATEHUBLINK:START\s*-->[\s\S]*?<!--\s*STATEHUBLINK:END\s*-->/;

  if (markerRegex.test(html)) {
    return html.replace(
      markerRegex,
      `<!-- STATEHUBLINK:START -->\n${stateHtml}\n<!-- STATEHUBLINK:END -->`
    );
  }

  // Fallback: inject right after <p id="citySubhead"...> block if present
  if (html.includes('id="citySubhead"')) {
    return html.replace(
      /(<p[^>]*id="citySubhead"[\s\S]*?<\/p>)/,
      `$1\n${stateHtml}`
    );
  }

  // Last resort: before results
  if (html.includes('id="results"')) {
    return html.replace(
      /(<section[^>]*id="results"[^>]*>)/,
      `${stateHtml}\n$1`
    );
  }

  return html;
}

/**
 * ✅ 2) Popular cities block (only for CA right now)
 * Injected via markers:
 *   <!-- POPULARCITIES:START --><!-- POPULARCITIES:END -->
 */
function buildPopularCitiesHtml(state) {
  const s = String(state || "").toLowerCase();
  if (s !== "california") return "";

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
  <h2>Popular ${stateName} locations</h2>
  <p class="muted">Browse major cities while we expand coverage.</p>
  <div class="cityhub__grid" style="margin-top:10px">
    ${popular
      .map(
        (x) => `
      <a class="cityhub__pill" href="/${state}/${x.slug}/">${x.label}</a>
    `
      )
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
    return html.replace(
      markerRegex,
      `<!-- POPULARCITIES:START -->\n${block}\n<!-- POPULARCITIES:END -->`
    );
  }

  // Fallback: insert above SEO COPY section
  if (html.includes("<!-- SEO COPY START -->")) {
    return html.replace("<!-- SEO COPY START -->", `${block}\n\n<!-- SEO COPY START -->`);
  }

  // Last resort
  return html.replace("</main>", `\n${block}\n</main>`);
}

function safeReadJson(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}

function run() {
  if (!fs.existsSync(CITY_LIST_PATH)) {
    console.error(`❌ City list not found: ${CITY_LIST_PATH}`);
    console.error(`   Create it (e.g., scripts/cities-${STATE_ARG}.json) then re-run.`);
    process.exit(1);
  }

  const cities = JSON.parse(fs.readFileSync(CITY_LIST_PATH, "utf-8"));
  let template = fs.readFileSync(TEMPLATE_PATH, "utf-8");

  // Remove any hardcoded <title> or meta description in template to avoid duplicates.
  template = template
    .replace(/<title>.*?<\/title>\s*/i, "")
    .replace(/<meta\s+name="description"[^>]*>\s*/i, "");

  // Load neighbors map once (if it exists)
  const neighborsMap = safeReadJson(NEIGHBORS_PATH) || {};

  for (const entry of cities) {
    const { state, city } = entry;
    if (!state || !city) continue;

    // Only generate for the chosen state file
    if (String(state).toLowerCase() !== STATE_ARG) continue;

    const meta = buildMeta({ state, city });

    let outHtml = template;

    // 1) Inject meta tags
    outHtml = injectHeadMeta(outHtml, meta);

    // 2) Inject JSON-LD
    const jsonLd = buildJsonLd({ state, city, meta });
    outHtml = injectJsonLd(outHtml, jsonLd);

    // 3) Add body seed attributes
    outHtml = injectBodySeed(outHtml, { state, city });

    // ✅ 1) Back-to-state hub link
    outHtml = injectStateHubLink(outHtml, state);

    // ✅ 2) Popular cities block (CA only for now)
    outHtml = injectPopularCities(outHtml, state);

    // 4) Inject Nearby cities (only if neighbors map exists)
    const nearbyHtml = buildNearbyHtml({ state, city, neighborsMap });
    outHtml = injectNearby(outHtml, nearbyHtml);

    const outDir = path.join(OUTPUT_BASE, state, city);
    const outFile = path.join(outDir, "index.html");

    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(outFile, outHtml, "utf-8");

    console.log(`✅ Wrote page → ${outFile}`);
  }
}

run();
