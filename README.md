# JH4J Cloud CLI

JH4J Cloud 团队项目脚手架，从 PC、移动端或自定义模板创建配置完整、来源可追溯的工程。

当前代码版本：`@agile-team/jh4j-cloud-cli@0.7.0`。源码版本与 npm 已发布版本可能不同。

## 环境与快速开始

- Node.js `^22.13.0 || ^24.0.0`，推荐 Node.js 24。pnpm 11.8 本身要求 Node ≥22.13。
- pnpm `>=11.8.0`，仓库开发使用 `pnpm@11.8.0`。
- 使用 Git 模板或初始化 Git 时需要 Git。

```bash
npx @agile-team/jh4j-cloud-cli create

# 或全局安装
pnpm add -g @agile-team/jh4j-cloud-cli
jh4j create jh4j-ui-orders
```

终端交互依次选择模板、创建方式，缺少项目名时询问一次项目名。快速创建采用模板默认参数；自定义创建展开模块、标题、端口和联调地址，已通过参数或配置文件提供的字段不再询问。项目名默认值来自模板 Manifest，同分类多个模板显示各自名称。

默认不安装依赖。完成面板展示实际能力、环境、依赖与 Git 状态；下一步命令来自生成项目的 `package.json`，只有声明了启动脚本才提示启动命令。开发地址表示配置值，服务需另行启动。

使用明确参数可以直接进入生成：

```bash
jh4j create jh4j-ui-orders \
  --yes --template web.jh4j-mf-remote \
  --module orders --title "订单中心" --port 8123

jh4j create jh4j-mobile-orders \
  --yes --template mobile.robot-h5 \
  --title "移动订单中心" --port 8888 \
  --local-backend http://localhost:10010

# 跳过方式选择，展开仍未提供的自定义字段
jh4j create jh4j-ui-orders --template web.jh4j-mf-remote --customize
```

| 分类      | 模板 ID                           | 默认远程 Ref |
| --------- | --------------------------------- | ------------ |
| 前端 PC   | `web.jh4j-mf-remote`              | `main`       |
| 移动端 H5 | `mobile.robot-h5`                 | `v1.7.1`     |
| 后端      | 暂未接入；可通过外部 Catalog 扩展 | —            |

本地工作区模板可以领先于远程默认 Ref。实际版本以 Manifest、创建计划及项目元数据为准。

## 自动化与输出

交互仅在 stdin、stdout 都是 TTY，TERM 不是 dumb，且未设置 CI 或禁止输入的选项时启用。非交互环境必须明确选择模板（`--template`、唯一分类或 `--yes`），并提供项目名；`--yes` 可接受模板默认名称。缺参直接报错，退出码为 `1`。

```bash
jh4j create orders --template web.jh4j-mf-remote --no-input --skip-git

# stdout 只有一个 JSON 文档，阶段与诊断写入 stderr
jh4j create orders --template web.jh4j-mf-remote --json > result.json

# 静默模式 stdout 仅输出目标目录
jh4j create orders --yes --quiet

# 子进程日志和阶段信息写入 stderr
jh4j create orders --yes --verbose
```

`--json`、`--quiet` 均禁止交互；`--quiet` 与 `--verbose` 不能组合。JSON 创建成功返回 `{ "ok": true, "dryRun": false, "project": ... }`，预览返回 `{ "ok": true, "dryRun": true, "plan": ... }`。失败返回 `{ "ok": false, "error": { "code": ..., "message": ..., "details": ... } }`，同时设置非零退出码；`details` 仅在需要恢复信息时存在。

`list/config list/cache list/info/template inspect/template validate` 的 `--json` 输出为对应的数据对象或数组；`doctor --json` 包含 `ok`、`complete` 和 `checks`。普通模式的错误只写 stderr。`NO_COLOR`、`--no-color`、非 TTY 和 `TERM=dumb` 均禁用 ANSI 颜色；支持真彩的交互终端保留品牌渐变，宽度不足 50 列时完成结果和进度采用纯文本，避免面板溢出。

## 配置复用与预览

创建参数可以保存在 JSON 文件中。环境配置允许部分覆盖，并与模板的其余环境合并：

```json
{
  "projectName": "jh4j-ui-orders",
  "moduleName": "orders",
  "title": "订单中心",
  "devServerPort": 8123,
  "features": ["git-standards"],
  "localBackendUrl": "http://localhost:18080",
  "environments": {
    "sit": {
      "webUrl": "https://sit.example.internal",
      "apiPrefix": "sit-api"
    }
  }
}
```

```bash
jh4j create --template web.jh4j-mf-remote --config ./project-input.json --no-input

# 保存最终解析参数；下次可替换项目名复用
jh4j create orders --yes --save-config ./orders-input.json
jh4j create payments --yes --config ./orders-input.json

# 完整计划包含来源、运行时、环境、能力、安装/Git/覆盖决策
jh4j create orders --yes --dry-run --json
```

