// houston-modal.js
// Lightweight, SEO-safe modal shown only on user interaction.
// Works in two modes:
//
// A) If #houstonRulesBtn exists in the DOM:
//    - It will auto-bind click -> open modal
//    - It will show/hide based on window.__isHoustonFacility (set by facility.js)
//
// B) Optional API mode (unchanged):
//    HoustonRulesModal.mountButton({ container, isHouston })
//
// This keeps your integration simple and avoids touching generators.

(function () {
  const LINKS = [
    {
      label: "Neighborhood depositories & recycling centers",
      url: "https://www.houstontx.gov/solidwaste/dropoff.html",
    },
    {
      label: "Environmental Service Centers (household hazardous waste)",
      url: "https://www.houstontx.gov/solidwaste/esc.html",
    },
    {
      label: "Recycling locations & map",
      url: "https://www.houstontx.gov/solidwaste/recycling_map.html",
    },
  ];

  const OFFICIAL_SOURCE = "https://www.houstontx.gov/solidwaste/";

  function escapeHtml(str = "") {
    return String(str).replace(/[&<>"']/g, (m) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    }[m]));
  }

  function injectStylesOnce() {
    if (document.getElementById("houstonRulesModalStyles")) return;

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
        display:flex;
        gap:10px;
        align-items:flex-start;
      }
      .hrm-tip-ic{
        width:28px; height:28px;
        border-radius:10px;
        display:flex; align-items:center; justify-content:center;
        background:#fff;
        border:1px solid rgba(0,0,0,.06);
        flex:0 0 auto;
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

      /* Button style (only used in API mount mode) */
      .hrm-btn{
        display:inline-flex;
        align-items:center;
        gap:8px;
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
    style.id = "houstonRulesModalStyles";
    style.textContent = css;
    document.head.appendChild(style);
  }

  function buildModal() {
    injectStylesOnce();

    const backdrop = document.createElement("div");
    backdrop.className = "hrm-backdrop";
    backdrop.setAttribute("role", "dialog");
    backdrop.setAttribute("aria-modal", "true");
    backdrop.setAttribute("aria-label", "Houston rules and fees");

    const modal = document.createElement("div");
    modal.className = "hrm-modal";

    modal.innerHTML = `
      <div class="hrm-head">
        <div>
          <h3 class="hrm-title">How dumping works in Houston</h3>
          <p class="hrm-sub">Quick, plain-language rules people usually need before driving out.</p>
        </div>
        <button class="hrm-close" type="button" aria-label="Close">×</button>
      </div>

      <div class="hrm-body">
        <ul class="hrm-bullets">
          <li><strong>Some sites are free</strong> for Houston residents (ID required).</li>
          <li><strong>Private landfills / transfer stations</strong> typically charge a fee.</li>
          <li><strong>City-run sites</strong> may reject commercial loads.</li>
          <li><strong>Accepted materials vary</strong> (trash, heavy trash, recycling, hazardous waste).</li>
        </ul>

        <div class="hrm-tip">
          <div class="hrm-tip-ic">💡</div>
          <div>
            <strong>Tip</strong>
            <p>For city-run sites, call <strong>3-1-1</strong> to confirm rules, hours, and what’s accepted.</p>
          </div>
        </div>

        <div class="hrm-links">
          <a href="${escapeHtml(OFFICIAL_SOURCE)}" target="_blank" rel="noopener">Official source →</a>
        </div>

        <div class="hrm-sub" style="margin-top:10px">More official links:</div>
        <ul class="hrm-more">
          ${LINKS.map(
            (l) => `
            <li><a href="${escapeHtml(l.url)}" target="_blank" rel="noopener">${escapeHtml(
              l.label
            )}</a></li>
          `
          ).join("")}
        </ul>
      </div>

      <div class="hrm-foot">
        Based on City of Houston guidance. Always confirm before visiting.
      </div>
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

  /**
   * API mount mode (optional).
   * If you ever want to mount the button into a container dynamically.
   */
  function mountButton({ container, isHouston }) {
    if (!container) return;
    if (!isHouston) return;

    injectStylesOnce();

    if (container.querySelector("[data-hrm-btn='1']")) return;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "hrm-btn";
    btn.setAttribute("data-hrm-btn", "1");
    btn.textContent = "Houston rules & fees";
    btn.addEventListener("click", buildModal);

    container.appendChild(btn);
  }

/**
 * Auto-bind mode:
 * If the template includes #houstonRulesBtn, we bind it on the Houston city page
 * and auto-open the modal once per browser.
 */
function bindExistingButtonIfPresent() {
  const btn = document.getElementById("houstonRulesBtn");
  if (!btn) return;

  injectStylesOnce();

  // Avoid double-binding
  if (btn.__hrmBound) return;
  btn.__hrmBound = true;

  const isHoustonCity =
    location.pathname === "/texas/houston/" ||
    location.pathname === "/texas/houston";

  // Only show on Houston city page
  btn.style.display = isHoustonCity ? "inline-flex" : "none";

  btn.addEventListener("click", buildModal);

  // Auto-open once on first visit to Houston city page
  if (isHoustonCity && !localStorage.getItem("hrm_seen_houston_city")) {
    localStorage.setItem("hrm_seen_houston_city", "1");
    setTimeout(buildModal, 600);
  }
}

// Expose API
window.HoustonRulesModal = { mountButton, open: buildModal };

// Run after DOM is ready (template uses defer, but safe either way)
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bindExistingButtonIfPresent);
} else {
  bindExistingButtonIfPresent();
}
})();