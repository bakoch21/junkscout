const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");

const BASE_URL = "https://junkscout.io";
const REPORT_SLUG = "public-waste-access-report-2026";
const REPORT_DIR = path.join("research", REPORT_SLUG);
const REPORT_URL = `${BASE_URL}/research/${REPORT_SLUG}/`;
const JSON_DOWNLOAD_URL = `${REPORT_URL}${REPORT_SLUG}.json`;
const CSV_DOWNLOAD_URL = `${REPORT_URL}${REPORT_SLUG}.csv`;
const PDF_DOWNLOAD_URL = `${REPORT_URL}${REPORT_SLUG}.pdf`;

// Easy to edit without touching logic:
const DATE_PUBLISHED = "2026-02-25";
const DATE_MODIFIED = process.env.REPORT_DATE || new Date().toISOString().slice(0, 10);

const FACILITIES_DIR = path.join("data", "facilities");
const CITY_DATA_STATES = ["texas", "california"];

function safeReadJson(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeText(filePath, text) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text, "utf8");
}

function cleanString(value) {
  return String(value || "").trim();
}

function cleanSlug(value) {
  return cleanString(value)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function coerceArray(value) {
  return Array.isArray(value) ? value : [];
}

function toTextLower(parts) {
  return parts
    .map((x) => cleanString(x))
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function toMaterialText(record) {
  return toTextLower([
    ...coerceArray(record.accepted_materials),
    ...coerceArray(record.not_accepted),
  ]);
}

function hasHttpUrl(value) {
  const v = cleanString(value).toLowerCase();
  return /^https?:\/\//.test(v);
}

function isOfficialishUrl(value) {
  const v = cleanString(value).toLowerCase();
  if (!hasHttpUrl(v)) return false;
  if (v.includes("openstreetmap.org")) return false;
  if (v.includes("google.com/maps")) return false;
  if (v.includes("maps.google.")) return false;
  if (v.includes("apple.com/maps")) return false;
  return true;
}

function dedupeAppearsIn(items) {
  const out = [];
  const seen = new Set();
  for (const item of coerceArray(items)) {
    const state = cleanSlug(item && item.state);
    const city = cleanSlug(item && item.city);
    if (!state && !city) continue;
    const key = `${state}/${city}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ state, city });
  }
  return out;
}

function readCityRefsByFacilityId() {
  const map = new Map();

  for (const state of CITY_DATA_STATES) {
    const stateDir = path.join("data", state);
    if (!fs.existsSync(stateDir)) continue;

    const files = fs
      .readdirSync(stateDir)
      .filter((f) => f.toLowerCase().endsWith(".json"))
      .filter((f) => !f.startsWith("_"))
      .filter((f) => f.toLowerCase() !== "cities.json");

    for (const file of files) {
      const city = cleanSlug(file.replace(/\.json$/i, ""));
      const fullPath = path.join(stateDir, file);
      const parsed = safeReadJson(fullPath, null);
      const rows = Array.isArray(parsed)
        ? parsed
        : (parsed && typeof parsed === "object" && Array.isArray(parsed.facilities) ? parsed.facilities : []);

      for (const row of rows) {
        const id = cleanString(row && (row.facility_id || row.id));
        if (!id) continue;

        if (!map.has(id)) map.set(id, []);
        map.get(id).push({ state, city });
      }
    }
  }

  for (const [id, refs] of map.entries()) {
    map.set(id, dedupeAppearsIn(refs));
  }

  return map;
}

function readCanonicalCitySet(state) {
  const listPath = path.join("scripts", `cities-${state}.json`);
  const rows = safeReadJson(listPath, []);
  if (!Array.isArray(rows)) return new Set();

  return new Set(
    rows
      .map((row) => cleanSlug(row && row.city))
      .filter(Boolean)
  );
}

function readFacilityRecords(cityRefsMap) {
  if (!fs.existsSync(FACILITIES_DIR)) return [];

  const files = fs
    .readdirSync(FACILITIES_DIR)
    .filter((f) => f.toLowerCase().endsWith(".json"))
    .filter((f) => f.toLowerCase() !== "index.json");

  const out = [];

  for (const file of files) {
    const fullPath = path.join(FACILITIES_DIR, file);
    const parsed = safeReadJson(fullPath, null);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) continue;

    const id = cleanString(parsed.id || file.replace(/\.json$/i, ""));
    if (!id) continue;

    const mergedAppears = dedupeAppearsIn([
      ...coerceArray(parsed.appears_in),
      ...(cityRefsMap.get(id) || []),
    ]);

    const addressLower = cleanString(parsed.address).toLowerCase();
    if (mergedAppears.length === 0 && /\btx\b/.test(addressLower)) {
      mergedAppears.push({ state: "texas", city: "" });
    }
    if (mergedAppears.length === 0 && /\bca\b/.test(addressLower)) {
      mergedAppears.push({ state: "california", city: "" });
    }

    out.push({
      ...parsed,
      id,
      appears_in: mergedAppears,
    });
  }

  return out;
}

function hasState(record, state) {
  return coerceArray(record.appears_in).some((x) => cleanSlug(x && x.state) === state);
}

function hasCity(record, state, city) {
  return coerceArray(record.appears_in).some(
    (x) => cleanSlug(x && x.state) === state && cleanSlug(x && x.city) === city
  );
}

function isInCanonicalStateScope(record, state, allowedCitySet) {
  return coerceArray(record.appears_in).some((x) => {
    const rowState = cleanSlug(x && x.state);
    const rowCity = cleanSlug(x && x.city);
    if (rowState !== state) return false;
    if (!allowedCitySet || !(allowedCitySet instanceof Set)) return true;
    return allowedCitySet.has(rowCity);
  });
}

function pct(count, total) {
  if (!total) return 0;
  return Math.round((count / total) * 100);
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(Number(value || 0));
}

function computeStats(records, stateForCityCount = "", cityForCityCount = "", allowedCitySet = null) {
  const totalFacilities = records.length;
  const citySet = new Set();

  for (const record of records) {
    for (const loc of coerceArray(record.appears_in)) {
      const state = cleanSlug(loc && loc.state);
      const city = cleanSlug(loc && loc.city);
      if (!city) continue;
      if (stateForCityCount && state !== stateForCityCount) continue;
      if (cityForCityCount && city !== cityForCityCount) continue;
      if (allowedCitySet && allowedCitySet instanceof Set && !allowedCitySet.has(city)) continue;
      citySet.add(city);
    }
  }

  const withPhone = records.filter((r) => cleanString(r.phone)).length;
  const withHours = records.filter((r) => cleanString(r.hours)).length;
  const withFees = records.filter((r) => cleanString(r.fees)).length;

  const withOfficialSourceLink = records.filter((r) => {
    const candidates = [r.source, r.website];
    return candidates.some((url) => isOfficialishUrl(url));
  }).length;

  const withAnyUrl = records.filter((r) => {
    const candidates = [r.source, r.website, r.osm_url];
    return candidates.some((url) => hasHttpUrl(url));
  }).length;

  const residencyPatterns = [
    /\bresident(s|ial|cy)?\b/i,
    /proof of residenc/i,
    /proof.*address/i,
    /id required/i,
    /proof required/i,
    /tx id/i,
    /utility bill/i,
  ];

  const visitLimitPatterns = [
    /\bvisit(s)?\b/i,
    /\bvisit limit\b/i,
    /\bper month\b/i,
    /\/month\b/i,
    /\bx\s*\/\s*month\b/i,
    /\bmonthly\b/i,
  ];

  const mentionsResidencyRequirement = records.filter((r) => {
    const text = toTextLower([r.fees, r.rules, r.notes]);
    return residencyPatterns.some((rx) => rx.test(text));
  }).length;

  const mentionsVisitLimits = records.filter((r) => {
    const text = toTextLower([r.fees, r.hours, r.rules, r.notes]);
    return visitLimitPatterns.some((rx) => rx.test(text));
  }).length;

  const acceptsTires = records.filter((r) => {
    const text = toTextLower(coerceArray(r.accepted_materials));
    return /\btire(s)?\b/i.test(text);
  }).length;

  const mentionsCandD = records.filter((r) => {
    const text = toMaterialText(r);
    return /(c\s*&\s*d|construction|demolition|debris|c and d)/i.test(text);
  }).length;

  const mentionsHazardousPolicy = records.filter((r) => {
    const text = toMaterialText(r);
    return /(hazard|hhw|paint|chemical|battery|batteries|solvent|fuel|asbestos|pesticide)/i.test(text);
  }).length;

  return {
    total_facilities: totalFacilities,
    total_cities: citySet.size,
    pct_with_phone: pct(withPhone, totalFacilities),
    pct_with_hours: pct(withHours, totalFacilities),
    pct_with_fees: pct(withFees, totalFacilities),
    pct_with_official_source_link: pct(withOfficialSourceLink, totalFacilities),
    pct_with_any_url: pct(withAnyUrl, totalFacilities),
    pct_mentions_residency_requirement: pct(mentionsResidencyRequirement, totalFacilities),
    pct_mentions_visit_limits: pct(mentionsVisitLimits, totalFacilities),
    pct_accepts_tires: pct(acceptsTires, totalFacilities),
    pct_mentions_CandD: pct(mentionsCandD, totalFacilities),
    pct_mentions_hazardous_policy: pct(mentionsHazardousPolicy, totalFacilities),
  };
}

function extractVisitLimitsPerMonth(records) {
  const values = [];
  const patterns = [
    /up to\s+(\d+)\s+visits?\s*(?:\/|per)?\s*(?:month|mo)\b/gi,
    /(\d+)\s+visits?\s*(?:\/|per)\s*(?:month|mo)\b/gi,
    /(\d+)\s*x\s*\/\s*(?:month|mo)\b/gi,
    /(\d+)\s*(?:times?)\s*(?:\/|per)\s*(?:month|mo)\b/gi,
  ];

  for (const record of records) {
    const text = toTextLower([record.fees, record.rules, record.hours, record.notes]);
    if (!text) continue;

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const value = Number(match[1]);
        if (Number.isFinite(value) && value > 0) values.push(value);
      }
    }
  }

  return values;
}

function modeOrMedian(values) {
  if (!values.length) return null;

  const counts = new Map();
  for (const value of values) {
    counts.set(value, (counts.get(value) || 0) + 1);
  }

  let bestValue = null;
  let bestCount = 0;
  for (const [value, count] of counts.entries()) {
    if (count > bestCount) {
      bestValue = value;
      bestCount = count;
    } else if (count === bestCount && bestValue !== null && value < bestValue) {
      bestValue = value;
    }
  }

  if (bestCount > 1) return bestValue;

  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  }
  return sorted[mid];
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

function prettyPct(value) {
  return `${Number(value || 0)}%`;
}

function buildCsv(metricsTexas, metricsHouston, houstonVisitSummary) {
  const rows = [
    ["metric", "texas", "houston"],
    ["total_facilities", metricsTexas.total_facilities, metricsHouston.total_facilities],
    ["total_cities", metricsTexas.total_cities, metricsHouston.total_cities],
    ["pct_with_phone", metricsTexas.pct_with_phone, metricsHouston.pct_with_phone],
    ["pct_with_hours", metricsTexas.pct_with_hours, metricsHouston.pct_with_hours],
    ["pct_with_fees", metricsTexas.pct_with_fees, metricsHouston.pct_with_fees],
    [
      "pct_with_official_source_link",
      metricsTexas.pct_with_official_source_link,
      metricsHouston.pct_with_official_source_link,
    ],
    ["pct_with_any_url", metricsTexas.pct_with_any_url, metricsHouston.pct_with_any_url],
    [
      "pct_mentions_residency_requirement",
      metricsTexas.pct_mentions_residency_requirement,
      metricsHouston.pct_mentions_residency_requirement,
    ],
    [
      "pct_mentions_visit_limits",
      metricsTexas.pct_mentions_visit_limits,
      metricsHouston.pct_mentions_visit_limits,
    ],
    ["pct_accepts_tires", metricsTexas.pct_accepts_tires, metricsHouston.pct_accepts_tires],
    ["pct_mentions_CandD", metricsTexas.pct_mentions_CandD, metricsHouston.pct_mentions_CandD],
    [
      "pct_mentions_hazardous_policy",
      metricsTexas.pct_mentions_hazardous_policy,
      metricsHouston.pct_mentions_hazardous_policy,
    ],
    ["houston_visit_limit_sample_count", "", houstonVisitSummary.sample_count],
    ["houston_visit_limit_min_per_month", "", houstonVisitSummary.min_per_month ?? ""],
    ["houston_visit_limit_max_per_month", "", houstonVisitSummary.max_per_month ?? ""],
    ["houston_visit_limit_typical_per_month", "", houstonVisitSummary.typical_per_month ?? ""],
  ];

  return rows.map((row) => row.join(",")).join("\n");
}

function buildPdf(payload, outputPath) {
  return new Promise((resolve, reject) => {
    try {
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });

      const doc = new PDFDocument({
        size: "LETTER",
        margin: 50,
        info: {
          Title: "Public Waste Access Report 2026",
          Author: "JunkScout",
          Subject: "Public waste access rules in Texas",
        },
      });

      const stream = fs.createWriteStream(outputPath);
      doc.pipe(stream);

      const tx = payload.metrics_texas;
      const hou = payload.metrics_houston;
      const visit = payload.houston_visit_limit_summary;

      const keyFindings = [
        `${formatNumber(tx.total_facilities)} facilities across ${formatNumber(tx.total_cities)} Texas cities.`,
        `${prettyPct(tx.pct_with_phone)} list a phone number.`,
        `${prettyPct(tx.pct_with_hours)} list hours.`,
        `${prettyPct(tx.pct_with_fees)} include fee details.`,
        `${prettyPct(tx.pct_with_official_source_link)} include official source links.`,
        `${prettyPct(tx.pct_mentions_residency_requirement)} mention residency requirements.`,
        `${prettyPct(tx.pct_mentions_visit_limits)} mention visit limits.`,
      ];

      doc.font("Helvetica-Bold").fontSize(22).fillColor("#0f172a").text("Public Waste Access Report 2026");
      doc.moveDown(0.3);
      doc
        .font("Helvetica")
        .fontSize(11)
        .fillColor("#475569")
        .text(
          "A structured snapshot of public waste facility access rules (fees, residency, limits, accepted materials) based on official sources."
        );
      doc.moveDown(0.2);
      doc
        .font("Helvetica")
        .fontSize(10)
        .fillColor("#64748b")
        .text(`Last updated: ${payload.last_updated}`);
      doc.moveDown(1);

      doc.font("Helvetica-Bold").fontSize(14).fillColor("#0f172a").text("Key Findings");
      doc.moveDown(0.4);
      doc.font("Helvetica").fontSize(11).fillColor("#111827");
      for (const line of keyFindings) {
        doc.text(`- ${line}`);
      }
      doc.moveDown(0.9);

      doc.font("Helvetica-Bold").fontSize(14).fillColor("#0f172a").text("Texas vs Houston Snapshot");
      doc.moveDown(0.4);
      doc.font("Helvetica").fontSize(11).fillColor("#111827");
      doc.text(`Texas facilities: ${formatNumber(tx.total_facilities)}`);
      doc.text(`Houston facilities: ${formatNumber(hou.total_facilities)}`);
      doc.text(`Houston fee coverage: ${prettyPct(hou.pct_with_fees)}`);
      doc.text(`Houston residency mentions: ${prettyPct(hou.pct_mentions_residency_requirement)}`);
      doc.text(`Houston visit-limit mentions: ${prettyPct(hou.pct_mentions_visit_limits)}`);
      doc.text(
        `Houston parsed monthly visit limits: min ${visit.min_per_month === null ? "N/A" : visit.min_per_month}, max ${visit.max_per_month === null ? "N/A" : visit.max_per_month}, typical ${visit.typical_per_month === null ? "N/A" : visit.typical_per_month} (${visit.sample_count} parseable mentions).`
      );
      doc.moveDown(0.9);

      doc.font("Helvetica-Bold").fontSize(14).fillColor("#0f172a").text("Explore");
      doc.moveDown(0.3);
      doc.font("Helvetica").fontSize(11).fillColor("#1d4ed8");
      doc.text("Houston hub: https://junkscout.io/texas/houston/", {
        link: "https://junkscout.io/texas/houston/",
      });
      doc.text("Texas page: https://junkscout.io/texas/", {
        link: "https://junkscout.io/texas/",
      });
      doc.text("Full report page: https://junkscout.io/research/public-waste-access-report-2026/", {
        link: "https://junkscout.io/research/public-waste-access-report-2026/",
      });

      doc.end();

      stream.on("finish", resolve);
      stream.on("error", reject);
    } catch (err) {
      reject(err);
    }
  });
}

function buildReportHtml(payload) {
  const {
    metrics_texas: tx,
    metrics_houston: hou,
    houston_visit_limit_summary: visitSummary,
    last_updated: lastUpdated,
  } = payload;

  const dataQualityLine =
    tx.pct_with_official_source_link > 0
      ? `${prettyPct(tx.pct_with_official_source_link)} of Texas facilities include an official source or website link.`
      : `${prettyPct(tx.pct_with_any_url)} of Texas facilities include at least one URL reference.`;

  const faqItems = [
    {
      q: "Do all public waste facilities list fees online?",
      a: `No. In the current Texas dataset, ${prettyPct(tx.pct_with_fees)} include fee details. Always confirm before driving.`,
    },
    {
      q: "How often do listings mention residency requirements?",
      a: `In this snapshot, ${prettyPct(tx.pct_mentions_residency_requirement)} of Texas facilities mention residency or proof requirements.`,
    },
    {
      q: "What should I bring to a drop-off facility?",
      a: "Bring photo ID, proof of address if required, and sorted materials when possible. Rules vary by operator and city.",
    },
    {
      q: "What is a Neighborhood Depository?",
      a: "A local public drop-off site for household trash, bulk waste, and select recyclables, typically with resident-only rules.",
    },
    {
      q: "What is a transfer station?",
      a: "A transfer station is an intermediate facility where waste is consolidated before transport to landfill or processing.",
    },
    {
      q: "What is a landfill?",
      a: "A landfill is a permitted final disposal site for municipal solid waste and other approved materials.",
    },
    {
      q: "What does C&D waste mean?",
      a: "C&D means construction and demolition waste, including debris like wood, drywall, roofing, and concrete.",
    },
    {
      q: "What is household hazardous waste (HHW)?",
      a: "HHW includes products like paint, chemicals, batteries, and solvents that need special handling.",
    },
  ];

  const reportLd = {
    "@context": "https://schema.org",
    "@type": "Report",
    "@id": `${REPORT_URL}#report`,
    name: "Public Waste Access Report 2026",
    about: "Public waste disposal access rules in Texas",
    url: REPORT_URL,
    datePublished: DATE_PUBLISHED,
    dateModified: lastUpdated,
    author: {
      "@type": "Organization",
      name: "JunkScout",
      url: `${BASE_URL}/`,
    },
    publisher: {
      "@type": "Organization",
      name: "JunkScout",
      url: `${BASE_URL}/`,
    },
  };

  const datasetLd = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    "@id": `${REPORT_URL}#dataset`,
    name: "JunkScout Texas Public Waste Access Dataset (2026)",
    description:
      "Normalized fields for public waste facilities: fees, hours, residency signals, accepted materials, and source links.",
    creator: {
      "@type": "Organization",
      name: "JunkScout",
      url: `${BASE_URL}/`,
    },
    temporalCoverage: "2026",
    spatialCoverage: {
      "@type": "Place",
      name: "Texas",
    },
    url: REPORT_URL,
    distribution: [
      {
        "@type": "DataDownload",
        name: "Public Waste Access Report 2026 (PDF)",
        encodingFormat: "application/pdf",
        contentUrl: PDF_DOWNLOAD_URL,
      },
      {
        "@type": "DataDownload",
        name: "Public Waste Access Report 2026 (JSON)",
        encodingFormat: "application/json",
        contentUrl: JSON_DOWNLOAD_URL,
      },
      {
        "@type": "DataDownload",
        name: "Public Waste Access Report 2026 (CSV)",
        encodingFormat: "text/csv",
        contentUrl: CSV_DOWNLOAD_URL,
      },
    ],
  };

  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqItems.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.a,
      },
    })),
  };

  const orgLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${BASE_URL}/#org`,
    name: "JunkScout",
    url: `${BASE_URL}/`,
  };

  const metricRows = [
    ["total_facilities", tx.total_facilities, hou.total_facilities],
    ["total_cities", tx.total_cities, hou.total_cities],
    ["pct_with_phone", `${tx.pct_with_phone}%`, `${hou.pct_with_phone}%`],
    ["pct_with_hours", `${tx.pct_with_hours}%`, `${hou.pct_with_hours}%`],
    ["pct_with_fees", `${tx.pct_with_fees}%`, `${hou.pct_with_fees}%`],
    [
      "pct_with_official_source_link",
      `${tx.pct_with_official_source_link}%`,
      `${hou.pct_with_official_source_link}%`,
    ],
    ["pct_with_any_url", `${tx.pct_with_any_url}%`, `${hou.pct_with_any_url}%`],
    [
      "pct_mentions_residency_requirement",
      `${tx.pct_mentions_residency_requirement}%`,
      `${hou.pct_mentions_residency_requirement}%`,
    ],
    [
      "pct_mentions_visit_limits",
      `${tx.pct_mentions_visit_limits}%`,
      `${hou.pct_mentions_visit_limits}%`,
    ],
    ["pct_accepts_tires", `${tx.pct_accepts_tires}%`, `${hou.pct_accepts_tires}%`],
    ["pct_mentions_CandD", `${tx.pct_mentions_CandD}%`, `${hou.pct_mentions_CandD}%`],
    [
      "pct_mentions_hazardous_policy",
      `${tx.pct_mentions_hazardous_policy}%`,
      `${hou.pct_mentions_hazardous_policy}%`,
    ],
  ];

  const metricRowsHtml = metricRows
    .map(
      (row) => `
            <tr>
              <td><code>${escapeHtml(row[0])}</code></td>
              <td>${escapeHtml(String(row[1]))}</td>
              <td>${escapeHtml(String(row[2]))}</td>
            </tr>`
    )
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Public Waste Access Report 2026 | JunkScout</title>
  <meta name="description" content="Data-driven snapshot of public waste facility access rules in Texas: fees, residency requirements, visit limits, accepted materials, and source coverage." />
  <meta name="robots" content="index,follow" />
  <link rel="canonical" href="${REPORT_URL}" />
  <link rel="stylesheet" href="/styles.css" />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg?v=20260223a" />
  <link rel="icon" type="image/png" sizes="48x48" href="/favicon-48.png?v=20260223a" />
  <link rel="shortcut icon" href="/favicon.ico?v=20260223a" />

  <script type="application/ld+json">
