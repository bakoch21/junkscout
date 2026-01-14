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

function buildMeta(f) {
  const name = f.name || "Unnamed facility";
  const type = f.type || "drop-off site";
  const cityGuess = (f.appears_in && f.appears_in[0] && f.appears_in[0].city) ? f.appears_in[0].city : "";
  const titleCity = cityGuess ? cityGuess.split("-").map(w => w[0]?.toUpperCase() + w.slice(1)).join(" ") : "Texas";

  const title = `${name} — ${type.replace(/_/g, " ")} in ${titleCity}, TX | JunkScout`;
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
      "name": name,
      "url": meta.canonicalUrl,
      ...(address
        ? {
            "address": {
              "@type": "PostalAddress",
              "streetAddress": address,
              "addressRegion": "TX",
              "addressCountry": "US"
            },
          }
        : {}),
      ...(lat && lng
        ? { "geo": { "@type": "GeoCoordinates", "latitude": lat, "longitude": lng } }
        : {}),
      ...(f.osm_url ? { "sameAs": [f.osm_url] } : {})
    },
    {
      "@type": "WebPage",
      "@id": `${meta.canonicalUrl}#webpage`,
      "name": meta.title,
      "description": meta.description,
      "url": meta.canonicalUrl,
      "about": { "@id": `${meta.canonicalUrl}#place` }
    }
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
    return html.replace(
      markerRegex,
      `<!-- JSONLD:START -->\n${jsonLdScript}\n<!-- JSONLD:END -->`
    );
  }
  return html.replace("</head>", `\n${jsonLdScript}\n</head>`);
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

  const files = fs.readdirSync(FACILITIES_DIR).filter((f) => f.endsWith(".json") && f !== "index.json");

  for (const file of files) {
    const f = JSON.parse(fs.readFileSync(path.join(FACILITIES_DIR, file), "utf-8"));
    const meta = buildMeta(f);

    let outHtml = template;
    outHtml = injectHeadMeta(outHtml, meta);
    outHtml = injectJsonLd(outHtml, buildJsonLd(f, meta));

    const outDir = path.join(OUTPUT_BASE, "facility", f.id);
    const outFile = path.join(outDir, "index.html");
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(outFile, outHtml, "utf-8");

    console.log(`✅ Wrote facility page → ${outFile}`);
  }
}

run();
