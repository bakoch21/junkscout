const fs = require("fs");
const path = require("path");

const STATES = [
  { slug: "texas", file: path.join("texas", "index.html") },
  { slug: "california", file: path.join("california", "index.html") },
];

const NOISE_PREFIX_TOKENS = new Set([
  "business",
  "railroad",
  "railway",
  "republic",
  "aviation",
  "wire",
  "shady",
  "creekview",
  "hiawatha",
  "dimmit",
  "cottle",
]);

const NOISE_TOKENS = new Set([
  "tx",
  "texas",
  "business",
  "railroad",
  "railway",
  "republic",
  "aviation",
  "wire",
  "way",
  "trl",
  "creekview",
  "hiawatha",
  "dimmit",
  "cottle",
]);

const SINGLE_TOKEN_ALIAS = {
  texas: {
    antonio: "san-antonio",
    arthur: "port-arthur",
    christi: "corpus-christi",
    braunfels: "new-braunfels",
    paso: "el-paso",
    worth: "fort-worth",
  },
};

const SINGLE_TOKEN_DROP = {
  texas: new Set(["city"]),
};

const FRAGMENT_SINGLE_TOKENS = {
  texas: new Set(["antonio", "arthur", "christi", "braunfels", "paso", "worth"]),
};

function safeReadJson(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return fallback;
  }
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

function titleCaseFromSlug(slug = "") {
  return String(slug || "")
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function tokenizeSlug(slug = "") {
  return String(slug || "")
    .toLowerCase()
    .split("-")
    .filter(Boolean);
}

function hasRepeatedTokens(tokens = []) {
  for (let i = 1; i < tokens.length; i += 1) {
    if (tokens[i] === tokens[i - 1]) return true;
  }
  return new Set(tokens).size < tokens.length;
}

function normalizeTokens(tokens = []) {
  const stripped = tokens.filter((t) => t !== "tx" && t !== "texas");
  const collapsed = [];
  for (const token of stripped) {
    if (collapsed.length === 0 || collapsed[collapsed.length - 1] !== token) {
      collapsed.push(token);
    }
  }

  const deduped = [];
  const seen = new Set();
  for (const token of collapsed) {
    if (seen.has(token)) continue;
    seen.add(token);
    deduped.push(token);
  }
  return deduped;
}

function isNoisyRawSlug(tokens = []) {
  if (tokens.length >= 3) return true;
  if (tokens.includes("tx") || tokens.includes("texas")) return true;
  if (hasRepeatedTokens(tokens)) return true;
  if (tokens[0] && NOISE_PREFIX_TOKENS.has(tokens[0])) return true;
  return false;
}

function scoreSlug(slug = "") {
  const tokens = tokenizeSlug(slug);
  let score = 100;

  if (tokens.includes("tx") || tokens.includes("texas")) score -= 25;
  if (hasRepeatedTokens(tokens)) score -= 25;
  if (tokens[0] && NOISE_PREFIX_TOKENS.has(tokens[0])) score -= 25;
  if (tokens.length > 2) score -= (tokens.length - 2) * 8;

  for (const token of tokens) {
    if (NOISE_TOKENS.has(token)) score -= 6;
  }

  const fragmentSet = FRAGMENT_SINGLE_TOKENS.texas;
  if (tokens.length === 1 && fragmentSet.has(tokens[0])) score -= 35;

  return score;
}

function pickCanonicalSlug(rawSlug, rawSet, state) {
  const raw = String(rawSlug || "").toLowerCase().trim();
  if (!raw) return "";

  const rawTokens = tokenizeSlug(raw);
  const normalizedTokens = normalizeTokens(rawTokens);
  const normalizedSlug = normalizedTokens.join("-");
  const candidates = new Set([raw]);

  const aliasMap = SINGLE_TOKEN_ALIAS[state] || {};
  if (rawTokens.length === 1 && aliasMap[rawTokens[0]] && rawSet.has(aliasMap[rawTokens[0]])) {
    return aliasMap[rawTokens[0]];
  }

  if (normalizedSlug && rawSet.has(normalizedSlug)) candidates.add(normalizedSlug);

  if (isNoisyRawSlug(rawTokens) && normalizedTokens.length > 0) {
    for (let len = Math.min(3, normalizedTokens.length); len >= 1; len -= 1) {
      const suffix = normalizedTokens.slice(-len).join("-");
      if (suffix && rawSet.has(suffix)) candidates.add(suffix);
    }
    for (let len = Math.min(3, normalizedTokens.length); len >= 1; len -= 1) {
      const prefix = normalizedTokens.slice(0, len).join("-");
      if (prefix && rawSet.has(prefix)) candidates.add(prefix);
    }
  }

  const ranked = Array.from(candidates).sort((a, b) => {
    const diff = scoreSlug(b) - scoreSlug(a);
    if (diff !== 0) return diff;
    const tokDiff = tokenizeSlug(a).length - tokenizeSlug(b).length;
    if (tokDiff !== 0) return tokDiff;
    return a.localeCompare(b);
  });

  const dropSet = SINGLE_TOKEN_DROP[state] || new Set();
  const best = ranked.find((slug) => !dropSet.has(slug)) || "";
  return best;
}

function getCitySlugsForState(state) {
  const listPath = path.join("scripts", `cities-${state}.json`);
  const list = safeReadJson(listPath, []);
  if (!Array.isArray(list)) return [];

  const rawSet = new Set();
  list.forEach((entry) => {
    const entryState = String(entry?.state || "").toLowerCase();
    const city = String(entry?.city || "").toLowerCase();
    if (entryState !== state || !city) return;
    rawSet.add(city);
  });

  const cleaned = new Set();
  for (const rawSlug of rawSet) {
    const canonical = pickCanonicalSlug(rawSlug, rawSet, state);
    if (!canonical) continue;
    cleaned.add(canonical);
  }

  return Array.from(cleaned).sort((a, b) => titleCaseFromSlug(a).localeCompare(titleCaseFromSlug(b)));
}

function buildCityListHtml(state, slugs) {
  return slugs
    .map((slug) => {
      const label = titleCaseFromSlug(slug);
      return `  <a class="cityhub__pill" href="/${escapeHtml(state)}/${escapeHtml(slug)}/">${escapeHtml(label)}</a>`;
    })
    .join("\n");
}

function injectCityList(html, listHtml) {
  const markerRegex = /(<div class="cityhub__grid" id="cityList">)[\s\S]*?(<\/div>)/i;
  if (!markerRegex.test(html)) return html;
  return html.replace(markerRegex, `$1\n${listHtml}\n        $2`);
}

function run() {
  for (const entry of STATES) {
    const state = entry.slug;
    const filePath = entry.file;

    if (!fs.existsSync(filePath)) {
      console.warn(`Skipped missing state hub: ${filePath}`);
      continue;
    }

    const slugs = getCitySlugsForState(state);
    if (slugs.length === 0) {
      console.warn(`Skipped ${state}: no cities found`);
      continue;
    }

    const html = fs.readFileSync(filePath, "utf-8");
    const updated = injectCityList(html, buildCityListHtml(state, slugs));
    fs.writeFileSync(filePath, updated, "utf-8");
    console.log(`Updated ${filePath} (${slugs.length} city links)`);
  }
}

run();
