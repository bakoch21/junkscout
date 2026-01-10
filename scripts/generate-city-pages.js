// scripts/generate-city-pages.js
const fs = require("fs");
const path = require("path");

const CITY_LIST_PATH = "./scripts/cities-texas.json";
const TEMPLATE_PATH = "./city-template.html";
const OUTPUT_BASE = "."; // project root

function titleCaseFromSlug(slug = "") {
  return slug
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function buildMeta({ state, city }) {
  const cityName = titleCaseFromSlug(city);
  const stateUpper = state.toUpperCase();

  const title = `Find dumps and landfills in ${cityName}, ${stateUpper} | JunkScout`;
  const description =
    `Public dumps, landfills, transfer stations, and recycling drop-offs near ${cityName}, ${stateUpper} — with rules and accepted materials when available.`;

  const canonicalPath = `/${state}/${city}/`;
  const ogTitle = title;
  const ogDesc = description;

  return { title, description, canonicalPath, ogTitle, ogDesc };
}

function injectHeadMeta(html, meta) {
  // Insert meta tags before </head>
  const tags = `
  <title>${meta.title}</title>
  <meta name="description" content="${meta.description}" />
  <link rel="canonical" href="${meta.canonicalPath}" />

  <meta property="og:type" content="website" />
  <meta property="og:title" content="${meta.ogTitle}" />
  <meta property="og:description" content="${meta.ogDesc}" />
  <meta property="og:url" content="${meta.canonicalPath}" />

  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content="${meta.ogTitle}" />
  <meta name="twitter:description" content="${meta.ogDesc}" />
`;

  return html.replace("</head>", `${tags}\n</head>`);
}

function injectBodySeed(html, { state, city }) {
  // We’ll set a data attribute so city.js can read it without relying on route parsing if you want.
  // (route parsing still works, but this gives you a fallback)
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
  // (We’ll override anyway, but best to keep template clean.)
  template = template
    .replace(/<title>.*?<\/title>\s*/i, "")
    .replace(/<meta\s+name="description"[^>]*>\s*/i, "");

  for (const entry of cities) {
    const { state, city } = entry;
    const meta = buildMeta({ state, city });

    let outHtml = template;
    outHtml = injectHeadMeta(outHtml, meta);
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
