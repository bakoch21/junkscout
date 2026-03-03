// analytics.js
// Lightweight event capture for later provider wiring.
// Analytics stay off until the user opts in through privacy-consent.js.

(function () {
  const QUEUE_KEY = "junkscout_analytics_events_v1";
  const MAX_EVENTS = 200;
  const CONFIG_URL = "/data/analytics/config.json";

  let provider = "none";
  let measurementId = "";
  let debug = false;
  let clickTrackingWired = false;
  let pageViewTracked = false;
  let analyticsReady = false;

  function nowIso() {
    return new Date().toISOString();
  }

  function safeJsonParse(raw, fallback) {
    try {
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  function readQueue() {
    try {
      const raw = window.localStorage.getItem(QUEUE_KEY);
      if (!raw) return [];
      const parsed = safeJsonParse(raw, []);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function writeQueue(events) {
    try {
      const trimmed = events.slice(-MAX_EVENTS);
      window.localStorage.setItem(QUEUE_KEY, JSON.stringify(trimmed));
    } catch {
      // ignore storage failures
    }
  }

  function hasAnalyticsConsent() {
    return Boolean(
      window.JunkScoutPrivacy &&
        typeof window.JunkScoutPrivacy.canTrackAnalytics === "function" &&
        window.JunkScoutPrivacy.canTrackAnalytics()
    );
  }

  function pushEvent(eventName, payload) {
    if (!hasAnalyticsConsent()) return;

    const event = {
      name: String(eventName || "").trim(),
      ts: nowIso(),
      path: window.location.pathname,
      payload: payload || {},
    };

    if (!event.name) return;

    const queue = readQueue();
    queue.push(event);
    writeQueue(queue);

    forwardToProvider(event);
    if (debug) console.log("[analytics]", event);
  }

  function forwardToProvider(event) {
    if (provider === "ga4" && typeof window.gtag === "function") {
      window.gtag("event", event.name, {
        ...event.payload,
        page_path: event.path,
      });
      return;
    }

    if (provider === "plausible" && typeof window.plausible === "function") {
      window.plausible(event.name, { props: event.payload });
    }
  }

  function classifyLink(link) {
    const href = link.getAttribute("href") || "";
    if (!href) return "unknown";
    if (href.startsWith("#")) return "anchor";
    if (href.startsWith("tel:")) return "phone";
    if (href.startsWith("mailto:")) return "email";

    try {
      const target = new URL(href, window.location.origin);
      if (target.origin !== window.location.origin) return "outbound";
      if (target.pathname.startsWith("/facility/")) return "facility";
      if (/^\/(texas|california|georgia|florida|illinois|arizona|north-carolina|washington)\//.test(target.pathname)) {
        return "location";
      }
      return "internal";
    } catch {
      return "unknown";
    }
  }

  function wireClickTracking() {
    if (clickTrackingWired) return;
    clickTrackingWired = true;

    document.addEventListener("click", (e) => {
      const link = e.target.closest("a[href]");
      if (!link) return;

      const href = link.getAttribute("href") || "";
      const linkType = classifyLink(link);
      const text = (link.textContent || "").trim().slice(0, 120);

      pushEvent("link_click", {
        href,
        link_type: linkType,
        text,
      });
    });

    const searchBtn = document.getElementById("searchBtn");
    if (searchBtn) {
      searchBtn.addEventListener("click", () => {
        const whereInput = document.getElementById("whereInput");
        pushEvent("homepage_search_click", {
          query: whereInput ? String(whereInput.value || "").trim() : "",
        });
      });
    }
  }

  async function loadConfig() {
    try {
      const res = await fetch(CONFIG_URL, { cache: "no-store" });
      if (!res.ok) return;
      const cfg = await res.json();
      provider = String(cfg.provider || "none").toLowerCase();
      measurementId = String(cfg.measurement_id || "");
      debug = Boolean(cfg.debug);

      if (debug) {
        pushEvent("analytics_config_loaded", {
          provider,
          measurement_id_present: measurementId ? "yes" : "no",
        });
      }
    } catch {
      // no-op
    }
  }

  async function ensureAnalyticsReady() {
    if (analyticsReady) return;
    analyticsReady = true;
    await loadConfig();
    wireClickTracking();
  }

  async function startAnalytics() {
    if (!hasAnalyticsConsent()) return;

    await ensureAnalyticsReady();

    if (!pageViewTracked) {
      pageViewTracked = true;
      pushEvent("page_view", { title: document.title });
    }
  }

  function stopAnalytics() {
    pageViewTracked = false;
    writeQueue([]);
  }

  window.JunkScoutAnalytics = {
    getQueue: () => readQueue(),
    clearQueue: () => writeQueue([]),
    track: (eventName, payload) => pushEvent(eventName, payload),
  };

  document.addEventListener("DOMContentLoaded", () => {
    if (hasAnalyticsConsent()) {
      startAnalytics();
    }

    document.addEventListener("junkscout:privacy-consent-changed", () => {
      if (hasAnalyticsConsent()) {
        startAnalytics();
      } else {
        stopAnalytics();
      }
    });
  });
})();
