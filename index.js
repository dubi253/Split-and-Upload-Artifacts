#!/usr/bin/env node
const core = require("@actions/core");
const artifact = require("@actions/artifact");
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");

function execShell(cmd) {
  return new Promise((resolve, reject) => {
    exec(
      cmd,
      { shell: "/bin/bash", maxBuffer: 1024 * 1024 * 20 },
      (err, stdout, stderr) => {
        if (err)
          return reject(new Error(`${err.message}\n${stderr || stdout}`));
        resolve({ stdout, stderr });
      },
    );
  });
}

async function run() {
  try {
    const source = core.getInput("source", { required: true });
    const volumeSize = core.getInput("volume-size") || "5g";
    const archiveName = core.getInput("archive-name") || "artifact";
    const prefix = core.getInput("artifact-prefix") || "";
    const compression = core.getInput("compression-level") || "6";

    if (!source || !source.trim())
      throw new Error("Input `source` is required and was empty.");

    core.info(`Cleaning previous files: ${archiveName}.z* ${archiveName}.zip`);
    await execShell(`rm -f ${archiveName}.z* ${archiveName}.zip`);

    let compressionFlag = "";
    if (/^[0-9]$/.test(compression)) compressionFlag = `-${compression}`;

    const zipCmd = `zip -s ${volumeSize} -r ${compressionFlag} ${archiveName}.zip ${source}`;
    core.info(`Running split zip: ${zipCmd}`);
    await execShell(zipCmd);

    const cwd = process.cwd();
    const parts = fs
      .readdirSync(cwd)
      .filter(
        (f) => f.startsWith(`${archiveName}.z`) || f === `${archiveName}.zip`,
      )
      .sort();

    if (!parts || parts.length === 0) {
      core.warning("No volume files were generated.");
      core.setOutput("volumes", "0");
      core.setOutput("uploaded-artifacts", "");
      return;
    }

    let client;
    if (process.env.TEST_MODE === "1") {
      client = {
        uploadArtifact: async (name, files, cwd) => {
          const marker = path.join(cwd, `${name}.uploaded.txt`);
          fs.writeFileSync(marker, files.join("\n"));
          return { artifactName: name, failedItems: [] };
        },
      };
    } else {
      client = artifact.create();
    }
    const uploaded = [];

    for (let i = 0; i < parts.length; i++) {
      const file = parts[i];
      const filePath = path.join(cwd, file);
      const artifactName =
        prefix && prefix.trim() !== ""
          ? `${prefix}-${archiveName}-part${i + 1}`
          : file;

      core.info(`Uploading ${file} as artifact '${artifactName}'`);
      await client.uploadArtifact(artifactName, [filePath], cwd);
      uploaded.push(artifactName);
    }

    core.setOutput("volumes", String(parts.length));
    core.setOutput("uploaded-artifacts", uploaded.join(","));
    core.info(`Uploaded ${parts.length} artifacts.`);
  } catch (error) {
    core.setFailed(error.message || String(error));
  }
}

run();
