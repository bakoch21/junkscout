// city-template.js
// Reads "#state/city" from the URL hash and loads /data/state/city.json into #results

function titleCaseFromSlug(slug = "") {
  return slug
    .split(/[-_ ]+/g)
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function badge(text, color) {
  return `<span class="badge badge--${color}">${text}</span>`;
}

function escapeHtml(str = "") {
  return str.replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[m]));
}

function renderCard(item) {
  const badges = [];

  if (item.type === "landfill") badges.push(badge("Landfill", "orange"));
  if (item.type === "transfer_station") badges.push(badge("Transfer station", "orange"));
  if (item.type === "recycling") badges.push(badge("Recycling", "blue"));
  if (item.type === "scrap_yard") badges.push(badge("Scrap", "green"));
  if (item.type === "hazardous_waste") badges.push(badge("Hazardous", "orange"));

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

async function loadFromHash() {
  const resultsEl = document.getElementById("results");
  const cityTitle = document.getElementById("cityTitle");
  const aboutTitle = document.getElementById("aboutTitle");

  if (!resultsEl) return;

  const raw = (window.location.hash || "").replace("#", "").trim();
  // expects "texas/austin"
  const [state, city] = raw.split("/").map(s => (s || "").trim());

  if (!state || !city) {
    resultsEl.innerHTML = `<p class="muted">Missing city in URL. Example: <code>#texas/austin</code></p>`;
    return;
  }

  const cityPretty = titleCaseFromSlug(city);
  const statePretty = titleCaseFromSlug(state);

  cityTitle.textContent = `Find dumps and landfills in ${cityPretty}, ${statePretty}`;
  aboutTitle.textContent = `About dumping in ${cityPretty}`;

  try {
    const res = await fetch(`/data/${state}/${city}.json`);
    if (!res.ok) throw new Error(`Failed to load /data/${state}/${city}.json`);

    const data = await res.json();

    if (!Array.isArray(data) || data.length === 0) {
      resultsEl.innerHTML = `<p class="muted">No locations found.</p>`;
      return;
    }

    resultsEl.innerHTML = data.map(renderCard).join("");
  } catch (err) {
    console.error(err);
    resultsEl.innerHTML = `<p class="muted">Unable to load locations right now.</p>`;
  }
}

window.addEventListener("hashchange", loadFromHash);
document.addEventListener("DOMContentLoaded", loadFromHash);
