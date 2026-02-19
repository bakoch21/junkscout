const { spawnSync } = require("child_process");

function runStep(label, cmd, args) {
  console.log(`\n[${label}] ${cmd} ${args.join(" ")}`);
  const result = spawnSync(cmd, args, { stdio: "inherit", shell: false });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function run() {
  runStep("1/4", "node", ["scripts/build-manual-facilities.js", "texas", "dallas"]);
  runStep("2/4", "node", ["scripts/generate-city-pages.js", "texas", "dallas"]);
  runStep("3/4", "node", ["scripts/generate-facility-pages.js", "texas", "--city", "dallas"]);
  runStep("4/4", "node", ["scripts/generate-sitemap.js"]);

  console.log("\nDallas build completed.");
}

run();
