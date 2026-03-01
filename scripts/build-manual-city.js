const { spawnSync } = require("child_process");

const STATE = String(process.argv[2] || "").trim().toLowerCase();
const CITY = String(process.argv[3] || "").trim().toLowerCase();

if (!STATE || !CITY) {
  console.error("Usage: node scripts/build-manual-city.js <state> <city>");
  process.exit(1);
}

function runStep(label, cmd, args) {
  console.log(`\n[${label}] ${cmd} ${args.join(" ")}`);
  const result = spawnSync(cmd, args, { stdio: "inherit", shell: false });
  if (result.status !== 0) process.exit(result.status || 1);
}

function run() {
  runStep("1/6", "node", ["scripts/build-manual-facilities.js", STATE, CITY]);
  runStep("2/6", "node", ["scripts/generate-state-hubs.js"]);
  runStep("3/6", "node", ["scripts/generate-city-pages.js", STATE, CITY]);
  runStep("4/6", "node", ["scripts/generate-facility-pages.js", STATE, "--city", CITY]);
  runStep("5/6", "node", ["scripts/prune-generated-pages.js", "--apply"]);
  runStep("6/6", "node", ["scripts/generate-sitemap.js"]);

  console.log(`\n${STATE}/${CITY} build completed.`);
}

run();