${JSON.stringify(reportLd, null, 2)}
  </script>
  <script type="application/ld+json">
${JSON.stringify(datasetLd, null, 2)}
  </script>
  <script type="application/ld+json">
${JSON.stringify(faqLd, null, 2)}
  </script>
  <script type="application/ld+json">
${JSON.stringify(orgLd, null, 2)}
  </script>
</head>
<body>
  <header class="nav">
    <div class="nav__inner">
      <a class="brand" href="/">
        <img src="/logo.svg?v=20260223a" alt="JunkScout" class="brand__logo" />
      </a>
      <nav class="nav__links" aria-label="Primary">
        <a href="/#browse-locations">Browse locations</a>
        <a href="/about/" class="muted">About</a>
      </nav>
      <div class="nav__actions">
        <a class="btn btn--ghost" href="/texas/">Texas</a>
        <a class="btn btn--primary" href="/california/">California</a>
      </div>
    </div>
  </header>

  <main class="hero">
    <div class="container">
      <h1>Public Waste Access Report 2026</h1>
      <p class="subhead">A structured snapshot of public waste facility access rules (fees, residency, limits, accepted materials) based on official sources.</p>
      <p class="muted small">Last updated: <strong>${escapeHtml(lastUpdated)}</strong></p>
      <p class="muted small">Data-driven, sourced from official pages when available.</p>

      <section class="report__box research-downloads" aria-label="Download report files">
        <h2>Download Report</h2>
        <p class="muted">Download the full report metrics and machine-readable data.</p>
        <div class="report__actions">
          <a class="btn btn--ghost" href="/research/${REPORT_SLUG}/${REPORT_SLUG}.pdf" download>Download PDF</a>
          <a class="btn btn--ghost" href="/research/${REPORT_SLUG}/${REPORT_SLUG}.json" download>Download JSON</a>
          <a class="btn btn--ghost" href="/research/${REPORT_SLUG}/${REPORT_SLUG}.csv" download>Download CSV</a>
        </div>
      </section>

      <section class="seo-copy" style="margin-top:24px">
        <h2>Key Findings</h2>
        <ul class="research-list">
          <li><strong>${formatNumber(tx.total_facilities)}</strong> facilities across <strong>${formatNumber(tx.total_cities)}</strong> Texas cities in current coverage.</li>
          <li><strong>${prettyPct(tx.pct_with_phone)}</strong> list a phone number.</li>
          <li><strong>${prettyPct(tx.pct_with_hours)}</strong> list hours.</li>
          <li><strong>${prettyPct(tx.pct_with_fees)}</strong> include fee details.</li>
          <li>${escapeHtml(dataQualityLine)}</li>
          <li><strong>${prettyPct(tx.pct_mentions_residency_requirement)}</strong> mention residency/proof requirements.</li>
          <li><strong>${prettyPct(tx.pct_mentions_visit_limits)}</strong> mention visit limits or monthly caps.</li>
          <li><strong>${prettyPct(tx.pct_accepts_tires)}</strong> explicitly mention tire acceptance.</li>
          <li><strong>${prettyPct(tx.pct_mentions_CandD)}</strong> mention construction/demolition/debris policy.</li>
          <li><strong>${prettyPct(tx.pct_mentions_hazardous_policy)}</strong> mention hazardous materials policy.</li>
        </ul>
        <h3>Metric snapshot (Texas vs Houston)</h3>
        <div class="research-table-wrap" role="region" aria-label="Computed metrics table">
          <table class="research-table">
            <thead>
              <tr>
                <th>Metric</th>
                <th>Texas</th>
                <th>Houston</th>
              </tr>
            </thead>
            <tbody>${metricRowsHtml}
            </tbody>
          </table>
        </div>

        <h2>Texas Focus + Houston Case Study</h2>
        <p>
          Texas has broad city-level coverage, but rule depth is uneven and concentrated in heavily verified metro pages.
          Houston currently has the deepest structured policy fields, making it a strong case study for decision-ready guidance.
        </p>
        <ul class="research-list">
          <li><strong>${formatNumber(hou.total_facilities)}</strong> Houston facilities represented in this dataset snapshot.</li>
          <li><strong>${prettyPct(hou.pct_with_phone)}</strong> include phone, <strong>${prettyPct(hou.pct_with_hours)}</strong> include hours, and <strong>${prettyPct(hou.pct_with_fees)}</strong> include fee details.</li>
          <li><strong>${prettyPct(hou.pct_mentions_residency_requirement)}</strong> mention residency/proof requirements and <strong>${prettyPct(hou.pct_mentions_visit_limits)}</strong> mention visit limits.</li>
          <li><strong>${prettyPct(hou.pct_accepts_tires)}</strong> mention tire handling and <strong>${prettyPct(hou.pct_mentions_hazardous_policy)}</strong> mention hazardous material policy.</li>
          <li>
            Parsed Houston monthly visit limits:
            <strong>min ${visitSummary.min_per_month === null ? "N/A" : visitSummary.min_per_month}</strong>,
            <strong>max ${visitSummary.max_per_month === null ? "N/A" : visitSummary.max_per_month}</strong>,
            <strong>typical ${visitSummary.typical_per_month === null ? "N/A" : visitSummary.typical_per_month}</strong>
            (${visitSummary.sample_count} parseable mentions).
          </li>
        </ul>

        <h2>Definitions</h2>
        <ul class="research-list">
          <li><strong>Neighborhood Depository:</strong> A local public drop-off location for household trash, bulk waste, and selected recyclables, often with resident-only requirements.</li>
          <li><strong>Transfer station:</strong> An intermediate facility where waste is consolidated before transport to landfill or processing.</li>
          <li><strong>Landfill:</strong> A permitted final disposal site for municipal solid waste and other approved material streams.</li>
          <li><strong>C&amp;D waste:</strong> Construction and demolition waste, such as wood, drywall, roofing, concrete, and mixed debris.</li>
          <li><strong>Bulk waste:</strong> Oversized household items that do not fit standard curbside service, such as furniture and large fixtures.</li>
          <li><strong>Household hazardous waste (HHW):</strong> Home-use products like paint, chemicals, batteries, and solvents requiring special handling.</li>
        </ul>

        <h2>Methodology</h2>
        <p>
          This report aggregates structured facility records from JunkScout's Texas coverage using normalized fields
          from city-level datasets, manual verification overlays, and facility-level records. Source URLs are preserved
          where available, and metrics are computed on the current static build snapshot.
        </p>
        <p>
          Update cadence is build-driven: whenever facility data is regenerated, this report can be rebuilt with the same script.
        </p>

        <h2>Notes &amp; Limitations</h2>
        <ul class="research-list">
          <li>Facility rules can change without notice; always verify before driving.</li>
          <li>Some records are location-complete but policy-light (missing fees/hours/rules fields).</li>
          <li>Keyword heuristics are used for residency, visit limits, C&amp;D, and hazardous policy signals.</li>
          <li>Percentages are rounded to whole numbers for stability.</li>
        </ul>

        <h2>Explore</h2>
        <div class="report__actions">
          <a class="btn btn--ghost" href="/texas/houston/">Houston hub</a>
          <a class="btn btn--ghost" href="/texas/">Texas page</a>
          <a class="btn btn--ghost" href="/#browse-locations">Homepage search</a>
        </div>
      </section>
    </div>
  </main>

  <script src="/analytics.js" defer></script>
