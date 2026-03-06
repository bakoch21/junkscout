const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const EXECUTION_PATH = path.join(ROOT, "planning", "rollout_execution.csv");
const STATE_REGISTRY_PATH = path.join(ROOT, "planning", "state_registry.json");

const DEFAULT_RULES = {
  anchor: {
    manual_required: true,
    min_facilities: 8,
    min_official_sources: 3,
  },
  secondary: {
    manual_required: false,
    min_facilities: 5,
    min_official_sources: 2,
  },
  long_tail: {
    manual_required: false,
    min_facilities: 3,
    min_official_sources: 2,
  },
};

const GENERIC_SOURCE_HOSTS = new Set([
  "facebook.com",
  "google.com",
  "googleusercontent.com",
  "instagram.com",
  "maps.apple.com",
  "mapquest.com",
  "nextdoor.com",
  "openstreetmap.org",
  "tiktok.com",
  "tripadvisor.com",
  "x.com",
  "yellowpages.com",
  "yelp.com",
]);

const DAY_PATTERN = /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|weekdays|weekends|daily)\b/i;
const TIME_PATTERN = /\b\d{1,2}(?::\d{2})?\s?(am|pm)\b/i;
const PLACEHOLDER_PATTERN = /\b(check|confirm|see|visit|review|call)\b/i;
const PLACEHOLDER_ADDRESS_PATTERN = /\b(check|confirm|see|visit|multiple|varies|tbd|n\/a|unknown|city listing)\b/i;
const PLACEHOLDER_PHONE_PATTERN = /\b(check|confirm|see|visit|listing|official)\b/i;
const REQUIRED_TEXT_KEYS = ["name", "type", "address", "hours", "source"];

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function readJson(filePath) {
  return JSON.parse(readText(filePath));
}

function readJsonSafe(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return readJson(filePath);
  } catch {
    return fallback;
  }
}

function parseArgs(argv) {
  const args = {
    state: "",
    city: "",
    strictAll: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = String(argv[index] || "").trim();
    if (value === "--strict-all") {
      args.strictAll = true;
      continue;
    }
    if (value === "--state") {
      args.state = normalizeSlug(argv[index + 1] || "");
      index += 1;
      continue;
    }
    if (value === "--city") {
      args.city = normalizeSlug(argv[index + 1] || "");
      index += 1;
      continue;
    }
  }

  return args;
}

function parseCsv(text) {
  const rows = [];
  let currentRow = [];
  let currentField = "";
  let inQuotes = false;

  function pushField() {
    currentRow.push(currentField);
    currentField = "";
  }

  function pushRow() {
    if (currentRow.length === 1 && currentRow[0] === "") {
      currentRow = [];
      return;
    }
    rows.push(currentRow);
    currentRow = [];
  }

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        currentField += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === ",") {
      pushField();
      continue;
    }

    if (!inQuotes && char === "\n") {
      pushField();
      pushRow();
      continue;
    }

    if (!inQuotes && char === "\r") {
      continue;
    }

    currentField += char;
  }

  pushField();
  pushRow();

  if (rows.length === 0) return [];

  const header = rows[0].map((cell) => String(cell || "").trim());
  return rows.slice(1).map((cells) => {
    const row = {};
    for (let index = 0; index < header.length; index += 1) {
      row[header[index]] = String(cells[index] || "").trim();
    }
    return row;
  });
}

function normalizeSlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function normalizeBool(value) {
  return String(value || "").trim().toLowerCase() === "true";
}

