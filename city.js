// city.js
// Renders city results from a static JSON file into #results
// Supports BOTH routing styles:
//   Hash route:   /city-template.html#texas/dallas  -> /data/texas/dallas.json
//   Path route:   /texas/dallas/                   -> /data/texas/dallas.json

function ensureRobotsMeta(content = "noindex,follow") {
  // If robots meta already exists, leave it alone
  if (document.querySelector('meta[name="robots"]')) return;

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

function getRouteParts() {
  // 1) Prefer hash route: "#texas/dallas" or "#/texas/dallas"
  const hash = (window.location.hash || "").replace(/^#\/?/, "").trim();
  if (hash) {
    const [state, city] = hash.split("/").filter(Boolean);
    return { state: state || "", city: city || "" };
  }

  // 2) Fallback to pathname route: "/texas/dallas/" or "/texas/dallas/index.html"
  const parts = window.location.pathname.split("/").filter(Boolean);

  // If you ever mount under a subfolder, this still works as long as
  // the first two segments are state/city.
  const state = parts[0] || "";
  const city = parts[1] || "";

  return { state, city };
}

async function loadCityData() {
  const resultsEl = document.getElementById("results");
  if (!resultsEl) return;

  // Default behavior: keep programmatic pages noindex until you "promote" them.
  // (Later we can add a rule that flips to index for high-quality pages.)
  ensureRobotsMeta("noindex,follow");

  const { state, city } = getRouteParts();

  // Optional: fill in heading text if template uses these IDs
  const cityName = titleCaseFromSlug(city);
  const titleEl = document.getElementById("cityTitle");
  const subEl = document.getElementById("citySubhead");

  if (titleEl && state && city) {
    titleEl.textContent = `Find dumps and landfills in ${cityName}, ${state.toUpperCase()}`;
  }

  if (subEl && state && city) {
    subEl.textContent = `Public dumps, transfer stations, and disposal sites in ${cityName} — with hours, rules, and accepted materials when available.`;
  }

  if (!state || !city) {
    resultsEl.innerHTML =
      "<p class='muted'>City route not detected (expected #state/city or /state/city/).</p>";
    return;
  }

  const dataUrl = `/data/${state}/${city}.json`;

  try {
    const res = await fetch(dataUrl, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to load ${dataUrl} (${res.status})`);

    const data = await res.json();

    if (!Array.isArray(data) || data.length === 0) {
      resultsEl.innerHTML = "<p class='muted'>No locations found.</p>";
      return;
    }

    resultsEl.innerHTML = data.map(renderCard).join("");
  } catch (err) {
    console.error(err);
    resultsEl.innerHTML =
      "<p class='muted'>Unable to load locations right now.</p>";
  }
}

function renderCard(item) {
  const badges = [];

  if (item.type === "landfill") badges.push(badge("Landfill", "orange"));
  if (item.type === "transfer_station")
    badges.push(badge("Transfer station", "orange"));
  if (item.type === "recycling") badges.push(badge("Recycling", "blue"));
  if (item.type === "hazardous_waste")
    badges.push(badge("Hazardous", "orange"));

  const mapsUrl =
    item.lat && item.lng
      ? `https://www.google.com/maps/search/?api=1&query=${item.lat},${item.lng}`
      : "#";

  return `
    <article class="card">
      <div class="card__kicker">${badges.join(" ")}</div>
      <h3>${escapeHtml(item.name)}</h3>
      ${item.address ? `<p class="card__meta">${escapeHtml(item.address)}</p>` : ""}
      <div style="display:flex; gap:12px; margin-top:8px">
        <a class="link" href="${mapsUrl}" target="_blank" rel="noopener">Directions</a>
        ${item.website ? `<a class="link" href="${item.website}" target="_blank" rel="noopener">Website</a>` : ""}
        ${item.osm_url ? `<a class="link" href="${item.osm_url}" target="_blank" rel="noopener">Source</a>` : ""}
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