参数优先级：命令行 > 创建参数文件 > 用户 Registry 配置 > 模板配置/默认值。模块标识未指定时从项目名推导，无法推导时使用 Manifest 默认值。未知字段、环境名、能力 ID 和错误类型会被拒绝；模板扩展参数遵守 Manifest 声明的类型、必填、默认值、范围、正则或枚举约束。

`--dry-run` 不执行初始化脚本，也不创建目标目录；获取远程模板仍可能写缓存，显式 `--save-config` 仍会保存参数文件。参数文件包含环境地址，应按团队要求管理。

## 创建选项

| 参数                                 | 说明                                                             |
| ------------------------------------ | ---------------------------------------------------------------- |
| `-c, --category <category>`          | `frontend`、`backend`、`mobile`                                  |
| `-t, --template <id>`                | 指定模板 ID                                                      |
| `-y, --yes`                          | 接受默认值，完全非交互                                           |
| `--no-input` / `--customize`         | 禁止交互 / 展开自定义字段                                        |
| `--module` / `--title` / `--port`    | 模块、标题、开发端口（1024–65535）                               |
| `--local-backend` / `--local-public` | 本地联调地址                                                     |
| `--npm-registry` / `--jhlc-registry` | npm 与 `@jhlc` Registry                                          |
| `--features <ids>`                   | 逗号分隔的能力 ID；空字符串表示不选择可选能力                    |
| `--no-standards`                     | 禁用模板声明的 Git/代码规范能力；必需能力不能关闭                |
| `--config` / `--save-config`         | 读取参数文件 / 保存实际参数                                      |
| `--source` / `--ref`                 | 覆盖来源 / Git 分支或标签                                        |
| `--dry-run`                          | 校验并输出计划                                                   |
| `--install` / `--skip-install`       | 显式安装 / 明确跳过安装；同时指定会报错                          |
| `--skip-git`                         | 跳过 Git 初始化                                                  |
| `--force`                            | 替换已有普通目录，不允许覆盖文件或符号链接                       |
| `--no-cache`                         | 跳过缓存读取，成功获取后仍更新缓存                               |
| `--offline`                          | 使用本地目录/压缩包或已有缓存；安装传入 `pnpm install --offline` |
| `--timeout <seconds>`                | 覆盖下载和子进程阶段超时；允许正数小数，最大 86400 秒            |
| `--json` / `--quiet` / `--verbose`   | JSON / 仅路径 / 详细诊断                                         |

完整参数：`jh4j create --help`。

## 失败恢复与取消

模板先在隐藏 staging 目录中复制、初始化并校验，验证通过后才提升为目标目录。`--force` 使用备份和同文件系统 rename 进行替换；初始化失败或提前取消时，已有目录保持原样。复制会保留内部符号链接的相对关系，拒绝外部/失效链接，排除 `.git`、`.jhlc`、`dist`、`node_modules` 和 `.DS_Store`。

文件生成后先初始化 Git `main`，再按需安装依赖，最后尝试首次提交，确保 Husky 等安装脚本能找到 Git。首次提交失败会提示原因；Git 初始化或安装失败会报告项目目录，保留已生成文件供继续处理。

Ctrl+C/SIGINT 退出码为 `130`，SIGTERM 为 `143`；CLI 会停止下载/子进程、清理未提升的临时目录并释放锁。目录提升后取消会保留项目并报告恢复路径。再次发送终止信号会立即退出。不同进程对同一目标目录、配置更新和缓存操作通过文件锁协调；锁可恢复已退出进程的遗留占用。不能保证强制杀进程、断电或外部程序同时改目录时自动恢复一切。

默认超时：Git/HTTP 获取 60 秒，模板初始化 120 秒，Git 操作 30 秒，依赖安装 600 秒。子进程日志只保留最后 1 MB；`--verbose` 实时输出诊断。模板初始化脚本是可执行代码，请使用可信模板源。

## 来源、缓存与离线

支持本地目录、Git HTTPS/SSH/`file://`、本地 `.tgz/.tar.gz/.tar` 和 HTTP(S) tar 压缩包。HTTP 下载流式写入文件；压缩包最大 200 MB，解压最大 1 GB、100000 个条目。路径越界、不支持的条目和外部链接会被拒绝。

来源顺序：`--source` → 模板专属环境变量 → 用户配置 `templateSource` → Catalog 主源及备用源。前三项是明确覆盖，仅尝试指定来源。默认源的下载失败或模板契约不合格都会尝试下一个源，合格后才写缓存。

```text
PC: https://github.com/ChenyCHENYU/jh4j-ui-template.git
  → https://gitee.com/ycyplus163/jh4j-ui-template.git

H5: https://github.com/ChenyCHENYU/Robot_H5.git
  → https://gitee.com/ycyplus163/robot_-h5.git
```

源码开发时优先探测 `../jh4j-ui-template` 与工作区 `../../robot/Robot_H5`，兼容旧位置 `../../Robot_H5`。本地目录不会应用 `--ref`；需要验证某个 Git Ref 时应指定 Git URL。

