#!/usr/bin/env node
"use strict";

const {
  statSync,
  globSync,
  writeFileSync,
  createReadStream,
  createWriteStream,
  appendFileSync,
  unlinkSync,
} = require("node:fs");
const { basename, resolve } = require("node:path");
const { createHash } = require("node:crypto");
const https = require("node:https");
const { createGzip } = require("node:zlib");
const { pipeline } = require("node:stream/promises");

const SERVICE = "github.actions.results.api.v1.ArtifactService";

const getInput = (n) =>
  (process.env[`INPUT_${n.replace(/ /g, "_").toUpperCase()}`] || "").trim();
const warning = (m) => console.log(`::warning::${m}`);
const notice = (m) => console.log(`::notice::${m}`);
function fail(m) {
  throw new Error(m);
}

function setOutput(name, value) {
  const file = process.env.GITHUB_OUTPUT;
  if (!file) return;
  const delimiter = `ghadelim_${Math.random().toString(36).slice(2)}`;
  appendFileSync(file, `${name}<<${delimiter}\n${value}\n${delimiter}\n`);
}

function backend() {
  const url = (process.env.ACTIONS_RESULTS_URL || "").replace(/\/+$/, "");
  const token = process.env.ACTIONS_RUNTIME_TOKEN || "";
  if (!url || !token) {
    fail(
      "ACTIONS_RESULTS_URL / ACTIONS_RUNTIME_TOKEN are unset; this action only runs inside a GitHub Actions job",
    );
  }
  const claims = JSON.parse(
    Buffer.from(token.split(".")[1], "base64url").toString(),
  );
  const scope = claims.scp
    .split(" ")
    .find((s) => s.startsWith("Actions.Results:"))
    .split(":");
  return { url, token, run: scope[1], job: scope[2] };
}

async function twirp(be, method, body) {
  const res = await fetch(`${be.url}/twirp/${SERVICE}/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${be.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (res.status !== 200) {
    fail(`${method} returned HTTP ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

async function deleteIfExists(be, name) {
  const list = await twirp(be, "ListArtifacts", {
    workflowRunBackendId: be.run,
    workflowJobRunBackendId: be.job,
    nameFilter: name,
  });
  if (!(list.artifacts || []).length) return;
  await twirp(be, "DeleteArtifact", {
    workflowRunBackendId: be.run,
    workflowJobRunBackendId: be.job,
    name,
  });
}

function putBlob(url, file, size) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const req = https.request(
      url,
      {
        method: "PUT",
        headers: {
          "x-ms-blob-type": "BlockBlob",
          "x-ms-version": "2023-11-03",
          "Content-Type": "application/octet-stream",
          "Content-Length": size,
        },
      },
      (res) => {
        let body = "";
        res.on("data", (d) => (body += d));
        res.on("end", () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(hash.digest("hex"));
          } else {
            reject(new Error(`blob PUT HTTP ${res.statusCode}: ${body}`));
          }
        });
      },
    );
    req.on("error", reject);
    const rs = createReadStream(file);
    rs.on("error", reject);
    rs.on("data", (c) => hash.update(c));
    rs.pipe(req);
  });
}

async function uploadRawArtifact(be, name, file, size, retentionDays) {
  const create = {
    workflowRunBackendId: be.run,
    workflowJobRunBackendId: be.job,
    name,
    version: 4,
    archive: false,
  };
  if (retentionDays > 0) {
    create.expiresAt = new Date(Date.now() + retentionDays * 86400000)
      .toISOString()
      .replace(/\.\d+Z$/, "Z");
  }

  const created = await twirp(be, "CreateArtifact", create);
  if (!created.ok) {
    fail(
      `CreateArtifact rejected '${name}' (does it already exist? try overwrite: true)`,
    );
  }
  if (!created.signed_upload_url) {
    fail(
      `CreateArtifact gave no upload URL for '${name}'; response keys: ${Object.keys(created).join(", ")}`,
    );
  }

  const sha = await putBlob(created.signed_upload_url, file, size);

  const fin = await twirp(be, "FinalizeArtifact", {
    workflowRunBackendId: be.run,
    workflowJobRunBackendId: be.job,
    name,
    size: String(size),
    hash: `sha256:${sha}`,
  });
  if (!fin.ok) fail(`FinalizeArtifact rejected '${name}'`);

  return { name, id: Number(fin.artifact_id), size };
}

async function gzipFile(sourceFile, targetFile) {
  await pipeline(
    createReadStream(sourceFile),
    createGzip(),
    createWriteStream(targetFile),
  );
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

  const retentionDays = parseInt(getInput("retention-days"), 10) || 3;
  const overwrite = getInput("overwrite") === "true";
  const archive = getInput("archive") === "true";
  const ifNone = getInput("if-no-files-found") || "warn";
  const prefix = getInput("artifact-prefix") || "";
  const testMode = process.env.TEST_MODE === "1";
  const client = archive
    ? testMode
      ? {
          uploadArtifact: async (name, files) => {
            const marker = resolve(process.cwd(), `${name}.uploaded.txt`);
            writeFileSync(marker, files.join("\n"));
            return { id: Number(String(name).length), size: files.length };
          },
          deleteArtifact: async () => ({ id: 0 }),
        }
      : new (await import("@actions/artifact")).DefaultArtifactClient()
    : null;

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
    let r;
    if (archive) {
      if (testMode) {
        const marker = resolve(process.cwd(), `${name}.uploaded.txt`);
        writeFileSync(marker, resolve(file));
        r = { id: Number(String(name).length), size };
      } else {
        const compressedFile = resolve(process.cwd(), `${name}.gz`);
        await gzipFile(resolve(file), compressedFile);
        const compressedSize = statSync(compressedFile).size;
        const be = backend();
        if (overwrite) await deleteIfExists(be, name);
        r = await uploadRawArtifact(
          be,
          name,
          compressedFile,
          compressedSize,
          retentionDays,
        );
        unlinkSync(compressedFile);
      }
    } else {
      if (testMode) {
        const marker = resolve(process.cwd(), `${name}.uploaded.txt`);
        writeFileSync(marker, resolve(file));
        r = { id: Number(String(name).length), size };
      } else {
        const be = backend();
        if (overwrite) await deleteIfExists(be, name);
        r = await uploadRawArtifact(
          be,
          name,
          resolve(file),
          size,
          retentionDays,
        );
      }
    }
    notice(`uploaded '${name}' (id ${r.id}, ${r.size || size} bytes)`);
    results.push({ name: r.name || name, id: Number(r.id), size });
  }

  setOutput("artifacts", JSON.stringify(results));
  setOutput("volumes", String(results.length));
  setOutput("uploaded-artifacts", results.map((item) => item.name).join(","));
}

main().catch((e) => fail(e && e.stack ? e.stack : String(e)));
