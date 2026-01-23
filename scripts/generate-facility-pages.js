// scripts/generate-facility-pages.js
const fs = require("fs");
const path = require("path");

const FACILITIES_DIR = "./data/facilities";
const TEMPLATE_PATH = "./facility-template.html";
const OUTPUT_BASE = ".";

const BASE_URL = "https://junkscout.io";

function escapeAttr(s = "") {
  return String(s).replace(/"/g, "&quot;");
}

function titleCaseFromSlug(slug = "") {
  return String(slug)
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function getFacilityContext(f) {
  // Prefer appears_in[0] if present
  const ai = Array.isArray(f.appears_in) && f.appears_in.length ? f.appears_in[0] : null;

  const stateSlug = (ai && ai.state ? String(ai.state) : "texas").toLowerCase();
  const citySlug = (ai && ai.city ? String(ai.city) : "").toLowerCase();

  const cityName = citySlug ? titleCaseFromSlug(citySlug) : "Texas";
  const stateAbbrev = stateSlug === "texas" ? "TX" : stateSlug.toUpperCase();

  return { stateSlug, citySlug, cityName, stateAbbrev };
}

function buildMeta(f) {
  const name = f.name || "Unnamed facility";
  const type = f.type || "drop-off site";

  const ctx = getFacilityContext(f);

  const title = `${name} — ${type.replace(/_/g, " ")} in ${ctx.cityName}, ${ctx.stateAbbrev} | JunkScout`;
  const description = `Address, map, and source links for ${name}. Always confirm fees, hours, and accepted materials before visiting.`;

  const canonicalPath = `/facility/${f.id}/`;
  const canonicalUrl = `${BASE_URL}${canonicalPath}`;

  return { title, description, canonicalPath, canonicalUrl };
}

function buildJsonLd(f, meta) {
  const name = f.name || "Unnamed facility";
  const address = f.address || "";
  const lat = typeof f.lat === "number" ? f.lat : null;
  const lng = typeof f.lng === "number" ? f.lng : null;

  const graph = [
    {
      "@type": "Place",
      "@id": `${meta.canonicalUrl}#place`,
      name,
      url: meta.canonicalUrl,
      ...(address
        ? {
            address: {
              "@type": "PostalAddress",
              streetAddress: address,
              addressRegion: "TX",
              addressCountry: "US",
            },
          }
        : {}),
      ...(lat != null && lng != null
        ? { geo: { "@type": "GeoCoordinates", latitude: lat, longitude: lng } }
        : {}),
      ...(f.osm_url ? { sameAs: [f.osm_url] } : {}),
    },
    {
      "@type": "WebPage",
      "@id": `${meta.canonicalUrl}#webpage`,
      name: meta.title,
      description: meta.description,
      url: meta.canonicalUrl,
      about: { "@id": `${meta.canonicalUrl}#place` },
    },
  ];

  const json = JSON.stringify({ "@context": "https://schema.org", "@graph": graph }, null, 2);
  return `<script type="application/ld+json">\n${json}\n</script>`;
}

function injectHeadMeta(html, meta) {
  const tags = `
  <title>${escapeAttr(meta.title)}</title>
  <meta name="description" content="${escapeAttr(meta.description)}" />
  <link rel="canonical" href="${escapeAttr(meta.canonicalUrl)}" />

  <meta property="og:type" content="website" />
  <meta property="og:title" content="${escapeAttr(meta.title)}" />
  <meta property="og:description" content="${escapeAttr(meta.description)}" />
  <meta property="og:url" content="${escapeAttr(meta.canonicalUrl)}" />

  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content="${escapeAttr(meta.title)}" />
  <meta name="twitter:description" content="${escapeAttr(meta.description)}" />
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

function injectBodyDataset(html, { stateSlug, citySlug }) {
  // If template uses <body ...>, we append attributes safely.
  // If it's exactly "<body>", we replace it.
  const re = /<body([^>]*)>/i;
  if (!re.test(html)) return html;

  return html.replace(re, (m, attrs) => {
    const safeAttrs = attrs || "";
    const hasState = /\bdata-state=/.test(safeAttrs);
    const hasCity = /\bdata-city=/.test(safeAttrs);

    const add =
      `${hasState ? "" : ` data-state="${escapeAttr(stateSlug)}"`}` +
      `${hasCity ? "" : ` data-city="${escapeAttr(citySlug)}"`}`;

    return `<body${safeAttrs}${add}>`;
  });
}

function injectHoustonModalScript(html) {
  // Always include; it will no-op unless Houston.
  // Use defer so it runs after the DOM exists.
  const tag = `\n  <script src="/houston-modal.js" defer></script>\n`;

  if (html.includes('src="/houston-modal.js"')) return html;

  // Prefer before </body>
  if (html.includes("</body>")) return html.replace("</body>", `${tag}</body>`);

  // Fallback
  return html + tag;
}

function run() {
  if (!fs.existsSync(FACILITIES_DIR)) {
    console.error(`❌ Missing ${FACILITIES_DIR}. Run build-facilities first.`);
    process.exit(1);
  }

  let template = fs.readFileSync(TEMPLATE_PATH, "utf-8");

  // remove template title/description so generator owns it
  template = template
    .replace(/<title>.*?<\/title>\s*/i, "")
    .replace(/<meta\s+name="description"[^>]*>\s*/i, "");

  // Ensure modal script is included on every facility page (no-op unless Houston)
  template = injectHoustonModalScript(template);

  const files = fs
    .readdirSync(FACILITIES_DIR)
    .filter((f) => f.endsWith(".json") && f !== "index.json");

  for (const file of files) {
    const f = JSON.parse(fs.readFileSync(path.join(FACILITIES_DIR, file), "utf-8"));
    const meta = buildMeta(f);

    const ctx = getFacilityContext(f);

    let outHtml = template;

    // 1) Inject meta tags
    outHtml = injectHeadMeta(outHtml, meta);

    // 2) Inject JSON-LD
    outHtml = injectJsonLd(outHtml, buildJsonLd(f, meta));

    // 3) Add body dataset for targeting popup
    outHtml = injectBodyDataset(outHtml, { stateSlug: ctx.stateSlug, citySlug: ctx.citySlug });

    const outDir = path.join(OUTPUT_BASE, "facility", f.id);
    const outFile = path.join(outDir, "index.html");
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(outFile, outHtml, "utf-8");

    console.log(`✅ Wrote facility page → ${outFile}`);
  }
}

run();
