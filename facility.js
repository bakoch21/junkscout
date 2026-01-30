// facility.js
// Loads /data/facilities/{id}.json and renders into the facility template.
// Also renders manual facility badges from /data/facility-badges.json when present.
// PLUS: merges curated/manual override details from /data/manual/facility-overrides.json
// into the facility view (hours/fees/rules/materials/verified_date/source).

function titleCaseFromSlug(slug = "") {
  return slug
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
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

function getFacilityIdFromPath() {
  // /facility/f_xxxxxxxx/index.html OR /facility/f_xxxxxxxx/
  const parts = window.location.pathname.split("/").filter(Boolean);
  const i = parts.indexOf("facility");
  if (i === -1) return "";
  return parts[i + 1] || "";
}

function typeLabel(type) {
  if (type === "landfill") return "Landfill";
  if (type === "transfer_station") return "Transfer station";
  if (type === "recycling") return "Recycling";
  if (type === "hazardous_waste") return "Hazardous waste";
  return "Drop-off site";
}

function isHoustonFacility(f) {
  // Primary: appears_in includes houston
  const appears = Array.isArray(f?.appears_in) ? f.appears_in : [];
  const inHouston =
    appears.some((x) => String(x?.city || "").toLowerCase() === "houston");

  if (inHouston) return true;

  // Fallback: address includes "Houston"
  const addr = String(f?.address || "").toLowerCase();
  if (addr.includes("houston")) return true;

  return false;
}

/**
 * Manual badge rendering for facility pages (SEO-safe, UI-only).
 * Expects /data/facility-badges.json to look like:
 * {
 *   "f_123": ["fee_charge_likely","accepts_heavy_trash"],
 *   ...
 * }
 */
function badgeLabel(key) {
  const map = {
    free_to_residents: "Free to residents",
    accepts_garbage: "Accepts garbage",
    accepts_heavy_trash: "Accepts heavy trash",
    fee_charge_likely: "Fee likely",
  };
  return map[key] || key;
}

function badgeClass(key) {
  const map = {
    free_to_residents: "badge--green",
    accepts_garbage: "badge--blue",
    accepts_heavy_trash: "badge--orange",
    fee_charge_likely: "badge--gray",
  };
  return map[key] || "badge--gray";
}

function renderBadgesInto(container, badgeKeys) {
  if (!container) return;
  if (!Array.isArray(badgeKeys) || badgeKeys.length === 0) {
    container.innerHTML = "";
    container.style.display = "none";
    return;
  }

  const html = badgeKeys
    .map((k) => `<span class="badge ${badgeClass(k)}">${escapeHtml(badgeLabel(k))}</span>`)
    .join(" ");

  container.innerHTML = html;
  container.style.display = "flex";
  container.style.gap = "10px";
  container.style.flexWrap = "wrap";
  container.style.marginTop = "12px";
}

async function loadFacilityBadges(id) {
  const badgesEl = document.getElementById("facilityBadges");
  if (!badgesEl) return;

  try {
    const res = await fetch("/data/facility-badges.json", { cache: "no-store" });
    if (!res.ok) return;

    const all = await res.json();
    const badgeKeys = all?.[id];
    renderBadgesInto(badgesEl, badgeKeys);
  } catch {
    // silent
  }
}

/** =========================
 * Manual overrides (curated)
 * =========================
 *
 * Expects /data/manual/facility-overrides.json:
 * {
 *   "f_123": {
 *     "hours": "...",
 *     "fees": "...",
 *     "rules": "...",
 *     "accepted_materials": [...],
 *     "not_accepted": [...],
 *     "verified_date": "YYYY-MM-DD",
 *     "source": "https://..."
 *   }
 * }
 */

async function loadFacilityOverrides() {
  try {
    const res = await fetch("/data/manual/facility-overrides.json", { cache: "no-store" });
    if (!res.ok) return null;
    const json = await res.json();
    return json && typeof json === "object" ? json : null;
  } catch {
    return null;
  }
}

function coerceArray(v) {
  return Array.isArray(v) ? v : [];
}

function hasOverrideDetails(ov) {
  if (!ov) return false;
  if (ov.hours) return true;
  if (ov.fees) return true;
  if (ov.rules) return true;
  if (coerceArray(ov.accepted_materials).length) return true;
  if (coerceArray(ov.not_accepted).length) return true;
  if (ov.verified_date) return true;
  if (ov.source) return true;
  return false;
}

function renderVerifiedSection(ov) {
  if (!hasOverrideDetails(ov)) return "";

  const hours = ov.hours ? escapeHtml(ov.hours) : "";
  const fees = ov.fees ? escapeHtml(ov.fees) : "";
  const rules = ov.rules ? escapeHtml(ov.rules) : "";
  const verified = ov.verified_date ? escapeHtml(ov.verified_date) : "";
  const source = ov.source ? String(ov.source).trim() : "";

  const accepted = coerceArray(ov.accepted_materials).map((x) => escapeHtml(String(x))).filter(Boolean);
  const notAccepted = coerceArray(ov.not_accepted).map((x) => escapeHtml(String(x))).filter(Boolean);

  return `
    <section class="seo-copy" aria-label="Verified facility details" style="margin-top:18px">
      <h2>Verified facility details</h2>
      ${verified ? `<p class="muted" style="margin-top:6px">Verified: ${verified}</p>` : ""}

      ${hours ? `<div style="margin-top:10px"><strong>Hours:</strong> ${hours}</div>` : ""}
      ${fees ? `<div style="margin-top:8px"><strong>Fees:</strong> ${fees}</div>` : ""}
      ${rules ? `<div style="margin-top:8px"><strong>Rules:</strong> ${rules}</div>` : ""}

      ${
        accepted.length
          ? `<div style="margin-top:10px"><strong>Accepted:</strong><ul style="margin:6px 0 0 18px">${accepted
              .map((x) => `<li>${x}</li>`)
              .join("")}</ul></div>`
          : ""
      }

      ${
        notAccepted.length
          ? `<div style="margin-top:10px"><strong>Not accepted:</strong><ul style="margin:6px 0 0 18px">${notAccepted
              .map((x) => `<li>${x}</li>`)
              .join("")}</ul></div>`
          : ""
      }

      ${
        source
          ? `<div style="margin-top:12px">
              <a class="link" href="${escapeHtml(source)}" target="_blank" rel="noopener">Verified source →</a>
            </div>`
          : ""
      }
    </section>
  `;
}

function injectVerifiedSectionIntoPage(html) {
  // Put it at the end of the "about" area if present; otherwise append below the about block.
  const aboutEl = document.getElementById("facilityAbout");
  if (!aboutEl) return;

  // Avoid double-inject if load runs twice
  if (document.getElementById("verifiedDetails")) return;

  const wrap = document.createElement("div");
  wrap.id = "verifiedDetails";
  wrap.innerHTML = html;

  // Insert AFTER the about block (clean + consistent)
  aboutEl.parentNode.insertBefore(wrap, aboutEl.nextSibling);
}

/** =========================
 * Main load
 * ========================= */

async function loadFacility() {
  const id = getFacilityIdFromPath();
  if (!id) return;

  const dataUrl = `/data/facilities/${id}.json`;

  try {
    // Load base facility + optional overrides in parallel
    const [res, overrides] = await Promise.all([
      fetch(dataUrl, { cache: "no-store" }),
      loadFacilityOverrides(),
    ]);

    if (!res.ok) throw new Error(`Failed to load ${dataUrl} (${res.status})`);

    const base = await res.json();

    // Merge override (if any)
    const ov = overrides?.[id] || null;

    // Non-destructive merge: override fields win, but we keep base data for everything else
    const f = ov ? { ...base, ...ov } : base;

    const titleEl = document.getElementById("facilityTitle");
    const subEl = document.getElementById("facilitySubhead");
    const kickerEl = document.getElementById("facilityKicker");
    const addrEl = document.getElementById("facilityAddress");
    const coordsEl = document.getElementById("facilityCoords");

    const dirEl = document.getElementById("facilityDirections");
    const webEl = document.getElementById("facilityWebsite");
    const srcEl = document.getElementById("facilitySource");
    const ctaEl = document.getElementById("facilityCta");
    const citiesEl = document.getElementById("facilityCities");
    const aboutEl = document.getElementById("facilityAbout");

    // Houston modal trigger (already in template)
    const houBtn = document.getElementById("houstonRulesBtn");

    const name = f.name || "Unnamed site";
    const type = typeLabel(f.type);
    const address = f.address || "Address not provided";
    const lat = typeof f.lat === "number" ? f.lat : null;
    const lng = typeof f.lng === "number" ? f.lng : null;

    const mapsUrl =
      lat && lng
        ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
        : `https://www.google.com/maps/search/${encodeURIComponent(name + " " + address)}`;

    if (titleEl) titleEl.textContent = name;
    if (kickerEl) kickerEl.textContent = type;
    if (subEl)
      subEl.textContent = `${type} in the area — confirm hours, fees, and accepted materials before visiting.`;

    if (addrEl) addrEl.textContent = address;
    if (coordsEl) coordsEl.textContent = lat && lng ? `Coordinates: ${lat}, ${lng}` : "";

    if (dirEl) dirEl.href = mapsUrl;
    if (ctaEl) ctaEl.href = mapsUrl;

    if (webEl && f.website) {
      webEl.style.display = "inline";
      webEl.href = f.website;
    } else if (webEl) {
      webEl.style.display = "none";
    }

    // Source link: keep OSM source behavior
    if (srcEl && f.osm_url) {
      srcEl.style.display = "inline";
      srcEl.href = f.osm_url;
    } else if (srcEl) {
      srcEl.style.display = "none";
    }

    if (aboutEl) {
      aboutEl.innerHTML =
        `This location is listed as a <strong>${escapeHtml(type)}</strong>. ` +
        `Rules, residency requirements, and fees vary by facility. Always confirm details directly before visiting.`;
    }

    if (citiesEl && Array.isArray(f.appears_in)) {
      const cities = f.appears_in
        .map((x) => x.city)
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b));

      citiesEl.innerHTML = cities
        .map((citySlug) => {
          const cityName = titleCaseFromSlug(citySlug);
          return `<a class="cityhub__pill" href="/texas/${citySlug}/">${escapeHtml(cityName)}</a>`;
        })
        .join("");
    }

    // Render facility badges (UI-only)
    loadFacilityBadges(id);

    // ✅ Inject verified details section if overrides exist
    if (ov) {
      const verifiedHtml = renderVerifiedSection(ov);
      if (verifiedHtml) injectVerifiedSectionIntoPage(verifiedHtml);
    }

    // --- Houston modal wiring (SEO-safe, UI-only) ---
    const isHouston = isHoustonFacility(base); // base record determines city-ness
    window.__isHoustonFacility = isHouston;

    if (houBtn) {
      houBtn.style.display = isHouston ? "inline-flex" : "none";
      // Click handler is bound inside houston-modal.js (auto-bind mode)
    }
  } catch (err) {
    console.error(err);
  }
}

document.addEventListener("DOMContentLoaded", loadFacility);