</body>
</html>
`;
}

async function run() {
  const cityRefsMap = readCityRefsByFacilityId();
  const facilities = readFacilityRecords(cityRefsMap);
  const texasCanonicalCities = readCanonicalCitySet("texas");

  const texasFacilities = facilities.filter((record) =>
    isInCanonicalStateScope(record, "texas", texasCanonicalCities)
  );
  const houstonFacilities = texasFacilities.filter((record) =>
    hasCity(record, "texas", "houston")
  );

  const metricsTexas = computeStats(texasFacilities, "texas", "", texasCanonicalCities);
  const metricsHouston = computeStats(
    houstonFacilities,
    "texas",
    "houston",
    new Set(["houston"])
  );

  const houstonVisitValues = extractVisitLimitsPerMonth(houstonFacilities);
  const houstonVisitSummary = {
    sample_count: houstonVisitValues.length,
    min_per_month: houstonVisitValues.length ? Math.min(...houstonVisitValues) : null,
    max_per_month: houstonVisitValues.length ? Math.max(...houstonVisitValues) : null,
    typical_per_month: modeOrMedian(houstonVisitValues),
  };

  const payload = {
    report: "Public Waste Access Report 2026",
    scope: "Texas",
    last_updated: DATE_MODIFIED,
    date_published: DATE_PUBLISHED,
    source_facility_records: facilities.length,
    metrics_texas: metricsTexas,
    metrics_houston: metricsHouston,
    houston_visit_limit_summary: houstonVisitSummary,
  };

  const csv = buildCsv(metricsTexas, metricsHouston, houstonVisitSummary);
  const html = buildReportHtml(payload);

  writeText(
    path.join(REPORT_DIR, `${REPORT_SLUG}.json`),
    `${JSON.stringify(payload, null, 2)}\n`
  );
  writeText(path.join(REPORT_DIR, `${REPORT_SLUG}.csv`), `${csv}\n`);
  writeText(path.join(REPORT_DIR, "index.html"), html);
  await buildPdf(payload, path.join(REPORT_DIR, `${REPORT_SLUG}.pdf`));

  console.log(`Built research report page: ${path.join(REPORT_DIR, "index.html")}`);
  console.log(`Built PDF download: ${path.join(REPORT_DIR, `${REPORT_SLUG}.pdf`)}`);
  console.log(`Built JSON download: ${path.join(REPORT_DIR, `${REPORT_SLUG}.json`)}`);
  console.log(`Built CSV download: ${path.join(REPORT_DIR, `${REPORT_SLUG}.csv`)}`);
  console.log(
    `Texas facilities: ${metricsTexas.total_facilities}, Texas cities: ${metricsTexas.total_cities}, Houston facilities: ${metricsHouston.total_facilities}`
  );
}

run().catch((err) => {
  console.error("Failed to build research report:", err);
  process.exit(1);
});
