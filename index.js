#!/usr/bin/env node
"use strict";

const core = require("@actions/core");
const { statSync, globSync, writeFileSync } = require("node:fs");
const { basename, resolve } = require("node:path");

const getInput = (n) =>
  (process.env[`INPUT_${n.replace(/ /g, "_").toUpperCase()}`] || "").trim();
const warning = (m) => core.warning(m);
const notice = (m) => core.notice(m);
function fail(m) {
  throw new Error(m);
}

function setOutput(name, value) {
  core.setOutput(name, value);
}

function splitPatterns(s) {
  return s
    .split(/[\s,\n]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function artifactName(file, prefix) {
  const name = basename(file);
  return prefix ? `${prefix}-${name}` : name;
}

async function main() {
  const pathInput = getInput("path") || getInput("source");
  if (!pathInput) fail('input "path" is required');

  const retentionDays = parseInt(getInput("retention-days"), 10) || 0;
  const overwrite = getInput("overwrite") === "true";
  const ifNone = getInput("if-no-files-found") || "warn";
  const prefix = getInput("artifact-prefix") || "";
  const { DefaultArtifactClient } = await import("@actions/artifact");
  const client =
    process.env.TEST_MODE === "1"
      ? {
          uploadArtifact: async (name, files) => {
            const marker = resolve(process.cwd(), `${name}.uploaded.txt`);
            writeFileSync(marker, files.join("\n"));
            return { id: Number(String(name).length), size: files.length };
          },
          deleteArtifact: async () => ({ id: 0 }),
        }
      : new DefaultArtifactClient();

  const patterns = splitPatterns(pathInput);
  const files = [...new Set(patterns.flatMap((p) => globSync(p)))].filter(
    (f) => {
      try {
        return statSync(f).isFile();
      } catch {
        return false;
      }
    },
  );

  if (!files.length) {
    const msg = `no files matched: ${patterns.join(", ")}`;
    if (ifNone === "error") fail(msg);
    if (ifNone === "warn") warning(msg);
    setOutput("artifacts", "[]");
    setOutput("volumes", "0");
    setOutput("uploaded-artifacts", "");
    return;
  }

  const jobs = new Map();
  for (const f of files) {
    const name = artifactName(f, prefix);
    if (jobs.has(name)) {
      fail(
        `two inputs map to the same artifact name "${name}": ${jobs.get(name).file} and ${f}`,
      );
    }
    jobs.set(name, { file: f, size: statSync(f).size });
  }

  const results = [];
  for (const [name, { file, size }] of jobs) {
    if (overwrite && typeof client.deleteArtifact === "function") {
      await client.deleteArtifact(name);
    }
    const r = await client.uploadArtifact(name, [resolve(file)], {
      retentionDays,
      compressionLevel: 0,
    });
    notice(`uploaded '${name}' (id ${r.id}, ${r.size || size} bytes)`);
    results.push({ name: r.name || name, id: Number(r.id), size });
  }

  setOutput("artifacts", JSON.stringify(results));
  setOutput("volumes", String(results.length));
  setOutput("uploaded-artifacts", results.map((item) => item.name).join(","));
}

main().catch((e) => fail(e && e.stack ? e.stack : String(e)));
