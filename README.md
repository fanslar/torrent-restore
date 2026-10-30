 # torrent-restore

将通过百度网盘等工具下载后被“铺平”的文件，按照 `.torrent` 种子中的原始目录结构重新整理。

工具会读取种子文件列表，扫描本地下载目录，并根据文件名、文件大小和重复文件名进行匹配。默认会将匹配到的文件复制到新的目录，不会修改原始下载文件。为避免数据丢失，如果目标文件已存在，工具会保留现有文件并将该项报告为失败。

## 安装

需要 Node.js 18 或更高版本。

```bash
pnpm add -g torrent-restore
```

也可以直接使用本地源码：

```bash
pnpm install
pnpm build
pnpm link --global
```

## 使用

使用种子文件恢复目录结构：

```bash
torrent-restore --torrent ./example.torrent --dir ./downloads
```

使用磁力链接恢复目录结构：

```bash
torrent-restore --magnet "magnet:?xt=urn:btih:..." --dir ./downloads
```

磁力链接优先读取缓存；缓存未命中时，工具会通过 qBittorrent Web API 临时添加磁力任务，并在获取元数据后读取文件清单、暂停并移除该任务。qBittorrent 需要在本机或可访问的服务器上运行，并启用 Web UI。

配置环境变量（保存路径必须是 qBittorrent 所在主机上的目录，建议预先创建一个专用空目录）：

```bash
export QBITTORRENT_URL="http://127.0.0.1:8080"
export QBITTORRENT_USERNAME="admin"
export QBITTORRENT_PASSWORD="your-web-ui-password"
export QBITTORRENT_METADATA_SAVE_PATH="/path/on/qbittorrent/metadata-only"
```

远程连接必须使用 HTTPS。该临时任务设置了 `MetadataReceived` 停止条件，并在清理时保留文件（不删除保存目录中的内容）；请不要将保存路径指向有重要数据的目录。元数据获取最长等待 120 秒。已有同 hash 任务如果已经有元数据会直接读取且不会修改；若其尚无元数据则会报错并保持原任务不变。

也可以使用 `--input` 让工具自动识别输入类型。它支持 `.torrent` 文件、完整磁力链接，以及 40 位的十六进制 BTIH：

```bash
torrent-restore --input ./example.torrent
torrent-restore --input "0123456789abcdef0123456789abcdef01234567"
```

默认输出到本地下载目录的上一级目录，目录名使用种子名称。例如：

```text
./downloads       # 输入目录
../Example        # 默认输出目录
```

指定输出目录：

```bash
torrent-restore -t ./example.torrent -d ./downloads -o ./organized
```

## 命令行选项

| 选项 | 说明 |
| --- | --- |
| `-t, --torrent <file>` | 指定 `.torrent` 文件 |
| `-m, --magnet <link>` | 指定磁力链接或 torrent hash |
| `-i, --input <value>` | 自动识别种子文件或磁力链接 |
| `-d, --dir <directory>` | 本地下载目录，默认为当前目录 `./` |
| `-o, --output <directory>` | 输出目录，默认为输入目录的上一级目录 |
| `-v, --verbose` | 显示详细匹配结果和完整文件树 |
| `--move` | 移动匹配文件，而不是复制文件 |
| `--dry-run` | 只模拟操作，不实际复制或移动文件 |
| `--no-cache` | 忽略已有缓存；成功获取的元数据不会写入缓存 |
| `--clear-cache` | 清空所有已缓存的种子元数据 |
| `-h, --help` | 显示帮助信息 |

## 推荐流程

首次执行时建议先使用模拟模式：

```bash
torrent-restore -t ./example.torrent -d ./downloads --dry-run --verbose
```

确认匹配结果后执行实际复制：

```bash
torrent-restore -t ./example.torrent -d ./downloads
```

只有在确认原始文件不再需要时，才使用移动模式：

```bash
torrent-restore -t ./example.torrent -d ./downloads --move
```

## 匹配规则

1. 第一阶段优先匹配种子中具有唯一文件名的文件。
2. 第二阶段处理重复文件名，并结合文件大小和未使用的本地文件进行匹配。
3. 文件大小不一致或无法匹配的文件会被列出，不会被强行处理。
4. 恢复后的路径来自种子中的原始相对路径。

## 缓存

磁力链接的元数据会缓存在：

```text
~/.cache/torrent-restore/
```

缓存未命中时需要配置 qBittorrent Web API（见上文）。使用 `--no-cache` 时既不读取也不写入缓存。需要删除全部缓存时使用 `--clear-cache`。

## 开发

```bash
pnpm install
pnpm run build
pnpm run typecheck
pnpm test
pnpm run start -- --help
```

开发期间监听源码并自动构建：

```bash
pnpm run dev
```

发布前请使用 pnpm 执行打包流程。项目依赖使用 pnpm workspace catalog 管理，`pnpm pack` 或 `pnpm publish` 会将 catalog 解析为标准依赖版本；不要使用未经 pnpm 处理的 `npm pack` 或 `npm publish`。

## 许可证

[MIT](LICENSE.md)
