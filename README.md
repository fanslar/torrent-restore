 # torrent-restore

将通过百度网盘等工具下载后被“铺平”的文件，按照 `.torrent` 种子中的原始目录结构重新整理。

工具会读取种子文件列表，扫描本地下载目录，并根据文件名、文件大小和重复文件名进行匹配。默认会将匹配到的文件复制到新的目录，不会修改原始下载文件。

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

也可以使用 `--input` 让工具自动识别输入类型。它支持 `.torrent` 文件、完整磁力链接，以及 32 位或 40 位的十六进制 hash：

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
| `--no-cache` | 忽略已有缓存并重新获取种子元数据 |
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

磁力链接的元数据会缓存到：

```text
~/.cache/torrent-restore/
```

后续使用相同磁力链接时会优先读取缓存。需要重新获取时使用 `--no-cache`，需要删除全部缓存时使用 `--clear-cache`。

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
