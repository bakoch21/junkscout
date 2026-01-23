// facility.js
// Loads /data/facilities/{id}.json and renders into the facility template.
// Also renders manual facility badges from /data/facility-badges.json when present.

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
  // These classes already exist for the city type badges: badge--blue, badge--orange, etc.
  // We'll reuse them so styling stays consistent with the rest of the site.
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
  // Facility template should include: <div id="facilityBadges"></div>
  const badgesEl = document.getElementById("facilityBadges");
  if (!badgesEl) return;

  try {
    const res = await fetch("/data/facility-badges.json", { cache: "no-store" });
    if (!res.ok) return; // no badges file yet, or not deployed—silent fail

    const all = await res.json();
    const badgeKeys = all?.[id];
    renderBadgesInto(badgesEl, badgeKeys);
  } catch (e) {
    // Silent fail: badges are optional and should never break the page
  }
}

async function loadFacility() {
  const id = getFacilityIdFromPath();
  if (!id) return;

  const dataUrl = `/data/facilities/${id}.json`;

  try {
    const res = await fetch(dataUrl, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to load ${dataUrl} (${res.status})`);

    const f = await res.json();

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

    // --- Houston modal wiring (SEO-safe, UI-only) ---
    const isHouston = isHoustonFacility(f);
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
