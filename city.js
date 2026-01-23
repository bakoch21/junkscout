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
    ansEl.textContent =
      `Find public landfills, transfer stations, and recycling drop-offs in ${pretty} — with hours, rules, and accepted materials when available.`;
  }

  // Supporting subhead
  const subEl = document.getElementById("citySubhead");
  if (subEl) {
    subEl.textContent =
      `Public landfills, transfer stations, and disposal sites in ${cityName} — always confirm fees, residency rules, and accepted materials before visiting.`;
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
    const res = await fetch(dataUrl, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to load ${dataUrl} (${res.status})`);

    const data = await res.json();

    if (!Array.isArray(data) || data.length === 0) {
      resultsEl.innerHTML = "<p class='muted'>No locations found.</p>";
      return;
    }

    resultsEl.innerHTML = data.map((item) => renderCard(item)).join("");

    // Make cards clickable (delegated)
    attachCardClickHandler(resultsEl);
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

function renderCard(item) {
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
    ? `class="card card--clickable" data-href="${facilityUrl}" role="link" tabindex="0" aria-label="View details for ${escapeHtml(item.name)}"`
    : `class="card"`;

  // NOTE: no nested <a> wrapping the card anymore.
  return `
    <article ${cardAttrs}>
      <div class="card__kicker">${badges.join(" ")}</div>
      <h3>${escapeHtml(item.name)}</h3>
      ${item.address ? `<p class="card__meta">${escapeHtml(item.address)}</p>` : ""}
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
