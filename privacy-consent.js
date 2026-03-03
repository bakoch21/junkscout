(function () {
  const STORAGE_KEY = "junkscout_privacy_preferences_v1";
  const BANNER_DISMISS_KEY = "junkscout_privacy_banner_dismissed_v1";
  const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 180;
  const ADSENSE_CLIENT = "ca-pub-6737290012723041";
  const ADSENSE_SRC =
    "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=" +
    ADSENSE_CLIENT;
  const CONSENT_MODES = new Set(["pending", "accepted", "rejected", "customized"]);

  const DEFAULT_PREFERENCES = {
    necessary: true,
    analytics: false,
    ads: false,
    personalizedAds: false,
    doNotSellOrShare: false,
    consentMode: "pending",
    updatedAt: "",
  };

  let bannerEl = null;
  let bannerStateEl = null;
  let launcherEl = null;
  let modalRootEl = null;
  let modalEl = null;
  let analyticsToggleEl = null;
  let adsToggleEl = null;
  let doNotSellToggleEl = null;
  let personalizedAdsToggleEl = null;
  let personalizedHintEl = null;
  let gpcNoteEl = null;
  let adsenseLoaded = false;
  let lastFocusEl = null;
  let memoryPreferences = null;
  let bannerDismissedOverride = null;

  function isBrowserGpcEnabled() {
    return Boolean(window.navigator && window.navigator.globalPrivacyControl === true);
  }

  function readCookie(name) {
    try {
      const encodedName = `${encodeURIComponent(name)}=`;
      const parts = String(document.cookie || "").split(/;\s*/);
      for (const part of parts) {
        if (!part || !part.startsWith(encodedName)) continue;
        return decodeURIComponent(part.slice(encodedName.length));
      }
    } catch {
      return "";
    }

    return "";
  }

  function writeCookie(name, value, maxAgeSeconds) {
    try {
      const pieces = [
        `${encodeURIComponent(name)}=${encodeURIComponent(value)}`,
        "Path=/",
        `Max-Age=${maxAgeSeconds}`,
        "SameSite=Lax",
      ];
      if (window.location && window.location.protocol === "https:") {
        pieces.push("Secure");
      }
      document.cookie = pieces.join("; ");
      return true;
    } catch {
      return false;
    }
  }

  function clearCookie(name) {
    writeCookie(name, "", 0);
  }

  function parsePreferences(raw) {
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  }

  function setElementHidden(element, isHidden) {
    if (!element) return;
    element.hidden = isHidden;
    element.style.display = isHidden ? "none" : "";
    element.setAttribute("aria-hidden", isHidden ? "true" : "false");
  }

  function readStoredPreferences() {
    if (memoryPreferences && typeof memoryPreferences === "object") {
      return { ...memoryPreferences };
    }

    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const parsed = parsePreferences(raw);
      if (parsed) {
        memoryPreferences = { ...parsed };
        return parsed;
      }
    } catch {
      // ignore storage failures and try the cookie fallback
    }

    const cookieValue = readCookie(STORAGE_KEY);
    const parsed = parsePreferences(cookieValue);
    if (parsed) {
      memoryPreferences = { ...parsed };
      return parsed;
    }

    return null;
  }

  function writeStoredPreferences(preferences) {
    if (!preferences || typeof preferences !== "object") return;

    memoryPreferences = { ...preferences };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    } catch {
      // ignore storage failures and keep preferences in memory/cookie for the session
    }

    writeCookie(STORAGE_KEY, JSON.stringify(preferences), COOKIE_MAX_AGE_SECONDS);
  }

  function readBannerDismissed() {
    if (typeof bannerDismissedOverride === "boolean") {
      return bannerDismissedOverride;
    }

    try {
      const isDismissed = window.localStorage.getItem(BANNER_DISMISS_KEY) === "1";
      if (isDismissed) {
        bannerDismissedOverride = true;
        return true;
      }
    } catch {
      // ignore storage failures and try the cookie fallback
    }

    const isDismissed = readCookie(BANNER_DISMISS_KEY) === "1";
    if (isDismissed) {
      bannerDismissedOverride = true;
      return true;
    }

    return false;
  }

  function writeBannerDismissed(isDismissed) {
    bannerDismissedOverride = isDismissed;
    try {
      if (isDismissed) {
        window.localStorage.setItem(BANNER_DISMISS_KEY, "1");
      } else {
        window.localStorage.removeItem(BANNER_DISMISS_KEY);
      }
    } catch {
      // ignore storage failures
    }

    if (isDismissed) {
      writeCookie(BANNER_DISMISS_KEY, "1", COOKIE_MAX_AGE_SECONDS);
    } else {
      clearCookie(BANNER_DISMISS_KEY);
    }
  }

  function normalizePreferences(input) {
    const source = input && typeof input === "object" ? input : {};
    const normalized = {
      ...DEFAULT_PREFERENCES,
      analytics: source.analytics === true,
      ads: source.ads === true,
      personalizedAds: source.personalizedAds === true,
      doNotSellOrShare: source.doNotSellOrShare === true,
      consentMode: CONSENT_MODES.has(source.consentMode)
        ? source.consentMode
        : DEFAULT_PREFERENCES.consentMode,
      updatedAt: typeof source.updatedAt === "string" ? source.updatedAt : "",
    };

    if (!normalized.ads) {
      normalized.personalizedAds = false;
    }

    if (normalized.doNotSellOrShare) {
      normalized.personalizedAds = false;
    }

    if (isBrowserGpcEnabled()) {
      normalized.doNotSellOrShare = true;
      normalized.personalizedAds = false;
    }

    return normalized;
  }

  function getPreferences() {
    return normalizePreferences(readStoredPreferences());
  }

  function hasConsentChoice(preferences) {
    return preferences.consentMode !== "pending";
  }

  function shouldShowBanner(preferences) {
    return !hasConsentChoice(preferences) && !readBannerDismissed();
  }

  function shouldShowLauncher(preferences) {
    return hasConsentChoice(preferences) || readBannerDismissed();
  }

  function updateDocumentState(preferences) {
    const root = document.documentElement;
    root.dataset.privacyConsent = preferences.consentMode;
    root.dataset.analyticsConsent = preferences.analytics ? "granted" : "denied";
    root.dataset.adsConsent = preferences.ads ? "granted" : "denied";
    root.dataset.adPersonalization = preferences.personalizedAds ? "granted" : "denied";
    root.dataset.doNotSellOrShare = preferences.doNotSellOrShare ? "true" : "false";
  }

  function configureAdsense(preferences) {
    window.adsbygoogle = window.adsbygoogle || [];
    window.adsbygoogle.pauseAdRequests = preferences.ads ? 0 : 1;
    window.adsbygoogle.requestNonPersonalizedAds =
      preferences.ads && !preferences.personalizedAds ? 1 : 0;
  }

  function loadAdsense() {
    if (adsenseLoaded) return;
    if (document.querySelector("script[data-junkscout-adsense='1']")) {
      adsenseLoaded = true;
      return;
    }

    const script = document.createElement("script");
    script.async = true;
    script.src = ADSENSE_SRC;
    script.crossOrigin = "anonymous";
    script.dataset.junkscoutAdsense = "1";
    document.head.appendChild(script);
    adsenseLoaded = true;
  }

  function notifyConsentChange(preferences) {
    document.dispatchEvent(
      new CustomEvent("junkscout:privacy-consent-changed", {
        detail: { ...preferences },
      })
    );
  }

  function syncModalControls(preferences) {
    if (!modalEl) return;

    analyticsToggleEl.checked = preferences.analytics;
    adsToggleEl.checked = preferences.ads;
    doNotSellToggleEl.checked = preferences.doNotSellOrShare;
    doNotSellToggleEl.disabled = isBrowserGpcEnabled();
    personalizedAdsToggleEl.checked = preferences.personalizedAds;

    const personalizedLocked =
      !preferences.ads || preferences.doNotSellOrShare || isBrowserGpcEnabled();

    personalizedAdsToggleEl.disabled = personalizedLocked;

    if (!preferences.ads) {
      personalizedHintEl.textContent = "Turn on advertising cookies to allow Google ads.";
    } else if (preferences.doNotSellOrShare || isBrowserGpcEnabled()) {
      personalizedHintEl.textContent =
        "Personalized ads stay off while a do-not-sell/share signal is active.";
    } else {
      personalizedHintEl.textContent =
        "If enabled, Google may use cookies or similar signals to personalize ads.";
    }

    gpcNoteEl.hidden = !isBrowserGpcEnabled();
  }

  function updateBannerState(preferences) {
    if (!bannerEl || !bannerStateEl) return;

    setElementHidden(bannerEl, !shouldShowBanner(preferences));

    if (preferences.consentMode === "accepted") {
      bannerStateEl.textContent = "Using analytics cookies and ad cookies.";
      return;
    }

    if (preferences.consentMode === "rejected") {
      bannerStateEl.textContent = "Non-essential cookies are off.";
      return;
    }

    if (preferences.consentMode === "customized") {
      const parts = [];
      parts.push(preferences.analytics ? "analytics on" : "analytics off");
      parts.push(preferences.ads ? "ads on" : "ads off");
      if (preferences.ads) {
        parts.push(preferences.personalizedAds ? "personalized ads on" : "personalized ads off");
      }
      bannerStateEl.textContent = parts.join(" | ");
      return;
    }

    bannerStateEl.textContent = "Choose how analytics and advertising cookies work on JunkScout.";
  }

  function updateLauncherState(preferences) {
    if (!launcherEl) return;

    setElementHidden(launcherEl, !shouldShowLauncher(preferences));

    let label = "Privacy choices";
    if (preferences.consentMode === "accepted") {
      label = "Privacy choices: all on";
    } else if (preferences.consentMode === "rejected") {
      label = "Privacy choices: non-essential off";
    } else if (preferences.consentMode === "customized") {
      label = "Privacy choices: custom";
    }

    launcherEl.textContent = label;
  }

  function applyPreferences(preferences, shouldNotify) {
    updateDocumentState(preferences);
    configureAdsense(preferences);

    if (preferences.ads) {
      loadAdsense();
    }

    updateBannerState(preferences);
    updateLauncherState(preferences);
    syncModalControls(preferences);

    if (shouldNotify) {
      notifyConsentChange(preferences);
    }
  }

  function persistPreferences(nextPreferences) {
    const preferences = normalizePreferences({
      ...getPreferences(),
      ...nextPreferences,
      updatedAt: new Date().toISOString(),
    });

    writeBannerDismissed(false);
    writeStoredPreferences(preferences);
    applyPreferences(preferences, true);
    return preferences;
  }

  function dismissBanner() {
    writeBannerDismissed(true);
    const preferences = getPreferences();
    closeModal();
    setElementHidden(bannerEl, true);
    updateBannerState(preferences);
    updateLauncherState(preferences);
  }

  function openModal() {
    if (!modalRootEl || !modalEl) return;

    lastFocusEl = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    syncModalControls(getPreferences());
    setElementHidden(modalRootEl, false);
    document.body.classList.add("privacy-modal-open");
    modalEl.focus();
  }

  function closeModal() {
    if (!modalRootEl || modalRootEl.hidden) return;

    setElementHidden(modalRootEl, true);
    document.body.classList.remove("privacy-modal-open");
    if (lastFocusEl) {
      lastFocusEl.focus();
    }
  }

  function acceptAll() {
    persistPreferences({
      analytics: true,
      ads: true,
      personalizedAds: !isBrowserGpcEnabled(),
      doNotSellOrShare: isBrowserGpcEnabled(),
      consentMode: "accepted",
    });
    closeModal();
  }

  function rejectNonEssential() {
    persistPreferences({
      analytics: false,
      ads: false,
      personalizedAds: false,
      doNotSellOrShare: true,
      consentMode: "rejected",
    });
    closeModal();
  }

  function saveModalChoices() {
    const adsEnabled = adsToggleEl.checked;
    const doNotSellEnabled = isBrowserGpcEnabled() || doNotSellToggleEl.checked;

    persistPreferences({
      analytics: analyticsToggleEl.checked,
      ads: adsEnabled,
      personalizedAds:
        adsEnabled && personalizedAdsToggleEl.checked && !doNotSellEnabled,
      doNotSellOrShare: doNotSellEnabled,
      consentMode: "customized",
    });
    closeModal();
  }

  function openDoNotSellChoices() {
    openModal();
    if (!doNotSellToggleEl) return;

    if (!isBrowserGpcEnabled()) {
      doNotSellToggleEl.checked = true;
    }

    personalizedAdsToggleEl.checked = false;
    adsToggleEl.checked = true;
    syncModalControls({
      ...getPreferences(),
      ads: true,
      personalizedAds: false,
      doNotSellOrShare: true,
    });
  }

  function buildBanner() {
    bannerEl = document.createElement("aside");
    bannerEl.className = "privacy-banner";
    bannerEl.setAttribute("aria-label", "Cookie and privacy choices");

    bannerEl.innerHTML = [
      '<button type="button" class="privacy-banner__close" aria-label="Dismiss privacy banner" data-privacy-banner-close>&times;</button>',
      '<div class="privacy-banner__copy">',
      "  <strong>Cookies and privacy choices</strong>",
      '  <p>JunkScout uses cookies and similar technologies for analytics and Google advertising. Use these controls to accept, reject, or limit personalized ads. <a class="link" href="/privacy/">See the Privacy Policy</a>.</p>',
      '  <p class="privacy-banner__state" data-privacy-banner-state></p>',
      "</div>",
      '<div class="privacy-banner__actions">',
      '  <button type="button" class="btn btn--primary" data-privacy-accept>Accept all</button>',
      '  <button type="button" class="btn btn--ghost" data-privacy-reject>Reject non-essential</button>',
      '  <button type="button" class="btn btn--ghost" data-privacy-open>Manage choices</button>',
      '  <button type="button" class="btn btn--ghost" data-privacy-banner-close>Close</button>',
      "</div>",
    ].join("");

    bannerStateEl = bannerEl.querySelector("[data-privacy-banner-state]");

    bannerEl
      .querySelector("[data-privacy-accept]")
      .addEventListener("click", acceptAll);
    bannerEl
      .querySelector("[data-privacy-reject]")
      .addEventListener("click", rejectNonEssential);
    bannerEl
      .querySelector("[data-privacy-open]")
      .addEventListener("click", openModal);
    bannerEl
      .querySelectorAll("[data-privacy-banner-close]")
      .forEach((button) => button.addEventListener("click", dismissBanner));

    document.body.appendChild(bannerEl);
  }

  function buildLauncher() {
    launcherEl = document.createElement("button");
    launcherEl.type = "button";
    launcherEl.className = "privacy-launcher";
    launcherEl.setAttribute("aria-label", "Open privacy choices");
    launcherEl.addEventListener("click", openModal);
    document.body.appendChild(launcherEl);
  }

  function buildModal() {
    modalRootEl = document.createElement("div");
    modalRootEl.className = "privacy-modal-root";
    setElementHidden(modalRootEl, true);

    modalRootEl.innerHTML = [
      '<div class="privacy-modal-backdrop" data-privacy-close></div>',
      '<section class="privacy-modal" role="dialog" aria-modal="true" aria-labelledby="privacy-modal-title" tabindex="-1">',
      '  <div class="privacy-modal__head">',
      '    <div>',
      '      <p class="privacy-modal__eyebrow">Privacy controls</p>',
      '      <h2 id="privacy-modal-title">Manage cookies, ads, and US privacy opt-outs</h2>',
      "    </div>",
      '    <button type="button" class="privacy-modal__close" aria-label="Close privacy choices" data-privacy-close>&times;</button>',
      "  </div>",
      '  <p class="privacy-modal__copy">Necessary site storage stays on. Everything else is optional. If you enable advertising cookies, JunkScout may load Google AdSense. Personalized ads stay off whenever a do-not-sell/share signal applies.</p>',
      '  <div class="privacy-toggle-list">',
      '    <label class="privacy-toggle">',
      '      <span class="privacy-toggle__copy"><strong>Necessary storage</strong><small>Required for the site, security, and saving your privacy settings.</small></span>',
      '      <span class="privacy-chip privacy-chip--fixed">Always on</span>',
      "    </label>",
      '    <label class="privacy-toggle" for="privacy-analytics-toggle">',
      '      <span class="privacy-toggle__copy"><strong>Analytics cookies</strong><small>Allow JunkScout to measure page views, clicks, and usage patterns.</small></span>',
      '      <input id="privacy-analytics-toggle" class="privacy-toggle__control" type="checkbox" />',
      "    </label>",
      '    <label class="privacy-toggle" for="privacy-ads-toggle">',
      '      <span class="privacy-toggle__copy"><strong>Advertising cookies</strong><small>Allow Google AdSense code to load on this device.</small></span>',
      '      <input id="privacy-ads-toggle" class="privacy-toggle__control" type="checkbox" />',
      "    </label>",
      '    <label class="privacy-toggle" for="privacy-dns-toggle">',
      '      <span class="privacy-toggle__copy"><strong>Do not sell or share / targeted ads opt-out</strong><small>Use this for California-style opt-outs and similar US state privacy requests.</small></span>',
      '      <input id="privacy-dns-toggle" class="privacy-toggle__control" type="checkbox" />',
      "    </label>",
      '    <label class="privacy-toggle" for="privacy-personalized-toggle">',
      '      <span class="privacy-toggle__copy"><strong>Personalized ads</strong><small data-privacy-personalized-hint>Google may use cookies or similar signals to personalize ads.</small></span>',
      '      <input id="privacy-personalized-toggle" class="privacy-toggle__control" type="checkbox" />',
      "    </label>",
      "  </div>",
      '  <p class="privacy-modal__note" data-privacy-gpc-note hidden>Your browser is sending Global Privacy Control (GPC). JunkScout treats that as a do-not-sell/share signal where supported.</p>',
      '  <div class="privacy-modal__actions">',
      '    <button type="button" class="btn btn--primary" data-privacy-save>Save choices</button>',
      '    <button type="button" class="btn btn--ghost" data-privacy-accept>Accept all</button>',
      '    <button type="button" class="btn btn--ghost" data-privacy-reject>Reject non-essential</button>',
      '    <button type="button" class="btn btn--ghost" data-privacy-close>Close</button>',
      "  </div>",
      '  <div class="privacy-modal__links">',
      '    <a class="link" href="/privacy/">Privacy Policy</a>',
      '    <button type="button" class="privacy-inline-btn" data-privacy-dns>Do Not Sell or Share</button>',
      "  </div>",
      "</section>",
    ].join("");

    modalEl = modalRootEl.querySelector(".privacy-modal");
    analyticsToggleEl = modalRootEl.querySelector("#privacy-analytics-toggle");
    adsToggleEl = modalRootEl.querySelector("#privacy-ads-toggle");
    doNotSellToggleEl = modalRootEl.querySelector("#privacy-dns-toggle");
    personalizedAdsToggleEl = modalRootEl.querySelector("#privacy-personalized-toggle");
    personalizedHintEl = modalRootEl.querySelector("[data-privacy-personalized-hint]");
    gpcNoteEl = modalRootEl.querySelector("[data-privacy-gpc-note]");

    modalRootEl.querySelectorAll("[data-privacy-close]").forEach((button) => {
      button.addEventListener("click", closeModal);
    });

    modalRootEl
      .querySelector("[data-privacy-save]")
      .addEventListener("click", saveModalChoices);
    modalRootEl
      .querySelectorAll("[data-privacy-accept]")
      .forEach((button) => button.addEventListener("click", acceptAll));
    modalRootEl
      .querySelectorAll("[data-privacy-reject]")
      .forEach((button) => button.addEventListener("click", rejectNonEssential));
    modalRootEl
      .querySelector("[data-privacy-dns]")
      .addEventListener("click", () => {
        if (!isBrowserGpcEnabled()) {
          doNotSellToggleEl.checked = true;
        }
        personalizedAdsToggleEl.checked = false;
        adsToggleEl.checked = true;
        syncModalControls({
          ...getPreferences(),
          ads: true,
          personalizedAds: false,
          doNotSellOrShare: true,
        });
      });

    adsToggleEl.addEventListener("change", () => {
      if (!adsToggleEl.checked) {
        personalizedAdsToggleEl.checked = false;
      }
      syncModalControls({
        ...getPreferences(),
        analytics: analyticsToggleEl.checked,
        ads: adsToggleEl.checked,
        personalizedAds: personalizedAdsToggleEl.checked,
        doNotSellOrShare: isBrowserGpcEnabled() || doNotSellToggleEl.checked,
      });
    });

    doNotSellToggleEl.addEventListener("change", () => {
      if (doNotSellToggleEl.checked) {
        personalizedAdsToggleEl.checked = false;
      }
      syncModalControls({
        ...getPreferences(),
        analytics: analyticsToggleEl.checked,
        ads: adsToggleEl.checked,
        personalizedAds: personalizedAdsToggleEl.checked,
        doNotSellOrShare: isBrowserGpcEnabled() || doNotSellToggleEl.checked,
      });
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeModal();
      }
    });

    document.body.appendChild(modalRootEl);
  }

  function bindExternalTriggerButtons() {
    document.querySelectorAll("[data-open-privacy-choices]").forEach((node) => {
      if (!(node instanceof HTMLElement) || node.dataset.privacyBound === "1") return;
      node.dataset.privacyBound = "1";
      node.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        openModal();
      });
    });

    document.querySelectorAll("[data-open-do-not-sell]").forEach((node) => {
      if (!(node instanceof HTMLElement) || node.dataset.privacyBound === "1") return;
      node.dataset.privacyBound = "1";
      node.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        openDoNotSellChoices();
      });
    });
  }

  function eventTargetAsElement(target) {
    if (target instanceof Element) return target;
    if (target instanceof Node && target.parentElement) return target.parentElement;
    return null;
  }

  function wireExternalTriggers() {
    document.addEventListener("click", (event) => {
      const target = eventTargetAsElement(event.target);
      if (!target) return;

      const closeButton = target.closest("[data-privacy-close]");
      if (closeButton) {
        event.preventDefault();
        event.stopPropagation();
        closeModal();
        return;
      }

      const bannerCloseButton = target.closest("[data-privacy-banner-close]");
      if (bannerCloseButton) {
        event.preventDefault();
        event.stopPropagation();
        dismissBanner();
        return;
      }

      const openButton = target.closest("[data-open-privacy-choices]");
      if (openButton) {
        event.preventDefault();
        openModal();
        return;
      }

      const dnsButton = target.closest("[data-open-do-not-sell]");
      if (dnsButton) {
        event.preventDefault();
        openDoNotSellChoices();
      }
    });

    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get("openPrivacyChoices") === "1") {
      openModal();
    }
  }

  function init() {
    if (!document.body) return;

    buildBanner();
    buildLauncher();
    buildModal();
    bindExternalTriggerButtons();
    wireExternalTriggers();

    const preferences = getPreferences();
    applyPreferences(preferences, false);
  }

  window.JunkScoutPrivacy = {
    getPreferences,
    hasConsentChoice: () => hasConsentChoice(getPreferences()),
    canTrackAnalytics: () => getPreferences().analytics,
    canLoadAds: () => getPreferences().ads,
    canPersonalizeAds: () => getPreferences().ads && getPreferences().personalizedAds,
    isGlobalPrivacyControlEnabled: isBrowserGpcEnabled,
    openPreferences: openModal,
    openDoNotSellChoices,
    acceptAll,
    rejectNonEssential,
    savePreferences: persistPreferences,
  };

  init();
})();
