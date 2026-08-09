# upload-artifacts

直接将文件作为独立 GitHub Actions artifact 上传，不再进行 ZIP 包装。

## 功能

- 每个文件单独上传为一个 artifact
- 默认直接上传原始文件字节
- 可通过 `archive: true` 切换为 gzip 压缩上传
- 支持 artifact 前缀、保留天数、覆盖和无匹配文件处理

## 输入参数

- `path`（必填）：要上传的文件路径或 glob，支持逗号、换行或空格分隔。
- `source`（可选）：`path` 的兼容别名。
- `artifact-prefix`（默认空）：添加到每个 artifact 名称前的前缀。
- `retention-days`（默认 `3`）：artifact 保留天数。
- `overwrite`（可选）：是否覆盖同名 artifact。
- `archive`（默认 `false`）：设为 `true` 时，会先对每个文件进行 gzip 压缩再上传。
- `if-no-files-found`（默认 `warn`）：当没有匹配文件时的处理方式，可为 `warn`、`error` 或 `ignore`。

## 输出

- `artifacts`：已上传 artifact 的 JSON 数组。
- `volumes`：已上传 artifact 的数量。
- `uploaded-artifacts`：已上传 artifact 名称的逗号分隔列表。

## 使用示例

```yaml
- name: Upload files as artifacts
  uses: dubi253/upload-artifacts@v1.0.7
  with:
    path: images.tar.gz.part*
```

当 `archive: true` 时，每个文件会先通过 gzip 压缩，再作为 artifact 内容上传。

## 本地测试

需要 Node >= 24：

```bash
npm install
node index.js
```

注意：`index.js` 依赖 GitHub Actions 的输入环境变量；要做完整端到端测试，请在 action runner 或 GitHub Actions 环境中运行。

## 依赖要求

- Node 24+
- GitHub Actions 运行环境，用于端到端上传
