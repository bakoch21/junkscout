// app.js — location-first wizard + city autocomplete

const CITY_LIST_URL = "/scripts/cities-texas.json";

const yearEl = document.getElementById("year");

const toggleFilters = document.getElementById("toggleFilters");
const filtersPanel = document.getElementById("filtersPanel");

const searchBtn = document.getElementById("searchBtn");
const ctaStart = document.getElementById("ctaStart");

const whereInput = document.getElementById("whereInput");
const cityList = document.getElementById("cityList");

// Optional filters (exist on homepage)
const loadSelect = document.getElementById("loadSelect");
const openNowEl = document.getElementById("openNow");
const residentOnlyEl = document.getElementById("residentOnly");
const mixedLoadsEl = document.getElementById("mixedLoads");

// "Austin, TX" -> { state:"texas", city:"austin" }
let CITY_LOOKUP = new Map();

function titleCaseFromSlug(slug = "") {
  return slug
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function buildCityLabel(entry) {
  // You're Texas-only right now, so show "City, TX"
  const cityName = titleCaseFromSlug(entry.city);
  return `${cityName}, TX`;
}

async function populateCityDatalist() {
  if (!whereInput || !cityList) return;

  try {
    const res = await fetch(CITY_LIST_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`Could not load ${CITY_LIST_URL} (${res.status})`);

    const cities = await res.json();
    if (!Array.isArray(cities)) throw new Error("City list JSON is not an array.");

    cityList.innerHTML = "";
    CITY_LOOKUP = new Map();

    for (const entry of cities) {
      if (!entry?.state || !entry?.city) continue;

      const label = buildCityLabel(entry);
      CITY_LOOKUP.set(label.toLowerCase(), { state: entry.state, city: entry.city });

      const opt = document.createElement("option");
      opt.value = label;
      cityList.appendChild(opt);
    }
  } catch (err) {
    console.warn("City datalist failed to load:", err);
    // No hard failure — user can still type manually
  }
}

function toggleFiltersPanel() {
  if (!filtersPanel || !toggleFilters) return;

  const isHidden = filtersPanel.hasAttribute("hidden");
  if (isHidden) {
    filtersPanel.removeAttribute("hidden");
    toggleFilters.textContent = "Hide filters";
  } else {
    filtersPanel.setAttribute("hidden", "");
    toggleFilters.textContent = "More filters";
  }
}

function runSearch() {
  const whereRaw = (whereInput?.value || "").trim();
  const key = whereRaw.toLowerCase();

  if (!whereRaw) {
    window.location.href = "/texas/";
    return;
  }

  // If user picked a known city, go straight to that city page
  if (CITY_LOOKUP.has(key)) {
    const { state, city } = CITY_LOOKUP.get(key);
    window.location.href = `/${state}/${city}/`;
    return;
  }

  // If they typed something not in the list, keep it simple for now.
  // Later we can geocode this and route them correctly.
  alert(
    `We don't recognize that location yet.\n\n` +
      `Please select a city from the dropdown list (e.g., Austin, TX).`
  );
}

function focusWhere() {
  if (whereInput) whereInput.focus();
}

function useMyLocation() {
  if (!navigator.geolocation) {
    alert("Geolocation not supported in this browser.");
    return;
  }

  navigator.geolocation.getCurrentPosition(
    async () => {
      // Placeholder for reverse geocode (Nominatim).
      // For now, we just tell the user it worked.
      alert(
        "Got your location. Next step: reverse-geocode to a city/state and auto-fill this box."
      );

      // Optional: you can temporarily set a default to prove flow:
      // whereInput.value = "Austin, TX";
    },
    () => alert("Couldn’t access location. You can type a city/state instead.")
  );
}

function wireHomepageCards() {
  const cards = document.querySelectorAll(".cards .card[data-href]");
  if (!cards.length) return;

  cards.forEach((card) => {
    const href = String(card.getAttribute("data-href") || "").trim();
    if (!href) return;

    card.setAttribute("role", "link");
    card.setAttribute("tabindex", "0");

    const go = () => {
      window.location.href = href;
    };

    card.addEventListener("click", (e) => {
      if (e.target.closest("a, button, input, select, textarea, label")) return;
      go();
    });

    card.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      go();
    });
  });
}

// Wire up events
if (toggleFilters) toggleFilters.addEventListener("click", toggleFiltersPanel);
if (searchBtn) searchBtn.addEventListener("click", runSearch);
if (ctaStart) ctaStart.addEventListener("click", focusWhere);

// Enter key triggers search
if (whereInput) {
  whereInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      runSearch();
    }
  });
}

// Init
document.addEventListener("DOMContentLoaded", () => {
  populateCityDatalist();
  wireHomepageCards();
  if (yearEl) yearEl.textContent = new Date().getFullYear();
});
