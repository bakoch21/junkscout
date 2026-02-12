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
  const appears = Array.isArray(f?.appears_in) ? f.appears_in : [];
  const inHouston = appears.some((x) => String(x?.city || "").toLowerCase() === "houston");
  if (inHouston) return true;

  const addr = String(f?.address || "").toLowerCase();
  if (addr.includes("houston")) return true;

  return false;
}

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

function coerceArray(v) {
  return Array.isArray(v) ? v : [];
}

function hasVerifiedDetails(f) {
  if (!f) return false;
  if (f.hours) return true;
  if (f.fees) return true;
  if (f.rules) return true;
  if (coerceArray(f.accepted_materials).length) return true;
  if (coerceArray(f.not_accepted).length) return true;
  if (f.verified_date) return true;
  if (f.source) return true;
  return false;
}

function renderVerifiedSection(f) {
  if (!hasVerifiedDetails(f)) return "";

  const hours = f.hours ? escapeHtml(f.hours) : "";
  const fees = f.fees ? escapeHtml(f.fees) : "";
  const rules = f.rules ? escapeHtml(f.rules) : "";
  const verified = f.verified_date ? escapeHtml(f.verified_date) : "";
  const source = f.source ? String(f.source).trim() : "";

  const accepted = coerceArray(f.accepted_materials).map((x) => escapeHtml(String(x))).filter(Boolean);
  const notAccepted = coerceArray(f.not_accepted).map((x) => escapeHtml(String(x))).filter(Boolean);

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

function injectVerifiedSection(html) {
  const aboutEl = document.getElementById("facilityAbout");
  if (!aboutEl) return;

  if (document.getElementById("verifiedDetails")) return;

  const wrap = document.createElement("div");
  wrap.id = "verifiedDetails";
  wrap.innerHTML = html;

  aboutEl.parentNode.insertBefore(wrap, aboutEl.nextSibling);
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
    if (subEl) subEl.textContent = `${type} in the area — confirm hours, fees, and accepted materials before visiting.`;

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
      const seen = new Set();
      const cities = f.appears_in
        .map((x) => ({
          state: String(x?.state || "texas").toLowerCase().trim(),
          city: String(x?.city || "").toLowerCase().trim(),
        }))
        .filter((x) => x.city)
        .filter((x) => {
          const key = `${x.state}/${x.city}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .sort((a, b) => {
          const sa = `${a.state}/${a.city}`;
          const sb = `${b.state}/${b.city}`;
          return sa.localeCompare(sb);
        });

      citiesEl.innerHTML = cities
        .map((entry) => {
          const cityName = titleCaseFromSlug(entry.city);
          return `<a class="cityhub__pill" href="/${escapeHtml(entry.state)}/${escapeHtml(entry.city)}/">${escapeHtml(cityName)}</a>`;
        })
        .join("");
    }

    // Badges (optional)
    loadFacilityBadges(id);

    // ✅ Manual-rich section
    const verifiedHtml = renderVerifiedSection(f);
    if (verifiedHtml) injectVerifiedSection(verifiedHtml);

    // Modal trigger (UI-only)
    const isHouston = isHoustonFacility(f);
    window.__isHoustonFacility = isHouston;

    if (houBtn) {
      houBtn.style.display = isHouston ? "inline-flex" : "none";
    }
  } catch (err) {
    console.error(err);
  }
}

document.addEventListener("DOMContentLoaded", loadFacility);
