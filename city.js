// city.js
// Renders city results from a static JSON file into #results
// Supports BOTH routing styles:
//   Hash route:   /city-template.html#texas/dallas  -> /data/texas/dallas.json
//   Path route:   /texas/dallas/                   -> /data/texas/dallas.json

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

  // H1 (query-matching)
  const titleEl = document.getElementById("cityTitle");
  if (titleEl) {
    titleEl.textContent = `Where to dump trash in ${pretty}`;
  }

  // Answer sentence (optional fine-tune)
  const ansEl = document.getElementById("cityAnswer");
  if (ansEl) {
    ansEl.textContent = `Find public landfills, transfer stations, and recycling drop-offs in ${pretty}, with hours, rules, and accepted materials when available.`;
  }

  // Supporting subhead
  const subEl = document.getElementById("citySubhead");
  if (subEl) {
    subEl.textContent = `Public landfills, transfer stations, and disposal sites in ${cityName}. Always confirm fees, residency rules, and accepted materials before visiting.`;
  }

  // Inline city mention in SEO copy
  const inlineCity = document.getElementById("cityNameInline");
  if (inlineCity) inlineCity.textContent = cityName;

  // Document title + meta description (CTR)
  document.title = `Where to Dump Trash in ${pretty} | JunkScout`;
  setMetaDescription(
    `Find public landfills, transfer stations, and recycling drop-offs in ${pretty}. Hours, fees, and accepted materials when available—always confirm before visiting.`
  );

  // Canonical (prefer path URL, drop hash)
  setCanonical(window.location.href.split("#")[0]);
}

/** =========================
 * Facility badges (for cards)
 * ========================= */

