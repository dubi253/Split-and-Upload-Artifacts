# upload-artifacts

Upload files directly as separate GitHub Actions artifacts without ZIP wrapping.

## Features

- Upload each file as an independent artifact
- Upload original file bytes directly by default
- Optional gzip-compressed upload mode with `archive: true`
- Optional artifact prefix, retention, overwrite, and missing-file behavior

## Inputs

- `path` (required): Path(s) or glob(s) to files to upload. Supports comma, newline, or space separated patterns.
- `source` (optional): Backward-compatible alias for `path`.
- `artifact-prefix` (default ``): Optional prefix added to each artifact name.
- `retention-days` (default `3`): Artifact retention in days.
- `overwrite` (optional): Replace an existing artifact with the same name.
- `archive` (default `false`): Set to `true` to gzip-compress each file before upload.
- `if-no-files-found` (default `warn`): `warn`, `error`, or `ignore` when nothing matches.

## Outputs

- `artifacts`: JSON array of uploaded artifact metadata.
- `volumes`: Number of uploaded artifacts.
- `uploaded-artifacts`: Comma-separated list of uploaded artifact names.

## Usage

Example workflow step:

```yaml
- name: Upload files as artifacts
  uses: your-username/upload-artifacts@v1.0.1
  with:
    path: ./dist/**/*.txt
    artifact-prefix: myapp
    archive: false
    overwrite: true
```

When `archive: true`, each file is compressed with gzip before being uploaded as the artifact payload.

## Local testing

Install dependencies and run (Node >= 24 required):

```bash
npm install
node index.js
```

Note: `index.js` expects GitHub Actions inputs; use environment variables or run within an action runner for full end-to-end verification.

## Requirements

- Node 24+
- GitHub Actions runtime environment for end-to-end uploads
