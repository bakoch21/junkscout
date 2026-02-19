// houston-modal.js
// City rules modal for Houston + Dallas.
// Kept under the same filename to avoid template churn.

(function () {
  const PROFILES = {
    houston: {
      key: "houston",
      buttonLabel: "Houston rules & fees",
      title: "How dumping works in Houston",
      subhead: "Quick, plain-language rules people usually need before driving out.",
      bullets: [
        "Some sites are free for Houston residents with valid ID and proof of address.",
        "Private landfills and transfer stations typically charge by load or weight.",
        "City-run sites may reject commercial loads.",
        "Accepted materials vary by site and can change without notice."
      ],
      tipTitle: "Tip",
      tipBody: "Call 3-1-1 to confirm rules, hours, and accepted materials before driving.",
      sourceLabel: "Official source",
      sourceUrl: "https://www.houstontx.gov/solidwaste/",
      links: [
        {
          label: "Neighborhood depositories and recycling centers",
          url: "https://www.houstontx.gov/solidwaste/dropoff.html"
        },
        {
          label: "Environmental Service Centers (household hazardous waste)",
          url: "https://www.houstontx.gov/solidwaste/esc.html"
        },
        {
          label: "Recycling locations and map",
          url: "https://www.houstontx.gov/solidwaste/recycling_map.html"
        }
      ],
      footer: "Based on City of Houston guidance. Always confirm before visiting."
    },
    dallas: {
      key: "dallas",
      buttonLabel: "Dallas rules & fees",
      title: "How dumping works in Dallas",
      subhead: "Quick rules to help you choose the right site before you load up.",
      bullets: [
        "Dallas has both city and private disposal options with different rules.",
        "Transfer stations and landfills usually charge based on material and load size.",
        "Some city services are resident-focused and may require proof of address.",
        "Accepted and rejected materials can differ across locations."
      ],
      tipTitle: "Tip",
      tipBody: "Call 3-1-1 before driving to confirm current hours and eligibility.",
      sourceLabel: "Official source",
      sourceUrl: "https://dallascityhall.com/departments/sanitation/Pages/default.aspx",
      links: [
        {
          label: "Dallas Sanitation and Services",
          url: "https://dallascityhall.com/departments/sanitation/Pages/default.aspx"
        },
        {
          label: "Dallas electronics recycling information",
          url: "https://dallascityhall.com/departments/sanitation/Pages/electronic_waste.aspx"
        }
      ],
      footer: "Based on City of Dallas guidance. Always confirm before visiting."
    }
  };

  const CITY_PATH_TO_PROFILE = {
    "/texas/houston": "houston",
    "/texas/dallas": "dallas"
  };

  function escapeHtml(str = "") {
    return String(str).replace(/[&<>"']/g, (m) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[m]));
  }

  function normalizePath(pathname = "") {
    const p = String(pathname || "").trim().toLowerCase();
    if (!p) return "/";
    const clean = p.replace(/\/+$/, "");
    return clean || "/";
  }

  function profileKeyFromCurrentPath() {
    const key = CITY_PATH_TO_PROFILE[normalizePath(window.location.pathname)];
    return key || "";
  }

  function getProfileByKey(profileKey) {
    return PROFILES[String(profileKey || "").toLowerCase()] || null;
  }

  function resolveActiveProfile() {
    const cityProfile = getProfileByKey(profileKeyFromCurrentPath());
    if (cityProfile) return cityProfile;

    if (window.__isHoustonFacility) return PROFILES.houston;
    if (window.__isDallasFacility) return PROFILES.dallas;
    return null;
  }

  function injectStylesOnce() {
    if (document.getElementById("cityRulesModalStyles")) return;

    const css = `
      .hrm-backdrop{
        position:fixed; inset:0;
        background:rgba(17,24,39,.45);
        backdrop-filter: blur(2px);
        display:flex;
        align-items:flex-end;
        justify-content:center;
        padding:18px;
        z-index:9999;
      }
      @media (min-width:720px){
        .hrm-backdrop{ align-items:center; }
      }
      .hrm-modal{
        width:min(520px, 100%);
        background:#fff;
        border-radius:18px;
        box-shadow: 0 20px 60px rgba(0,0,0,.25);
        border:1px solid rgba(0,0,0,.06);
        overflow:hidden;
      }
      .hrm-head{
        display:flex;
        align-items:flex-start;
        justify-content:space-between;
        gap:12px;
        padding:16px 16px 10px;
      }
      .hrm-title{
        margin:0;
        font-size:18px;
        letter-spacing:-.2px;
        line-height:1.2;
      }
      .hrm-sub{
        margin:6px 0 0;
        font-size:13px;
        color:#6b7280;
        line-height:1.45;
      }
      .hrm-close{
        border:0;
        background:transparent;
        cursor:pointer;
        padding:6px 8px;
        border-radius:10px;
        font-size:18px;
        line-height:1;
        color:#6b7280;
      }
      .hrm-close:hover{ background:rgba(0,0,0,.05); color:#111827; }
      .hrm-body{ padding:0 16px 16px; }
      .hrm-bullets{
        margin:10px 0 0;
        padding-left:18px;
      }
      .hrm-bullets li{
        margin:8px 0;
        color:#111827;
        font-size:14px;
        line-height:1.45;
      }
      .hrm-tip{
        margin-top:12px;
        border:1px solid rgba(0,0,0,.06);
        background:rgba(46,110,166,.08);
        border-radius:14px;
        padding:12px;
      }
      .hrm-tip strong{ display:block; font-size:13px; margin-bottom:2px; }
      .hrm-tip p{
        margin:0;
        font-size:13px;
        color:#374151;
        line-height:1.45;
      }
      .hrm-links{
        margin-top:12px;
        font-size:13px;
      }
      .hrm-links a{
        color:#1f4f7a;
        text-decoration:none;
        font-weight:700;
      }
      .hrm-links a:hover{ text-decoration:underline; }
      .hrm-more{
        margin:10px 0 0;
        padding-left:18px;
      }
      .hrm-more li{ margin:8px 0; font-size:13px; }
      .hrm-more a{
        color:#1f4f7a;
        text-decoration:none;
        font-weight:600;
      }
      .hrm-more a:hover{ text-decoration:underline; }
      .hrm-foot{
        padding:12px 16px 16px;
        font-size:12px;
        color:#6b7280;
        line-height:1.35;
      }
      .hrm-btn{
        display:inline-flex;
        align-items:center;
        border:1px solid rgba(0,0,0,.08);
        background:rgba(46,110,166,.10);
        color:#1e4f7a;
        padding:9px 12px;
        border-radius:12px;
        font-weight:800;
        font-size:13px;
        cursor:pointer;
      }
      .hrm-btn:hover{
        background:rgba(46,110,166,.14);
        border-color:rgba(46,110,166,.25);
      }
    `.trim();

    const style = document.createElement("style");
    style.id = "cityRulesModalStyles";
    style.textContent = css;
    document.head.appendChild(style);
  }

  function buildModal(profile) {
    if (!profile) return;
    injectStylesOnce();

    const backdrop = document.createElement("div");
    backdrop.className = "hrm-backdrop";
    backdrop.setAttribute("role", "dialog");
    backdrop.setAttribute("aria-modal", "true");
    backdrop.setAttribute("aria-label", `${profile.title} rules and fees`);

    const modal = document.createElement("div");
    modal.className = "hrm-modal";

    const bullets = (Array.isArray(profile.bullets) ? profile.bullets : [])
      .map((line) => `<li>${escapeHtml(line)}</li>`)
      .join("");

    const links = (Array.isArray(profile.links) ? profile.links : [])
      .map((item) => {
        const label = escapeHtml(item?.label || "");
        const url = escapeHtml(item?.url || "#");
        return `<li><a href="${url}" target="_blank" rel="noopener">${label}</a></li>`;
      })
      .join("");

    modal.innerHTML = `
      <div class="hrm-head">
        <div>
          <h3 class="hrm-title">${escapeHtml(profile.title)}</h3>
          <p class="hrm-sub">${escapeHtml(profile.subhead)}</p>
        </div>
        <button class="hrm-close" type="button" aria-label="Close">x</button>
      </div>

      <div class="hrm-body">
        <ul class="hrm-bullets">${bullets}</ul>

        <div class="hrm-tip">
          <strong>${escapeHtml(profile.tipTitle || "Tip")}</strong>
          <p>${escapeHtml(profile.tipBody || "")}</p>
        </div>

        <div class="hrm-links">
          <a href="${escapeHtml(profile.sourceUrl || "#")}" target="_blank" rel="noopener">
            ${escapeHtml(profile.sourceLabel || "Official source")} ->
          </a>
        </div>

        <div class="hrm-sub" style="margin-top:10px">More official links:</div>
        <ul class="hrm-more">${links}</ul>
      </div>

      <div class="hrm-foot">${escapeHtml(profile.footer || "")}</div>
    `;

    backdrop.appendChild(modal);

    function close() {
      document.removeEventListener("keydown", onKey);
      backdrop.remove();
    }

    function onKey(e) {
      if (e.key === "Escape") close();
    }

    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) close();
    });
    modal.querySelector(".hrm-close")?.addEventListener("click", close);
    document.addEventListener("keydown", onKey);
    document.body.appendChild(backdrop);
    modal.querySelector(".hrm-close")?.focus();
  }

  function mountButton({ container, isHouston, isDallas, profileKey } = {}) {
    if (!container) return;

    const resolved =
      getProfileByKey(profileKey) ||
      (isDallas ? PROFILES.dallas : null) ||
      (isHouston ? PROFILES.houston : null);
    if (!resolved) return;

    injectStylesOnce();
    if (container.querySelector("[data-hrm-btn='1']")) return;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "hrm-btn";
    btn.setAttribute("data-hrm-btn", "1");
    btn.textContent = resolved.buttonLabel;
    btn.addEventListener("click", () => buildModal(resolved));
    container.appendChild(btn);
  }

  function bindExistingButtonIfPresent() {
    const btn = document.getElementById("houstonRulesBtn") || document.getElementById("cityRulesBtn");
    if (!btn) return;
    if (btn.__hrmBound) return;
    btn.__hrmBound = true;

    const profile = resolveActiveProfile();
    if (!profile) {
      btn.style.display = "none";
      return;
    }

    injectStylesOnce();
    btn.textContent = profile.buttonLabel;
    btn.style.display = "inline-flex";
    btn.addEventListener("click", () => buildModal(profile));

    const activeCityProfile = getProfileByKey(profileKeyFromCurrentPath());
    if (!activeCityProfile) return;

    const seenKey = `hrm_seen_${activeCityProfile.key}_city`;
    if (!localStorage.getItem(seenKey)) {
      localStorage.setItem(seenKey, "1");
      setTimeout(() => buildModal(activeCityProfile), 600);
    }
  }

  window.HoustonRulesModal = {
    mountButton,
    open(profileKey = "") {
      const profile = getProfileByKey(profileKey) || resolveActiveProfile();
      buildModal(profile);
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindExistingButtonIfPresent);
  } else {
    bindExistingButtonIfPresent();
  }
})();