远程模板缓存位于 `~/.jh4j/cache/templates`，默认有效期 60 分钟，按 `source + ref` 区分。命中缓存会再次校验并复制独立快照，清缓存或其他进程刷新不会改变正在使用的快照。大小在写入时计算，常规缓存命中和列表无需递归统计。

```bash
jh4j cache list --json
jh4j cache clear
jh4j create orders --yes --no-cache

# 先联网预取/校验，再离线生成；离线允许使用超过 TTL 的有效缓存
jh4j create orders --yes --source https://git.example.com/template.git --ref v1.0.0 --dry-run
jh4j create orders --yes --source https://git.example.com/template.git --ref v1.0.0 --offline
```

`--offline` 没有可用缓存时直接失败，不尝试网络；不能与 `--no-cache` 组合。项目元数据记录脱敏来源、请求 Ref、实际 Git commit 或压缩包 SHA-256；本地目录的 Ref/commit 为 `null`。来源 URL 中的用户名、密码、查询参数和 fragment 不写入新缓存或元数据。

## 用户配置与诊断

默认配置文件：`~/.jh4j/config.json`。`JH4J_HOME` 可覆盖整个数据根目录。

```bash
jh4j config list --json
jh4j config set autoInstall false
jh4j config set autoGit true
jh4j config set cacheTtlMinutes 120
jh4j config unset templateSource
jh4j config reset

jh4j doctor
jh4j doctor --network --json
```

| 配置项                         | 默认/说明                        |
| ------------------------------ | -------------------------------- |
| `catalogFile`                  | 外部 Catalog JSON 路径           |
| `templateSource`               | 全局来源覆盖                     |
| `templateRef`                  | 覆盖 Catalog 的默认 Git Ref      |
| `npmRegistry` / `jhlcRegistry` | 覆盖模板 Registry                |
| `autoInstall`                  | `false`                          |
| `autoGit`                      | `true`                           |
| `cacheTtlMinutes`              | `60`；范围 0–10080，`0` 每次刷新 |

配置字段经过运行时校验，写入采用临时文件和 rename。`config reset` 可以恢复损坏的配置文件。Registry 与联调地址要求无嵌入用户名/密码的 HTTP(S) URL。

`doctor` 检查 Node、pnpm、Git、数据目录可写性与本地模板；远程来源标为 `unchecked`，不会直接宣称可用。`--network` 会实际获取并验证模板，也可能更新缓存。JSON 的 `complete: false` 表示仍有未检查项；存在失败项时退出码为 `1`。

## 模板维护与扩展

```bash
jh4j list --json
jh4j template inspect ../jh4j-ui-template --json
jh4j template validate ../../robot/Robot_H5
jh4j template inspect --template mobile.robot-h5 --json
jh4j info . --json
```

`inspect` 展示运行时、默认值、参数和能力；`validate` 额外执行模板内的 `scripts/validate-template.mjs`。项目元数据路径以 Manifest 的 `generatedMetadata` 为准，旧项目默认 `.jhlc/project.json`。

外部 Catalog 通过 `JH4J_CATALOG_FILE` 或用户配置 `catalogFile` 加载，相同 ID 覆盖内置模板，其余 ID 追加。相对来源路径基于 Catalog 文件目录解析。

```json
{
  "schemaVersion": 1,
  "templates": [
    {
      "id": "web.company-template",
      "name": "团队业务模板",
      "description": "团队统一的 Vue 业务工程",
      "category": "frontend",
      "defaultSource": "https://git.example.com/templates/ui.git",
      "sources": ["https://backup.example.com/templates/ui.git"],
      "defaultRef": "v1.0.0",
      "status": "stable",
      "tags": ["vue"]
    }
  ]
}
```

Catalog Schema：[`catalog.schema.json`](./catalog.schema.json)。完整初始化入口、参数与元数据要求见 [模板契约](./docs/template-contract.md)；模块分层、事务和缓存设计见 [架构与维护](./docs/architecture.md)。

## 本地开发与发布检查

```bash
pnpm install --frozen-lockfile
pnpm check          # 格式、类型、独立 fixtures 回归测试、构建
pnpm test:terminal  # macOS/Linux 真终端交互回归，需要 Python 3
pnpm test:package   # npm pack → 安装到临时工程 → 执行实际打包 CLI
pnpm format        # 格式化代码和文档
```

测试不依赖相邻模板仓库、企业 Registry 或 GitHub/Gitee 可用性。打包冒烟会从 npm 官方 Registry 安装公开依赖，需要网络；不会发布 npm 包。`prepack` 自动执行 `pnpm check`。CI 覆盖 macOS、Linux、Windows 与 Node 22.13/24，macOS/Linux 另外执行真实 PTY 键盘取消和交互回归；Unix 信号集成测试在 Windows 上跳过，其余取消和超时逻辑通过跨平台测试验证。

本地联调企业模板时，可使用 `--source` 明确指定工作区路径。生成后按项目 `.npmrc` 的 Registry 执行 `pnpm install`；PC 模板包含企业定制依赖，需要内部 Registry 可用。
