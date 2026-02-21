const { spawnSync } = require("child_process");

function runStep(label, cmd, args) {
  console.log(`\n[${label}] ${cmd} ${args.join(" ")}`);
  const result = spawnSync(cmd, args, { stdio: "inherit", shell: false });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function run() {
  runStep("1/5", "node", ["scripts/build-manual-facilities.js", "texas", "san-antonio"]);
  runStep("2/5", "node", ["scripts/generate-city-pages.js", "texas", "san-antonio"]);
  runStep("3/5", "node", ["scripts/generate-facility-pages.js", "texas", "--city", "san-antonio"]);
  runStep("4/5", "node", ["scripts/prune-generated-pages.js", "--apply"]);
  runStep("5/5", "node", ["scripts/generate-sitemap.js"]);

  console.log("\nSan Antonio build completed.");
}

run();
