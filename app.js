const MAX_ITEMS = 5;

const itemInput = document.getElementById("itemInput");
const addItemBtn = document.getElementById("addItemBtn");
const chipRow = document.getElementById("chipRow");
const yearEl = document.getElementById("year");

const toggleFilters = document.getElementById("toggleFilters");
const filtersPanel = document.getElementById("filtersPanel");

const searchBtn = document.getElementById("searchBtn");
const ctaStart = document.getElementById("ctaStart");

let items = [];

function renderChips(){
  chipRow.innerHTML = "";
  items.forEach((t, idx) => {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.innerHTML = `${escapeHtml(t)} <button aria-label="Remove ${escapeHtml(t)}" data-i="${idx}">×</button>`;
    chipRow.appendChild(chip);
  });
}

function addItem(){
  const raw = (itemInput.value || "").trim();
  if(!raw) return;

  if(items.length >= MAX_ITEMS){
    alert(`Max ${MAX_ITEMS} items for now.`);
    itemInput.value = "";
    return;
  }

  const normalized = raw.toLowerCase();
  if(items.map(x => x.toLowerCase()).includes(normalized)){
    itemInput.value = "";
    return;
  }

  items.push(raw);
  itemInput.value = "";
  renderChips();
}

function escapeHtml(str){
  return str.replace(/[&<>"']/g, (m) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[m]));
}

addItemBtn.addEventListener("click", addItem);
itemInput.addEventListener("keydown", (e) => {
  if(e.key === "Enter"){
    e.preventDefault();
    addItem();
  }
});

chipRow.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-i]");
  if(!btn) return;
  const idx = Number(btn.getAttribute("data-i"));
  items.splice(idx, 1);
  renderChips();
});

toggleFilters.addEventListener("click", () => {
  const isHidden = filtersPanel.hasAttribute("hidden");
  if(isHidden){
    filtersPanel.removeAttribute("hidden");
    toggleFilters.textContent = "Hide filters";
  } else {
    filtersPanel.setAttribute("hidden", "");
    toggleFilters.textContent = "More filters";
  }
});

// For now, just demo the flow
function runSearch(){
  const where = document.getElementById("whereInput").value.trim();
  const load = document.getElementById("loadSelect").value;
  const openNow = document.getElementById("openNow").checked;
  const residentOnly = document.getElementById("residentOnly").checked;
  const mixedLoads = document.getElementById("mixedLoads").checked;

  if(items.length === 0){
    alert("Add at least one item (e.g., couch, tires, construction debris).");
    return;
  }
  if(!where){
    alert("Enter a location (e.g., Austin, TX) or use your location.");
    return;
  }

  alert(
    `Searching near: ${where}\n` +
    `Items: ${items.join(", ")}\n` +
    `Load: ${load || "n/a"}\n` +
    `Open now: ${openNow}\nResident-only: ${residentOnly}\nMixed loads: ${mixedLoads}\n\n` +
    `Next step: build results page (search.html) and pass these as URL params.`
  );
}

searchBtn.addEventListener("click", runSearch);
ctaStart.addEventListener("click", () => {
  itemInput.focus();
});

document.getElementById("useLocationBtn").addEventListener("click", () => {
  if(!navigator.geolocation){
    alert("Geolocation not supported in this browser.");
    return;
  }
  navigator.geolocation.getCurrentPosition(
    () => {
      alert("Got your location. Next we’ll reverse-geocode to a city/state (free option: OpenStreetMap Nominatim).");
    },
    () => alert("Couldn’t access location. You can type a city/state instead.")
  );
});

yearEl.textContent = new Date().getFullYear();
renderChips();
