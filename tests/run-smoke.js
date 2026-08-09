const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const tmpDir = path.join(repoRoot, "test-temp");

function clean() {
  if (fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  // remove any uploaded markers
  const files = fs.readdirSync(repoRoot);
  for (const f of files) {
    if (f.endsWith(".uploaded.txt")) fs.unlinkSync(path.join(repoRoot, f));
  }
}

async function main() {
  clean();
  fs.mkdirSync(tmpDir, { recursive: true });
  const sampleFile = path.join(tmpDir, "hello.txt");
  fs.writeFileSync(sampleFile, "hello world");

  console.log("Running smoke test (TEST_MODE=1)...");
  const env = Object.assign({}, process.env, {
    INPUT_PATH: sampleFile,
    TEST_MODE: "1",
  });

  const res = spawnSync("node", ["index.js"], {
    cwd: repoRoot,
    env,
    stdio: "inherit",
  });
  if (res.error) {
    console.error("Error running index.js", res.error);
    process.exit(1);
  }
  if (res.status !== 0) {
    console.error("index.js exited with", res.status);
    process.exit(res.status || 1);
  }

  const uploadedMarker = path.join(repoRoot, "hello.txt.uploaded.txt");
  if (!fs.existsSync(uploadedMarker)) {
    console.error("Expected uploaded marker not found:", uploadedMarker);
    process.exit(2);
  }

  console.log("Smoke test passed. Uploaded marker found:", uploadedMarker);
  clean();
}

main();