const FACILITY_BADGE_DEFS = {
  free_to_residents: { label: "Free", color: "green" },
  accepts_garbage: { label: "Garbage", color: "blue" },
  accepts_heavy_trash: { label: "Heavy trash", color: "orange" },
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

  // Cap to 3 to keep cards clean
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
 * Filters (hub cities)
 * ========================= */

function getTypeKey(item) {
  // item.type values seen: landfill, transfer_station, recycling, hazardous_waste
  return String(item?.type || "").trim();
}

function getFeatureKeys(item, badgesMap) {
  const keys = new Set();

  // Preferred: facility-badges map by facility_id
  if (item?.facility_id && badgesMap && Array.isArray(badgesMap[item.facility_id])) {
    for (const k of badgesMap[item.facility_id]) keys.add(k);
  }

  // Fallback: if item itself carries tags/badges
  const arr =
    (Array.isArray(item?.badges) && item.badges) ||
    (Array.isArray(item?.tags) && item.tags) ||
    [];

  for (const k of arr) keys.add(String(k));

  return keys;
}

function typeLabelFromTypeKey(type) {
  if (type === "landfill") return "Landfill";
  if (type === "transfer_station") return "Transfer";
  if (type === "recycling") return "Recycling";
  if (type === "hazardous_waste") return "Hazardous";
  return "";
}

function buildFiltersUI({ items, badgesMap, mountAfterEl }) {
  if (!mountAfterEl) return null;

  const container = document.createElement("section");
  container.id = "filters";
  container.setAttribute("aria-label", "Filters");
  // more space above + less-white background
  container.style.marginTop = "18px";
  container.style.border = "1px solid var(--border)";
  container.style.borderRadius = "16px";
  container.style.background = "rgba(0,0,0,0.03)";
  container.style.padding = "14px 14px";
  container.style.boxShadow = "0 10px 30px rgba(0,0,0,.04)";

  container.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:flex-end; gap:16px; flex-wrap:wrap">
      <div>
        <div style="font-weight:800; letter-spacing:-0.01em">Filter locations</div>
        <div class="muted small" style="margin-top:4px">Use Type to narrow fast, then Features to find what you need.</div>
      </div>
      <div id="filtersCount" class="muted" style="font-weight:700"></div>
    </div>

    <div style="margin-top:12px; display:flex; gap:18px; flex-wrap:wrap; align-items:flex-start">
      <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap">
        <div class="muted" style="font-weight:800">Type</div>
        <select id="typeSelect" class="input" style="padding:10px 12px; border-radius:999px; border:1px solid var(--border); background:rgba(255,255,255,.75)">
          <option value="">All types</option>
        </select>
      </div>

      <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap">
        <div class="muted" style="font-weight:800">Features</div>
        <div id="featureChips" style="display:flex; gap:10px; flex-wrap:wrap"></div>
      </div>

      <div style="margin-left:auto; display:flex; gap:10px; align-items:center; flex-wrap:wrap">
        <button id="filtersReset" class="btn btn--ghost" type="button">Reset</button>
      </div>
    </div>
  `;

  // build Type options present in data
  const typeCounts = new Map();
  for (const it of items) {
    const t = getTypeKey(it);
    if (!t) continue;
    typeCounts.set(t, (typeCounts.get(t) || 0) + 1);
  }

  const typeSelect = container.querySelector("#typeSelect");
  const typesSorted = Array.from(typeCounts.entries()).sort((a, b) => b[1] - a[1]);
  for (const [t, c] of typesSorted) {
    const opt = document.createElement("option");
    opt.value = t;
    opt.textContent = `${typeLabelFromTypeKey(t) || titleCaseFromSlug(t)} (${c})`;
    typeSelect.appendChild(opt);
  }

  // build feature chips (only from known badge defs)
  const featureCounts = new Map();
  for (const it of items) {
    const fkeys = getFeatureKeys(it, badgesMap);
    for (const k of fkeys) {
      if (!FACILITY_BADGE_DEFS[k]) continue;
      featureCounts.set(k, (featureCounts.get(k) || 0) + 1);
    }
  }

  const featureChips = container.querySelector("#featureChips");
  const featuresSorted = Array.from(featureCounts.entries()).sort((a, b) => b[1] - a[1]);
  for (const [k, c] of featuresSorted) {
    const def = FACILITY_BADGE_DEFS[k];
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn--ghost";
    btn.dataset.key = k;
    btn.setAttribute("aria-pressed", "false");
    btn.style.borderRadius = "999px";
    btn.style.padding = "10px 12px";
    btn.style.fontWeight = "800";
    btn.textContent = `${def.label}${c ? ` (${c})` : ""}`;
    featureChips.appendChild(btn);
  }

  mountAfterEl.insertAdjacentElement("afterend", container);
  return container;
}

function applyFilters({ items, badgesMap, selectedType, selectedFeatures }) {
  return items.filter((it) => {
    if (selectedType) {
      const t = getTypeKey(it);
      if (t !== selectedType) return false;
    }

    if (selectedFeatures && selectedFeatures.size > 0) {
      const keys = getFeatureKeys(it, badgesMap);
      for (const k of selectedFeatures) {
        if (!keys.has(k)) return false;
      }
    }

    return true;
  });
}

/** =========================
 * Main load
 * ========================= */

async function loadCityData() {
  const resultsEl = document.getElementById("results");
  if (!resultsEl) return;

  // Safety: ensure robots meta exists (template already has it)
  ensureRobotsMeta("index,follow");

  const { state, city } = getRouteParts();
  const cityName = titleCaseFromSlug(city);
  const stateName = titleCaseWordsFromSlug(state);

  if (!state || !city) {
    resultsEl.innerHTML =
      "<p class='muted'>City route not detected (expected #state/city or /state/city/).</p>";
    return;
  }

  // Apply SEO framing early (before fetch)
  applyCitySEO({ cityName, stateName });

  const dataUrl = `/data/${state}/${city}.json`;

  try {
    // Load both the city data and facility badges (badges load once per page)
    const [res, facilityBadges] = await Promise.all([
      fetch(dataUrl, { cache: "no-store" }),
      loadFacilityBadges(),
    ]);

    if (!res.ok) throw new Error(`Failed to load ${dataUrl} (${res.status})`);

    const data = await res.json();

    if (!Array.isArray(data) || data.length === 0) {
      resultsEl.innerHTML = "<p class='muted'>No locations found.</p>";
      return;
    }

    // Decide if we show filters (hub city behavior)
    const SHOULD_SHOW_FILTERS = data.length >= 20;

    let filtersEl = null;
    if (SHOULD_SHOW_FILTERS) {
      const houBtn = document.getElementById("houstonRulesBtn");
      // mount filters after Houston rules button if present, else before results
      const mountAfterEl = houBtn || resultsEl;
      filtersEl = buildFiltersUI({ items: data, badgesMap: facilityBadges, mountAfterEl });
    }

    // render function (reusable)
    const render = (itemsToRender) => {
      resultsEl.innerHTML = itemsToRender.map((item) => renderCard(item, facilityBadges)).join("");
      attachCardClickHandler(resultsEl);

      if (filtersEl) {
        const countEl = filtersEl.querySelector("#filtersCount");
        if (countEl) countEl.textContent = `Showing ${itemsToRender.length} of ${data.length}`;
      }
    };

    render(data);

    // Wire up filters if present
    if (filtersEl) {
      let selectedType = "";
      const selectedFeatures = new Set();

      const typeSelect = filtersEl.querySelector("#typeSelect");
      const featureChips = filtersEl.querySelector("#featureChips");
      const resetBtn = filtersEl.querySelector("#filtersReset");

      const runFilter = () => {
        const filtered = applyFilters({
          items: data,
          badgesMap: facilityBadges,
          selectedType: selectedType || "",
          selectedFeatures,
        });
        render(filtered);
      };

      if (typeSelect) {
        typeSelect.addEventListener("change", () => {
          selectedType = typeSelect.value || "";
          runFilter();
        });
      }

      if (featureChips) {
        featureChips.addEventListener("click", (e) => {
          const btn = e.target.closest("button[data-key]");
          if (!btn) return;

          const key = btn.dataset.key;
          const isOn = selectedFeatures.has(key);

          if (isOn) {
            selectedFeatures.delete(key);
            btn.setAttribute("aria-pressed", "false");
            btn.style.background = "";
            btn.style.borderColor = "";
          } else {
            selectedFeatures.add(key);
            btn.setAttribute("aria-pressed", "true");
            btn.style.background = "rgba(255,255,255,.8)";
            btn.style.borderColor = "rgba(0,0,0,.12)";
          }

          runFilter();
        });
      }

      if (resetBtn) {
        resetBtn.addEventListener("click", () => {
          selectedType = "";
          selectedFeatures.clear();

          if (typeSelect) typeSelect.value = "";

          // reset chip visuals
          const btns = filtersEl.querySelectorAll("button[data-key]");
          btns.forEach((b) => {
            b.setAttribute("aria-pressed", "false");
            b.style.background = "";
            b.style.borderColor = "";
          });

          render(data);
        });
      }
    }
  } catch (err) {
    console.error(err);
    resultsEl.innerHTML = "<p class='muted'>Unable to load locations right now.</p>";
  }
}

function attachCardClickHandler(resultsEl) {
  // Prevent double-binding if loadCityData ever runs twice
  if (resultsEl.__cardsBound) return;
  resultsEl.__cardsBound = true;

  resultsEl.addEventListener("click", (e) => {
    // If user clicked an inner link, don't hijack it
    const innerLink = e.target.closest("a");
    if (innerLink) return;

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

  // NOTE: no nested <a> wrapping the card anymore.
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