function normalizeInt(value, fallback) {
  const parsed = Number.parseInt(String(value || "").trim(), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function titleCase(value) {
  return String(value || "")
    .split("-")
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function normalizeHostname(rawUrl) {
  try {
    const host = new URL(rawUrl).hostname.replace(/^www\./i, "").toLowerCase();
    return host;
  } catch {
    return "";
  }
}

function looksLikeOfficialSource(url) {
  const hostname = normalizeHostname(url);
  if (!hostname) return false;
  if (GENERIC_SOURCE_HOSTS.has(hostname)) return false;
  return true;
}

function looksLikePlaceholderAddress(value) {
  const text = String(value || "").trim();
  if (!text) return true;
  return PLACEHOLDER_ADDRESS_PATTERN.test(text);
}

function looksLikePlaceholderPhone(value) {
  const text = String(value || "").trim();
  if (!text) return true;
  if (PLACEHOLDER_PHONE_PATTERN.test(text)) return true;
  return !/\d/.test(text);
}

function looksLikePlaceholderHours(value) {
  const text = String(value || "").trim();
  if (!text) return true;
  const hasConcreteSchedule = DAY_PATTERN.test(text) || TIME_PATTERN.test(text) || /\b24\/7\b/i.test(text);
  if (hasConcreteSchedule) return false;
  return PLACEHOLDER_PATTERN.test(text);
}

function normalizeFacilityKey(facility) {
  const name = String(facility?.name || "").trim().toLowerCase();
  const address = String(facility?.address || "").trim().toLowerCase();
  return `${name}::${address}`;
}

function executionRows() {
  if (!fs.existsSync(EXECUTION_PATH)) {
    throw new Error(`Missing execution queue: ${EXECUTION_PATH}`);
  }
  return parseCsv(readText(EXECUTION_PATH));
}

function stateRegistry() {
  const data = readJsonSafe(STATE_REGISTRY_PATH, null);
  if (!data || !Array.isArray(data.states)) {
    throw new Error(`Invalid state registry: ${STATE_REGISTRY_PATH}`);
  }

  const map = new Map();
  for (const row of data.states) {
    const key = normalizeSlug(row.state_slug || row.state || "");
    if (!key) continue;
    map.set(key, row);
  }
  return map;
}

function manualCityPathCandidates(stateSlug, citySlug) {
  return [
    path.join(ROOT, "data", "manual", stateSlug, `${citySlug}.resolved.json`),
    path.join(ROOT, "data", "manual", stateSlug, `${citySlug}.geocoded.json`),
    path.join(ROOT, "data", "manual", stateSlug, `${citySlug}.json`),
  ];
}

function readManualCity(stateSlug, citySlug) {
  for (const filePath of manualCityPathCandidates(stateSlug, citySlug)) {
    const json = readJsonSafe(filePath, null);
    if (json && Array.isArray(json.facilities)) {
      return { filePath, data: json };
    }
  }
  return { filePath: "", data: null };
}

function readCityPayload(stateSlug, citySlug) {
  const filePath = path.join(ROOT, "data", stateSlug, `${citySlug}.json`);
  const data = readJsonSafe(filePath, null);
  if (!data) return { filePath, data: null, facilities: [] };

  const facilities = Array.isArray(data)
    ? data
    : (data && typeof data === "object" && Array.isArray(data.facilities) ? data.facilities : []);

  return { filePath, data, facilities };
}

function readCityList(stateSlug) {
  const filePath = path.join(ROOT, "scripts", `cities-${stateSlug}.json`);
  const list = readJsonSafe(filePath, []);
  if (!Array.isArray(list)) return { filePath, list: [] };
  return { filePath, list };
}

function readGeneratedPageExists(stateSlug, citySlug) {
  const filePath = path.join(ROOT, stateSlug, citySlug, "index.html");
  return {
    filePath,
    exists: fs.existsSync(filePath),
  };
}

function effectiveRules(row) {
  const tier = normalizeSlug(row.city_tier || "");
  const defaults = DEFAULT_RULES[tier] || DEFAULT_RULES.secondary;
  return {
    cityTier: tier || "secondary",
    manualRequired: normalizeBool(row.manual_required) || defaults.manual_required,
    minFacilities: normalizeInt(row.min_facilities, defaults.min_facilities),
    minOfficialSources: normalizeInt(row.min_official_sources, defaults.min_official_sources),
  };
}

function strictEnforcement(row, args) {
  if (args.strictAll) return true;
  return normalizeBool(row.ready_for_publish);
}

function facilitiesForRow(row, manualData, cityPayload) {
  if (manualData && Array.isArray(manualData.facilities) && manualData.facilities.length > 0) {
    return manualData.facilities;
  }
  return cityPayload.facilities;
}

function analyzeFacilities(facilities) {
  const result = {
    count: facilities.length,
    officialSourceDomains: new Set(),
    placeholderAddresses: [],
    placeholderHours: [],
    placeholderPhones: [],
    missingSources: [],
    duplicateFacilities: [],
    incompleteRecords: [],
  };

  const seenFacilities = new Set();

  facilities.forEach((facility, index) => {
    const label = `${index + 1}. ${String(facility?.name || "Unnamed facility").trim()}`;
    const source = String(facility?.source || facility?.osm_url || "").trim();
    const key = normalizeFacilityKey(facility);

    if (key !== "::") {
      if (seenFacilities.has(key)) result.duplicateFacilities.push(label);
      seenFacilities.add(key);
    }

    if (!source) {
      result.missingSources.push(label);
    } else if (looksLikeOfficialSource(source)) {
      result.officialSourceDomains.add(normalizeHostname(source));
    }

    if (looksLikePlaceholderAddress(facility?.address)) {
      result.placeholderAddresses.push(label);
    }

    if (looksLikePlaceholderHours(facility?.hours)) {
      result.placeholderHours.push(label);
    }

    if (looksLikePlaceholderPhone(facility?.phone)) {
      result.placeholderPhones.push(label);
    }

    const missingKeys = REQUIRED_TEXT_KEYS.filter((keyName) => {
      const value = String(facility?.[keyName] || "").trim();
      return !value;
    });
    if (missingKeys.length > 0) {
      result.incompleteRecords.push(`${label} missing ${missingKeys.join(", ")}`);
    }
  });

  return result;
}

function addIssue(target, severity, rowLabel, message) {
  target.push({ severity, rowLabel, message });
}

function validateRow(row, registry, args) {
  const issues = [];
  const citySlug = normalizeSlug(row.city_slug || row.city || "");
  const stateSlug = normalizeSlug(row.state_slug || row.state || "");
  const rowLabel = `${titleCase(stateSlug)} / ${titleCase(citySlug)}`;
  const strict = strictEnforcement(row, args);
  const rules = effectiveRules(row);
  const registryEntry = registry.get(stateSlug) || null;
  const manual = readManualCity(stateSlug, citySlug);
  const cityPayload = readCityPayload(stateSlug, citySlug);
  const facilities = facilitiesForRow(row, manual.data, cityPayload);
  const generatedPage = readGeneratedPageExists(stateSlug, citySlug);
  const cityList = readCityList(stateSlug);
  const cityInList = cityList.list.some((entry) => normalizeSlug(entry?.city || "") === citySlug);
  const facilityAnalysis = analyzeFacilities(facilities);
  const severity = strict ? "error" : "warn";

  if (!registryEntry) {
    addIssue(issues, severity, rowLabel, `State '${stateSlug}' is missing from planning/state_registry.json.`);
  } else {
    const registryEnabled = Boolean(registryEntry.state_enabled);
    const rowStateEnabled = normalizeBool(row.state_enabled);
    if (registryEnabled !== rowStateEnabled) {
      addIssue(
        issues,
        severity,
        rowLabel,
        `Row state_enabled=${rowStateEnabled} does not match registry state_enabled=${registryEnabled}.`
      );
    }
    if (strict && !registryEnabled) {
      addIssue(issues, "error", rowLabel, "State is not enabled in the rollout registry.");
    }
  }

  if (!citySlug || !stateSlug) {
    addIssue(issues, "error", rowLabel, "Missing state_slug or city_slug.");
    return issues;
  }

  if (!cityInList && strict) {
    addIssue(issues, "error", rowLabel, `City is missing from ${cityList.filePath}.`);
  }

  if (strict && !generatedPage.exists) {
    addIssue(issues, "error", rowLabel, `Generated page missing: ${generatedPage.filePath}`);
  }

  if (rules.manualRequired && !manual.data) {
    addIssue(issues, severity, rowLabel, "Manual city file is required but missing.");
  }

  if (normalizeSlug(row.city_tier) === "anchor" && normalizeSlug(row.content_tier) !== "manual") {
    addIssue(issues, severity, rowLabel, "Anchor city is not marked as manual content tier.");
  }

  if (facilities.length < rules.minFacilities) {
    addIssue(
      issues,
      severity,
      rowLabel,
      `Only ${facilities.length} facilities found; requires at least ${rules.minFacilities}.`
    );
  }

  if (facilityAnalysis.officialSourceDomains.size < rules.minOfficialSources) {
    addIssue(
      issues,
      severity,
      rowLabel,
      `Only ${facilityAnalysis.officialSourceDomains.size} official source domain(s); requires at least ${rules.minOfficialSources}.`
    );
  }

  if (facilityAnalysis.placeholderAddresses.length > 0) {
    addIssue(
      issues,
      severity,
      rowLabel,
      `Placeholder or missing addresses on ${facilityAnalysis.placeholderAddresses.length} facility record(s).`
    );
  }

  if (facilityAnalysis.placeholderHours.length > 0) {
    addIssue(
      issues,
      severity,
      rowLabel,
      `Placeholder or non-specific hours on ${facilityAnalysis.placeholderHours.length} facility record(s).`
    );
  }

  if (facilityAnalysis.duplicateFacilities.length > 0) {
    addIssue(
      issues,
      severity,
      rowLabel,
      `Duplicate facility entries detected (${facilityAnalysis.duplicateFacilities.length}).`
    );
  }

  if (facilityAnalysis.incompleteRecords.length > 0) {
    addIssue(
      issues,
      severity,
      rowLabel,
      `Incomplete facility records detected (${facilityAnalysis.incompleteRecords.length}).`
    );
  }

  if (facilityAnalysis.missingSources.length > 0) {
    addIssue(
      issues,
      severity,
      rowLabel,
      `Missing source URLs on ${facilityAnalysis.missingSources.length} facility record(s).`
    );
  }

  if (facilityAnalysis.placeholderPhones.length > 0) {
    addIssue(
      issues,
      "warn",
      rowLabel,
      `Placeholder or missing phone values on ${facilityAnalysis.placeholderPhones.length} facility record(s).`
    );
  }

  if (normalizeBool(row.ready_for_publish)) {
    if (normalizeSlug(row.qa_status) !== "approved") {
      addIssue(issues, "error", rowLabel, "ready_for_publish=true but qa_status is not approved.");
    }
    if (!normalizeBool(row.uniqueness_reviewed)) {
      addIssue(issues, "error", rowLabel, "ready_for_publish=true but uniqueness_reviewed is false.");
    }
    if (!String(row.approved_at || "").trim()) {
      addIssue(issues, "error", rowLabel, "ready_for_publish=true but approved_at is empty.");
    }
    if (!String(row.publish_after || "").trim()) {
      addIssue(issues, "error", rowLabel, "ready_for_publish=true but publish_after is empty.");
    }
  }

  if (normalizeSlug(row.source_status) === "live") {
    if (!String(row.published_at || "").trim()) {
      addIssue(issues, "error", rowLabel, "source_status=live but published_at is empty.");
    }
    if (!normalizeBool(row.uniqueness_reviewed)) {
      addIssue(issues, "error", rowLabel, "source_status=live but uniqueness_reviewed is false.");
    }
  }

  return issues;
}

function filterRows(rows, args) {
  return rows.filter((row) => {
    const stateSlug = normalizeSlug(row.state_slug || row.state || "");
    const citySlug = normalizeSlug(row.city_slug || row.city || "");
    if (args.state && stateSlug !== args.state) return false;
    if (args.city && citySlug !== args.city) return false;
    return true;
  });
}

function printUsage() {
  console.log("Usage: node scripts/rollout-quality-gate.js [--state <state-slug>] [--city <city-slug>] [--strict-all]");
}

function run() {
  const args = parseArgs(process.argv.slice(2));

  if (!fs.existsSync(EXECUTION_PATH) || !fs.existsSync(STATE_REGISTRY_PATH)) {
    printUsage();
    throw new Error("planning/rollout_execution.csv and planning/state_registry.json are required.");
  }

  const rows = filterRows(executionRows(), args);
  const registry = stateRegistry();

  if (rows.length === 0) {
    printUsage();
    throw new Error("No rollout rows matched the requested filters.");
  }

  const issues = [];
  rows.forEach((row) => {
    issues.push(...validateRow(row, registry, args));
  });

  const errors = issues.filter((issue) => issue.severity === "error");
  const warnings = issues.filter((issue) => issue.severity === "warn");

  console.log("Rollout quality gate summary:");
  console.log(`Rows checked: ${rows.length}`);
  console.log(`Errors: ${errors.length}`);
  console.log(`Warnings: ${warnings.length}`);

  issues.forEach((issue) => {
    console.log(`${issue.severity.toUpperCase()}: ${issue.rowLabel} -> ${issue.message}`);
  });

  if (errors.length > 0) {
    process.exit(1);
  }
}

run();
