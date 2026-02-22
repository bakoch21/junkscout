// app.js — location-first wizard + city autocomplete

const CITY_LIST_URLS = ["/scripts/cities-texas.json", "/scripts/cities-california.json"];

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
  const cityName = titleCaseFromSlug(entry.city);
  const state = String(entry.state || "").toLowerCase();
  const stateAbbrev = state === "california" ? "CA" : "TX";
  return `${cityName}, ${stateAbbrev}`;
}

async function populateCityDatalist() {
  if (!whereInput || !cityList) return;

  try {
    const responses = await Promise.all(
      CITY_LIST_URLS.map((url) => fetch(url, { cache: "no-store" }))
    );

    const bad = responses.find((res) => !res.ok);
    if (bad) throw new Error(`Could not load city list (${bad.status}).`);

    const cityLists = await Promise.all(responses.map((res) => res.json()));
    const cities = cityLists.filter(Array.isArray).flat();
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

function wireStateRail() {
  const rail = document.querySelector("[data-state-rail]");
  const prevBtn = document.querySelector("[data-state-rail-prev]");
  const nextBtn = document.querySelector("[data-state-rail-next]");

  if (!rail || !prevBtn || !nextBtn) return;

  const prefersReducedMotion =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const baseCards = Array.from(
    rail.querySelectorAll(".state-card:not([data-state-rail-clone='1'])")
  );
  if (baseCards.length < 2) {
    prevBtn.hidden = true;
    nextBtn.hidden = true;
    return;
  }

  const markClone = (clone) => {
    clone.setAttribute("data-state-rail-clone", "1");
    clone.setAttribute("aria-hidden", "true");

    if (clone instanceof HTMLElement) {
      clone.tabIndex = -1;
      const focusables = clone.querySelectorAll(
        "a, button, input, select, textarea, [tabindex]"
      );
      for (const el of focusables) {
        if (el instanceof HTMLElement) el.tabIndex = -1;
      }
    }
  };

  const getStep = () => {
    const first = baseCards[0];
    if (!first) return Math.max(220, Math.round(rail.clientWidth * 0.75));

    const styles = window.getComputedStyle(rail);
    const gap = parseFloat(styles.columnGap || styles.gap || "12") || 12;
    return Math.round(first.getBoundingClientRect().width + gap);
  };

  let autoTimer = null;
  let resumeTimer = null;
  const AUTO_INTERVAL_MS = 2600;
  const AUTO_RESUME_DELAY_MS = 2200;

  const appendCycle = () => {
    const frag = document.createDocumentFragment();
    for (const card of baseCards) {
      const clone = card.cloneNode(true);
      markClone(clone);
      frag.appendChild(clone);
    }
    rail.appendChild(frag);
  };

  const ensureTailSpace = () => {
    const step = getStep();
    const remaining = rail.scrollWidth - rail.clientWidth - rail.scrollLeft;
    if (remaining < step * 2.2) appendCycle();
  };

  const updateButtons = () => {
    const hasOverflow = rail.scrollWidth - rail.clientWidth > 4;
    if (!hasOverflow) {
      prevBtn.disabled = true;
      nextBtn.disabled = true;
      return;
    }
    prevBtn.disabled = rail.scrollLeft <= 4;
    nextBtn.disabled = false;
  };

  const stopAuto = () => {
    if (autoTimer) {
      clearInterval(autoTimer);
      autoTimer = null;
    }
  };

  const stepRight = () => {
    ensureTailSpace();
    rail.scrollBy({
      left: getStep(),
      behavior: prefersReducedMotion ? "auto" : "smooth",
    });
    setTimeout(ensureTailSpace, prefersReducedMotion ? 0 : 420);
  };

  const stepLeft = () => {
    rail.scrollBy({
      left: -getStep(),
      behavior: prefersReducedMotion ? "auto" : "smooth",
    });
  };

  const startAuto = () => {
    if (prefersReducedMotion || autoTimer) return;
    ensureTailSpace();
    autoTimer = setInterval(() => {
      stepRight();
    }, AUTO_INTERVAL_MS);
  };

  const scheduleAutoResume = () => {
    if (prefersReducedMotion) return;
    stopAuto();
    if (resumeTimer) clearTimeout(resumeTimer);
    resumeTimer = setTimeout(() => {
      ensureTailSpace();
      updateButtons();
      startAuto();
    }, AUTO_RESUME_DELAY_MS);
  };

  prevBtn.addEventListener("click", () => {
    stepLeft();
    scheduleAutoResume();
  });

  nextBtn.addEventListener("click", () => {
    stepRight();
    scheduleAutoResume();
  });

  rail.addEventListener("scroll", () => {
    ensureTailSpace();
    updateButtons();
  }, { passive: true });

  rail.addEventListener("wheel", scheduleAutoResume, { passive: true });
  rail.addEventListener("touchstart", scheduleAutoResume, { passive: true });
  rail.addEventListener("pointerdown", scheduleAutoResume, { passive: true });
  rail.addEventListener("mouseenter", stopAuto);
  rail.addEventListener("mouseleave", scheduleAutoResume);
  rail.addEventListener("focusin", stopAuto);
  rail.addEventListener("focusout", scheduleAutoResume);

  window.addEventListener("resize", () => {
    ensureTailSpace();
    updateButtons();
    scheduleAutoResume();
  }, { passive: true });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stopAuto();
      return;
    }
    scheduleAutoResume();
  });

  if (!rail.querySelector("[data-state-rail-clone='1']")) appendCycle();
  requestAnimationFrame(() => {
    ensureTailSpace();
    updateButtons();
    startAuto();
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
  wireStateRail();
  if (yearEl) yearEl.textContent = new Date().getFullYear();
});
