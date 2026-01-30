// city.js
// Renders city results from a static JSON file into #results
// Supports BOTH routing styles:
//   Hash route:   /city-template.html#texas/dallas  -> /data/texas/dallas.json
//   Path route:   /texas/dallas/                   -> /data/texas/dallas.json
//
// Curated overlay (Option A):
// If the generated city page includes:
//   <script id="CURATED:JSON" type="application/json">{"city":"...","state":"..",...}</script>
// then we render a curated "City guide" section ABOVE the normal results.
//
// Behavior:
// - If curated overlay exists, default to REPLACE mode (hide normal results list).
// - Auto-link curated cards to facility pages when we can match address/name to city JSON.

function ensureRobotsMeta(content = "index,follow") {
  const existing = document.querySelector('meta[name="robots"]');
  if (existing) return;

  const meta = document.createElement("meta");
  meta.setAttribute("name", "robots");
  meta.setAttribute("content", content);
  document.head.appendChild(meta);
}

function titleCaseFromSlug(slug = "") {
  return slug
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// Turns "texas" -> "Texas", "new-york" -> "New York"
function titleCaseWordsFromSlug(slug = "") {
  return (slug || "")
    .split("-")
    .filter(Boolean)
    .map((w) => w.toLowerCase())
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function getRouteParts() {
  const hash = (window.location.hash || "").replace(/^#\/?/, "").trim();
  if (hash) {
    const [state, city] = hash.split("/").filter(Boolean);
    return { state: state || "", city: city || "" };
  }

  const parts = window.location.pathname.split("/").filter(Boolean);
  const state = parts[0] || "";
  const city = parts[1] || "";
  return { state, city };
}

function setMetaDescription(desc) {
  let meta = document.querySelector('meta[name="description"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute("name", "description");
    document.head.appendChild(meta);
  }
  meta.setAttribute("content", desc);
}

function setCanonical(url) {
  let link = document.querySelector('link[rel="canonical"]');
  if (!link) {
    link = document.createElement("link");
    link.setAttribute("rel", "canonical");
    document.head.appendChild(link);
  }
  link.setAttribute("href", url);
}

function applyCitySEO({ cityName, stateName }) {
  const pretty = `${cityName}, ${stateName}`;

  const titleEl = document.getElementById("cityTitle");
  if (titleEl) titleEl.textContent = `Where to dump trash in ${pretty}`;

  const ansEl = document.getElementById("cityAnswer");
  if (ansEl) {
    ansEl.textContent = `Find public landfills, transfer stations, and recycling drop-offs in ${pretty}, with hours, rules, and accepted materials when available.`;
  }

  const subEl = document.getElementById("citySubhead");
  if (subEl) {
    subEl.textContent = `Public landfills, transfer stations, and disposal sites in ${cityName}. Always confirm fees, residency rules, and accepted materials before visiting.`;
  }

  const inlineCity = document.getElementById("cityNameInline");
  if (inlineCity) inlineCity.textContent = cityName;

  document.title = `Where to Dump Trash in ${pretty} | JunkScout`;
  setMetaDescription(
    `Find public landfills, transfer stations, and recycling drop-offs in ${pretty}. Hours, fees, and accepted materials when available—always confirm before visiting.`
  );

  setCanonical(window.location.href.split("#")[0]);
}

/** =========================
 * Curated overlay (Option A)
 * ========================= */

function readCuratedOverlayFromDom() {
  const el = document.getElementById("CURATED:JSON");
  if (!el) return null;

  try {
    const raw = (el.textContent || "").trim();
    if (!raw) return null;
    const json = JSON.parse(raw);
    if (!json || typeof json !== "object") return null;
    return json;
  } catch {
    return null;
  }
}

function normalizeStateAbbrev(stateSlugOrCode = "") {
  const s = String(stateSlugOrCode || "").trim().toLowerCase();
  const map = {
    alabama: "AL",
    alaska: "AK",
    arizona: "AZ",
    arkansas: "AR",
    california: "CA",
    colorado: "CO",
    connecticut: "CT",
    delaware: "DE",
    florida: "FL",
    georgia: "GA",
    hawaii: "HI",
    idaho: "ID",
    illinois: "IL",
    indiana: "IN",
    iowa: "IA",
    kansas: "KS",
    kentucky: "KY",
    louisiana: "LA",
    maine: "ME",
    maryland: "MD",
    massachusetts: "MA",
    michigan: "MI",
    minnesota: "MN",
    mississippi: "MS",
    missouri: "MO",
    montana: "MT",
    nebraska: "NE",
    nevada: "NV",
    "new-hampshire": "NH",
    "new-jersey": "NJ",
    "new-mexico": "NM",
    "new-york": "NY",
    "north-carolina": "NC",
    "north-dakota": "ND",
    ohio: "OH",
    oklahoma: "OK",
    oregon: "OR",
    pennsylvania: "PA",
    "rhode-island": "RI",
    "south-carolina": "SC",
    "south-dakota": "SD",
    tennessee: "TN",
    texas: "TX",
    utah: "UT",
    vermont: "VT",
    virginia: "VA",
    washington: "WA",
    "west-virginia": "WV",
    wisconsin: "WI",
    wyoming: "WY",
  };
  if (s.length === 2) return s.toUpperCase();
  return map[s] || "";
}

function curatedMatchesRoute(curated, { state, city }) {
  if (!curated) return false;

  const routeCity = titleCaseFromSlug(city).toLowerCase();
  const curatedCity = String(curated.city || "").trim().toLowerCase();

  const routeStateCode = normalizeStateAbbrev(state);
  const curatedStateCode = normalizeStateAbbrev(curated.state);

  if (!routeCity || !curatedCity) return false;
  if (routeCity !== curatedCity) return false;

  if (curatedStateCode && routeStateCode && curatedStateCode !== routeStateCode) return false;

  return true;
}

function mapsLinkFromAddress(address) {
  const a = String(address || "").trim();
  if (!a) return "#";
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a)}`;
}

function coerceArray(v) {
  return Array.isArray(v) ? v : [];
}

function renderCommaList(arr) {
  const list = coerceArray(arr).map((x) => String(x)).filter(Boolean);
  return list.length ? escapeHtml(list.join(", ")) : "";
}

function normKey(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function buildCityIndex(cityDataArray) {
  // Index by address (best), and by name fallback.
  const byAddr = new Map();
  const byName = new Map();

  for (const it of coerceArray(cityDataArray)) {
    const id = it && it.facility_id ? String(it.facility_id) : "";
    if (!id) continue;

    const addr = normKey(it.address || "");
    const name = normKey(it.name || "");

    if (addr) {
      if (!byAddr.has(addr)) byAddr.set(addr, id);
    }
    if (name) {
      if (!byName.has(name)) byName.set(name, id);
    }
  }

  return { byAddr, byName };
}

function findFacilityIdForCurated(curatedFacility, cityIndex) {
  if (!curatedFacility || !cityIndex) return null;

  // If you manually set facility_id in curated JSON, always respect it.
  if (curatedFacility.facility_id) return String(curatedFacility.facility_id);

  const addrKey = normKey(curatedFacility.address || "");
  if (addrKey && cityIndex.byAddr.has(addrKey)) return cityIndex.byAddr.get(addrKey);

  const nameKey = normKey(curatedFacility.name || "");
  if (nameKey && cityIndex.byName.has(nameKey)) return cityIndex.byName.get(nameKey);

  // Try a loose match: contains (only if we have something meaningful)
  if (nameKey) {
    for (const [k, v] of cityIndex.byName.entries()) {
      if (k && (k.includes(nameKey) || nameKey.includes(k))) return v;
    }
  }

  return null;
}

function renderCuratedFacilityCard(f, cityIndex) {
  const facilityId = findFacilityIdForCurated(f, cityIndex);
  const facilityUrl = facilityId ? `/facility/${facilityId}/` : null;

  const name = escapeHtml(f.name || "");
  const type = escapeHtml(f.type || "");
  const address = escapeHtml(f.address || "");
  const phone = escapeHtml(f.phone || "");
  const hours = escapeHtml(f.hours || "");
  const fees = escapeHtml(f.fees || "");
  const rules = escapeHtml(f.rules || "");
  const source = String(f.source || "").trim();
  const verified = escapeHtml(f.verified_date || "");

  const accepted = renderCommaList(f.accepted_materials);
  const notAccepted = renderCommaList(f.not_accepted);

  const hasDetails = !!(accepted || notAccepted || rules);
  const dir = mapsLinkFromAddress(f.address);

  const cardAttrs = facilityUrl
    ? `class="card card--clickable" data-href="${facilityUrl}" role="link" tabindex="0" aria-label="View details for ${name}"`
    : `class="card"`;

  return `
    <article ${cardAttrs}>
      <div class="card__kicker">
        ${type ? `<span class="badge badge--blue">${type}</span>` : ""}
        ${fees && /free/i.test(fees) ? `<span class="badge badge--green">Free</span>` : ""}
      </div>

      <h3>${name || "Facility"}</h3>

      ${address ? `<p class="card__meta">${address}</p>` : ""}

      <div style="display:flex; gap:12px; margin-top:8px; flex-wrap:wrap">
        ${dir !== "#" ? `<a class="link" href="${dir}" target="_blank" rel="noopener">Directions</a>` : ""}
        ${source ? `<a class="link" href="${escapeHtml(source)}" target="_blank" rel="noopener">Source</a>` : ""}
        ${facilityUrl ? `<a class="link" href="${facilityUrl}" style="margin-left:auto">Details →</a>` : ""}
      </div>

      ${(hours || fees || phone) ? `<p class="muted" style="margin-top:10px; line-height:1.4">
        ${hours ? `<strong>Hours:</strong> ${hours}<br/>` : ""}
        ${fees ? `<strong>Fees:</strong> ${fees}${verified ? ` <span class="muted">(verified ${verified})</span>` : ""}<br/>` : ""}
        ${phone ? `<strong>Phone:</strong> ${phone}` : ""}
      </p>` : ""}

      ${
        hasDetails
          ? `
        <details style="margin-top:10px">
          <summary class="link" style="cursor:pointer">Details</summary>
          <div style="margin-top:10px; line-height:1.5">
            ${rules ? `<div style="margin-bottom:8px"><strong>Rules:</strong> ${rules}</div>` : ""}
            ${accepted ? `<div style="margin-bottom:8px"><strong>Accepted:</strong> ${accepted}</div>` : ""}
            ${notAccepted ? `<div style="margin-bottom:8px"><strong>Not accepted:</strong> ${notAccepted}</div>` : ""}
          </div>
        </details>
      `
          : ""
      }
    </article>
  `;
}

function renderCuratedSection(curated, cityDataArrayForLinking) {
  const facilities = coerceArray(curated.facilities);
  if (!facilities.length) return "";

  const cityIndex = buildCityIndex(cityDataArrayForLinking);

  const groups = new Map();
  for (const f of facilities) {
    const key = String(f.type || "Other").trim() || "Other";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(f);
  }

  const city = escapeHtml(curated.city || "");
  const state = escapeHtml(curated.state || "");
  const updated = escapeHtml(curated.last_updated || "");

  const groupHtml = Array.from(groups.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([type, list]) => {
      return `
        <section style="margin-top:18px">
          <h2 style="margin:0 0 10px 0; font-size:1.15rem">${escapeHtml(type)}</h2>
          <div class="cards">
            ${list.map((f) => renderCuratedFacilityCard(f, cityIndex)).join("")}
          </div>
        </section>
      `;
    })
    .join("");

  return `
    <section class="seo-copy" aria-label="City guide" style="margin: 0 0 18px 0">
      <h2 style="margin:0 0 8px 0">City guide: ${city}${state ? `, ${state}` : ""}</h2>
      ${
        updated
          ? `<p class="muted" style="margin:0 0 14px 0">Last updated: ${updated}. Always confirm hours/fees before visiting.</p>`
          : `<p class="muted" style="margin:0 0 14px 0">Always confirm hours/fees before visiting.</p>`
      }
      ${groupHtml}
    </section>
  `;
}

function insertCuratedAboveResults(curatedHtml, resultsEl) {
  if (!curatedHtml || !resultsEl) return;

  // avoid duplicating if load runs twice
  if (document.getElementById("curatedGuide")) return;

  const wrapper = document.createElement("div");
  wrapper.id = "curatedGuide";
  wrapper.innerHTML = curatedHtml;

  // Insert before the results section (fixes layout issues when results is a grid container)
  resultsEl.parentNode.insertBefore(wrapper, resultsEl);
}

/** =========================
 * Facility badges (for cards)
 * ========================= */

const FACILITY_BADGE_DEFS = {
  free_to_residents: { label: "Free to residents", color: "green" },
  accepts_garbage: { label: "Accepts garbage", color: "blue" },
  accepts_heavy_trash: { label: "Accepts heavy trash", color: "orange" },
  fee_charge_likely: { label: "Fee likely", color: "gray" },
};

async function loadFacilityBadges() {
  try {
    const res = await fetch("/data/facility-badges.json", { cache: "no-store" });
    if (!res.ok) return {};
    const json = await res.json();
    return json && typeof json === "object" ? json : {};
  } catch {
    return {};
  }
}

function renderFacilityBadgePills(facilityId, badgesMap) {
  if (!facilityId || !badgesMap) return "";
  const ids = badgesMap[facilityId];
  if (!Array.isArray(ids) || ids.length === 0) return "";

  const pills = ids
    .slice(0, 3)
    .map((id) => {
      const def = FACILITY_BADGE_DEFS[id];
      if (!def) return "";
      return `<span class="badge badge--rule ${def.color}">${def.label}</span>`;
    })
    .filter(Boolean);

  if (pills.length === 0) return "";

  return `<div class="card__pills" style="margin-top:8px; display:flex; gap:6px; flex-wrap:wrap;">${pills.join(
    " "
  )}</div>`;
}

/** =========================
 * Main load
 * ========================= */

async function loadCityData() {
  const resultsEl = document.getElementById("results");
  if (!resultsEl) return;

  ensureRobotsMeta("index,follow");

  const { state, city } = getRouteParts();
  const cityName = titleCaseFromSlug(city);
  const stateName = titleCaseWordsFromSlug(state);

  if (!state || !city) {
    resultsEl.innerHTML =
      "<p class='muted'>City route not detected (expected #state/city or /state/city/).</p>";
    return;
  }

  applyCitySEO({ cityName, stateName });

  const dataUrl = `/data/${state}/${city}.json`;

  try {
    const [res, facilityBadges] = await Promise.all([
      fetch(dataUrl, { cache: "no-store" }),
      loadFacilityBadges(),
    ]);

    if (!res.ok) throw new Error(`Failed to load ${dataUrl} (${res.status})`);

    const data = await res.json();

    // Curated overlay (Option A: injected JSON in the HTML)
    const curated = readCuratedOverlayFromDom();
    const hasCurated = curated && curatedMatchesRoute(curated, { state, city });

    if (hasCurated) {
      const curatedHtml = renderCuratedSection(curated, data);
      insertCuratedAboveResults(curatedHtml, resultsEl);

      // Default behavior for curated cities: REPLACE (hide the old list)
      resultsEl.innerHTML = "";

      // Still bind click handler so curated cards with data-href work
      attachCardClickHandler(document.body);
      return;
    }

    // Normal behavior (no curated)
    if (!Array.isArray(data) || data.length === 0) {
      resultsEl.innerHTML = "<p class='muted'>No locations found.</p>";
      return;
    }

    resultsEl.innerHTML = data.map((item) => renderCard(item, facilityBadges)).join("");
    attachCardClickHandler(resultsEl);
  } catch (err) {
    console.error(err);
    resultsEl.innerHTML = "<p class='muted'>Unable to load locations right now.</p>";
  }
}

function attachCardClickHandler(rootEl) {
  // Prevent double-binding if loadCityData ever runs twice
  if (rootEl.__cardsBound) return;
  rootEl.__cardsBound = true;

  rootEl.addEventListener("click", (e) => {
    const innerLink = e.target.closest("a");
    if (innerLink) return;

    if (e.target && e.target.closest && e.target.closest("summary")) return;

    const card = e.target.closest(".card[data-href]");
    if (!card) return;

    const href = card.getAttribute("data-href");
    if (href) window.location.href = href;
  });
}

function renderCard(item, facilityBadges) {
  const badges = [];

  if (item.type === "landfill") badges.push(badge("Landfill", "orange"));
  if (item.type === "transfer_station") badges.push(badge("Transfer station", "orange"));
  if (item.type === "recycling") badges.push(badge("Recycling", "blue"));
  if (item.type === "hazardous_waste") badges.push(badge("Hazardous", "orange"));

  const mapsUrl =
    item.lat && item.lng
      ? `https://www.google.com/maps/search/?api=1&query=${item.lat},${item.lng}`
      : "#";

  const facilityUrl = item.facility_id ? `/facility/${item.facility_id}/` : null;

  const cardAttrs = facilityUrl
    ? `class="card card--clickable" data-href="${facilityUrl}" role="link" tabindex="0" aria-label="View details for ${escapeHtml(
        item.name
      )}"`
    : `class="card"`;

  const facilityPillsHtml = renderFacilityBadgePills(item.facility_id, facilityBadges);

  return `
    <article ${cardAttrs}>
      <div class="card__kicker">${badges.join(" ")}</div>
      <h3>${escapeHtml(item.name)}</h3>
      ${item.address ? `<p class="card__meta">${escapeHtml(item.address)}</p>` : ""}
      ${facilityPillsHtml}
      <div style="display:flex; gap:12px; margin-top:8px; flex-wrap:wrap">
        <a class="link" href="${mapsUrl}" target="_blank" rel="noopener">Directions</a>
        ${
          item.website
            ? `<a class="link" href="${item.website}" target="_blank" rel="noopener">Website</a>`
            : ""
        }
        ${
          item.osm_url
            ? `<a class="link" href="${item.osm_url}" target="_blank" rel="noopener">Source</a>`
            : ""
        }
        ${
          facilityUrl
            ? `<a class="link" href="${facilityUrl}" style="margin-left:auto">Details →</a>`
            : ""
        }
      </div>
    </article>
  `;
}

function badge(text, color) {
  return `<span class="badge badge--${color}">${text}</span>`;
}

function escapeHtml(str = "") {
  return String(str).replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[m]));
}

document.addEventListener("DOMContentLoaded", loadCityData);
