# Split and Upload Artifacts

Compress files/folders into volume-limited ZIP parts and upload each part as a separate GitHub Actions artifact.

## Features

- Split archives using `zip -s` (no extra dependencies)
- Upload each volume as an independent artifact
- Configurable volume size, archive name, artifact name prefix, and compression level

## Inputs

- `source` (required): Path(s) or glob to files/folders to include (supports space-separated paths).
- `volume-size` (default `5g`): Max size per volume (e.g., `5g`, `1000m`, `2g`).
- `archive-name` (default `artifact`): Base name for the archive parts.
- `artifact-prefix` (default ``): Optional prefix for artifact names.
- `compression-level` (default `6`): ZIP compression level `0-9`.

## Outputs

- `volumes`: Number of volume parts created.
- `uploaded-artifacts`: Comma-separated list of uploaded artifact names.

## Usage

Example workflow step:

```yaml
- name: Split & upload large data
  uses: your-username/split-upload-action@v1.0.1
  with:
    source: ./my-large-folder/
    volume-size: 5g
    archive-name: data
    artifact-prefix: myapp
    compression-level: 0
```

## Local testing

Install dependencies and run (Node >= 24 required):

```bash
npm install
node index.js
```

Note: `index.js` expects GitHub Actions inputs; use environment variables or run within an action runner for full end-to-end verification.

## Requirements

- `zip` and `unzip` available in the runner (Ubuntu images include these).
