const { spawnSync } = require("child_process");

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, {
    stdio: opts.capture ? "pipe" : "inherit",
    shell: false,
    encoding: "utf-8",
  });

  if (result.status !== 0) {
    if (opts.capture && result.stderr) process.stderr.write(result.stderr);
    process.exit(result.status || 1);
  }

  return result;
}

function gitStatusPorcelain() {
  const result = run("git", ["status", "--porcelain"], { capture: true });
  return String(result.stdout || "").trim();
}

function runMain() {
  const message = process.argv.slice(2).join(" ").trim();
  const initialStatus = gitStatusPorcelain();

  if (!initialStatus) {
    console.log("No local changes to commit. Running git push only.");
    run("git", ["push"]);
    return;
  }

  if (!message) {
    console.error("Usage: npm run push -- \"your commit message\"");
    process.exit(1);
  }

  run("git", ["add", "-A"]);

  const afterAddStatus = gitStatusPorcelain();
  if (!afterAddStatus) {
    console.log("No staged changes after git add. Running git push only.");
    run("git", ["push"]);
    return;
  }

  run("git", ["commit", "-m", message]);
  run("git", ["push"]);

  console.log("Push complete.");
}

runMain();
