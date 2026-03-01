const { spawnSync } = require("child_process");

function runStep(label, cmd, args) {
  console.log(`\n[${label}] ${cmd} ${args.join(" ")}`);
  const result = spawnSync(cmd, args, { stdio: "inherit", shell: false });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function run() {
  runStep("1/6", "node", ["scripts/build-manual-facilities.js", "georgia", "atlanta"]);
  runStep("2/6", "node", ["scripts/generate-state-hubs.js"]);
  runStep("3/6", "node", ["scripts/generate-city-pages.js", "georgia", "atlanta"]);
  runStep("4/6", "node", ["scripts/generate-facility-pages.js", "georgia", "--city", "atlanta"]);
  runStep("5/6", "node", ["scripts/prune-generated-pages.js", "--apply"]);
  runStep("6/6", "node", ["scripts/generate-sitemap.js"]);

  console.log("\nAtlanta build completed.");
}

run();
