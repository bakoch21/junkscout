// scripts/generate-city-pages.js
const fs = require("fs");
const path = require("path");

const CITY_LIST_PATH = "./scripts/cities-texas.json";
const TEMPLATE_PATH = "./city-template.html";
const OUTPUT_BASE = "."; // project root

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
  // Extend later if you add states
  if (stateSlug.toLowerCase() === "texas") return "TX";
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
  const stateName = titleCaseFromSlug(state);      // "Texas"
  const stateAbbrev = stateAbbrevFromSlug(state);  // "TX"

  const url = meta.canonicalUrl;                   // https://junkscout.io/texas/austin/
  const stateUrl = `${BASE_URL}/${state}/`;        // https://junkscout.io/texas/
  const siteUrl = `${BASE_URL}/`;                  // https://junkscout.io/

  // Stable IDs (Google likes entity stitching)
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
      "name": "JunkScout",
      "url": siteUrl
    },
    {
      "@type": "WebSite",
      "@id": websiteId,
      "name": "JunkScout",
      "url": siteUrl,
      "publisher": { "@id": orgId },
      "potentialAction": {
        "@type": "SearchAction",
        "target": {
          "@type": "EntryPoint",
          "urlTemplate": searchTarget
        },
        "query-input": "required name=search_term_string"
      }
    },
    {
      "@type": "BreadcrumbList",
      "@id": breadcrumbId,
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": siteUrl },
        { "@type": "ListItem", "position": 2, "name": stateName, "item": stateUrl },
        { "@type": "ListItem", "position": 3, "name": cityName, "item": url }
      ]
    },
    {
      "@type": "Place",
      "@id": placeId,
      "name": `Dump and landfill options in ${cityName}, ${stateName}`,
      "address": {
        "@type": "PostalAddress",
        "addressLocality": cityName,
        "addressRegion": stateAbbrev,
        "addressCountry": "US"
      },
      "hasMap": `https://www.google.com/maps/search/${encodeURIComponent(
        `dump landfill ${cityName} ${stateAbbrev}`
      )}`,
      "url": url
    },
    {
      "@type": "WebPage",
      "@id": webpageId,
      "name": meta.title,
      "description": meta.description,
      "url": url,
      "isPartOf": { "@id": websiteId },
      "about": { "@id": placeId },
      "breadcrumb": { "@id": breadcrumbId }
    }
  ];

  const json = JSON.stringify(
    { "@context": "https://schema.org", "@graph": graph },
    null,
    2
  );

  return `<script type="application/ld+json">\n${json}\n</script>`;
}

function injectHeadMeta(html, meta) {
  // Insert meta tags before </head>
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
  // Prefer marker replacement; fall back to inserting before </head>
  const markerRegex = /<!--\s*JSONLD:START\s*-->[\s\S]*?<!--\s*JSONLD:END\s*-->/;

  if (markerRegex.test(html)) {
    return html.replace(
      markerRegex,
      `<!-- JSONLD:START -->\n${jsonLdScript}\n<!-- JSONLD:END -->`
    );
  }

  // Fallback: insert right before </head>
  return html.replace("</head>", `\n${jsonLdScript}\n</head>`);
}

function injectBodySeed(html, { state, city }) {
  // Add stable data attributes for city.js consumption
  // NOTE: Template currently has "<body>" with no attributes.
  return html.replace(
    "<body>",
    `<body data-state="${state}" data-city="${city}">`
  );
}

function ensureCityTitleIsGeneric(html) {
  // Keep template generic; city.js will set H1/subhead based on route
  return html;
}

function run() {
  const cities = JSON.parse(fs.readFileSync(CITY_LIST_PATH, "utf-8"));
  let template = fs.readFileSync(TEMPLATE_PATH, "utf-8");

  // Remove any hardcoded <title> or meta description in template to avoid duplicates.
  template = template
    .replace(/<title>.*?<\/title>\s*/i, "")
    .replace(/<meta\s+name="description"[^>]*>\s*/i, "");

  for (const entry of cities) {
    const { state, city } = entry;
    const meta = buildMeta({ state, city });

    let outHtml = template;

    // 1) Inject meta tags
    outHtml = injectHeadMeta(outHtml, meta);

    // 2) Inject JSON-LD
    const jsonLd = buildJsonLd({ state, city, meta });
    outHtml = injectJsonLd(outHtml, jsonLd);

    // 3) Add body seed attributes
    outHtml = injectBodySeed(outHtml, { state, city });

    outHtml = ensureCityTitleIsGeneric(outHtml);

    const outDir = path.join(OUTPUT_BASE, state, city);
    const outFile = path.join(outDir, "index.html");

    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(outFile, outHtml, "utf-8");

    console.log(`✅ Wrote page → ${outFile}`);
  }
}

run();
