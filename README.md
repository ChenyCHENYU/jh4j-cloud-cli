# JH4J Cloud CLI

JH4J Cloud 团队项目脚手架，用于从受控模板快速创建结构一致、配置完整、可追溯的工程。

当前版本：`@agile-team/jh4j-cloud-cli@0.5.0`。

## 核心能力

| 能力 | 说明 |
| --- | --- |
| 分类选择 | 按前端、后端、移动端组织模板；当前已接入 PC 与移动端模板 |
| 精简交互 | 只确认项目类型、标题、端口和本地服务地址；其余采用模板默认值 |
| 非交互创建 | 支持命令行参数和 JSON 配置文件，适用于 CI 与批量初始化 |
| 多源拉取 | 支持本地目录、Git、HTTP 压缩包和离线压缩包 |
| 源站容灾 | 内置模板按 GitHub → Gitee 顺序拉取，主源不可用时自动切换 |
| 模板缓存 | 按 `source + ref` 缓存远程模板，支持查看、清理和强制刷新 |
| 安全生成 | 在临时目录完成初始化与校验，成功后再原子写入目标目录 |
| 工程初始化 | 默认不安装依赖；可初始化 `main` 分支并创建首次提交 |
| 来源追踪 | 生成 `.jhlc/project.json`，记录模板版本、CLI 版本和创建参数 |

生成链路：

```text
jh4j create
  → 读取 Catalog
  → 选择项目类型与模板
  → 解析可用模板源
  → 拉取或读取缓存
  → 校验 template.manifest.json
  → 在 staging 目录执行模板初始化
  → 生成项目并初始化 Git
  → 开发者按需修改配置并手动安装依赖
```

## 环境要求

- Node.js `^22.12.0 || ^24.0.0`，推荐 Node.js 24
- pnpm `>=11.8.0`
- Git

建议先检查本机环境：

```bash
npx @agile-team/jh4j-cloud-cli doctor
```

## 快速开始

无需全局安装：

```bash
npx @agile-team/jh4j-cloud-cli create jh4j-ui-orders
```

或者全局安装：

```bash
pnpm add -g @agile-team/jh4j-cloud-cli
jh4j create jh4j-ui-orders
```

交互模式只确认必要信息，直接回车即可接受当前默认值：

```text
项目类型
→ 单个可用模板自动选中
→ 系统/应用标题
→ 开发端口
→ 本地后端/API 地址
→ 生成项目并初始化 Git
```

标准能力默认启用，Registry、模块标识和各套环境配置不再逐项询问。需要调整时，创建完成后直接修改项目中的 `project.config.json`、`.npmrc` 和 `.env*` 文件。

当前 Catalog 中可用模板：

| 类型 | 模板 ID | 模板 |
| --- | --- | --- |
| 前端 | `web.jh4j-mf-remote` | Vue 3 + Vite + Module Federation PC 业务子系统 |
| 后端 | — | 暂未接入 |
| 移动端 | `mobile.robot-h5` | Vue 3 + Vite 7 + Vant 4 企业级 H5 应用 |

## 创建项目

### 交互创建

```bash
jh4j create jh4j-ui-orders
```

### 使用明确参数创建

```bash
jh4j create jh4j-ui-orders \
  --yes \
  --category frontend \
  --template web.jh4j-mf-remote \
  --module orders \
  --title "订单中心" \
  --port 8123
```

创建移动端项目：

```bash
jh4j create jh4j-mobile-orders \
  --yes \
  --category mobile \
  --template mobile.robot-h5 \
  --title "移动订单中心" \
  --port 8888 \
  --local-backend http://localhost:10010
```

### 使用 JSON 参数文件

```json
{
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
jh4j create jh4j-ui-orders --yes --config ./project-input.json
```

命令行参数的优先级高于 JSON 文件中的同名配置。

### 预览生成计划

```bash
jh4j create jh4j-ui-orders --yes --dry-run
```

`--dry-run` 会完成模板解析和参数校验，但不会创建项目目录。

### 安装依赖与可选步骤

```bash
# 默认只生成项目，依赖由开发者手动安装
jh4j create jh4j-ui-orders --yes

# 确实需要创建后自动安装时显式指定
jh4j create jh4j-ui-orders --yes --install

# 跳过 Git 初始化
jh4j create jh4j-ui-orders --yes --skip-git

# 不启用模板提供的完整 Git 与代码质量规范
jh4j create jh4j-ui-orders --yes --no-standards
```

PC 与移动端模板默认启用 `git-standards` 能力。创建时不再重复确认；需要关闭时使用 `--no-standards`。

### 常用参数

| 参数 | 说明 |
| --- | --- |
| `-c, --category <category>` | 项目类型：`frontend`、`backend`、`mobile` |
| `-t, --template <id>` | 指定模板 ID |
| `--features <ids>` | 启用的模板能力，多个 ID 使用逗号分隔 |
| `--no-standards` | 禁用模板提供的 Git 与代码质量规范 |
| `--source <path-or-url>` | 强制使用指定模板目录、Git 地址或压缩包 |
| `--ref <branch-or-tag>` | 覆盖 Catalog 为模板配置的默认分支或标签 |
| `--config <json-file>` | 从 JSON 文件读取创建参数 |
| `--dry-run` | 校验并展示生成计划，不写入项目目录 |
| `--install` | 创建完成后自动安装依赖；默认不安装 |
| `--skip-install` | 明确不安装依赖，兼容旧命令 |
| `--skip-git` | 跳过 Git 初始化 |
| `--force` | 替换已存在的同名目录 |
| `--no-cache` | 不读取已有远程模板缓存 |

完整参数以命令输出为准：

```bash
jh4j create --help
```

## 生成安全性

CLI 不会直接在目标目录中边下载边修改。创建过程先在当前目录生成隐藏的 staging 目录，并依次完成：

1. 模板 Manifest 校验。
2. 模板初始化脚本执行。
3. 生成元数据校验。
4. staging 目录原子提升为目标目录。
5. Git 初始化，以及显式 `--install` 时的依赖安装。

目标目录已存在时，默认拒绝覆盖。使用 `--force` 后，CLI 会先备份旧目录；模板初始化失败时，旧目录保持不变。默认不安装依赖，避免网络或 Registry 问题阻塞项目生成。

## 模板来源

支持以下来源：

- 本地模板目录
- Git HTTP、HTTPS、SSH 和 `file://` 地址
- 本地 `.tgz`、`.tar.gz`、`.tar` 文件
- HTTP(S) 模板压缩包

来源解析顺序：

```text
--source
→ 模板专属环境变量
→ 用户配置 templateSource
→ Catalog defaultSource + sources
```

一旦通过 `--source`、环境变量或用户配置指定来源，该来源将作为强制来源，不再自动尝试 Catalog 中的备用源。

### 内置模板源

CLI 源码开发时会优先读取工作区中的 PC、移动端模板，便于联调。

从 npm 安装后按以下顺序尝试远程源：

```text
https://github.com/ChenyCHENYU/jh4j-ui-template.git
→ https://gitee.com/ycyplus163/jh4j-ui-template.git
```

移动端模板按以下顺序尝试，并默认固定到 `v1.6.0`：

```text
https://github.com/ChenyCHENYU/Robot_H5.git
→ https://gitee.com/ycyplus163/robot_-h5.git
```

PC 模板当前默认读取 `main`。也可以通过 `--ref` 明确固定模板版本：

```bash
jh4j create jh4j-ui-orders --ref <template-tag>
```

也可以临时指定其他来源：

```bash
jh4j create jh4j-ui-orders \
  --source https://git.example.com/templates/jh4j-ui-template.git \
  --ref main
```

## 模板缓存

远程 Git 和压缩包模板缓存在：

```text
~/.jh4j/cache/templates
```

默认缓存有效期为 60 分钟。缓存键由模板 `source + ref` 计算，不同镜像和不同分支互不覆盖。

```bash
jh4j cache list
jh4j cache list --json
jh4j cache clear
jh4j create jh4j-ui-orders --no-cache
```

## 用户配置

用户配置默认保存在 `~/.jh4j/config.json`。设置 `JH4J_HOME` 可以修改 CLI 数据根目录。

```bash
jh4j config list
jh4j config get autoInstall
jh4j config set autoInstall true
jh4j config set autoGit false
jh4j config set cacheTtlMinutes 120
jh4j config unset cacheTtlMinutes
jh4j config reset
```

| 配置项 | 说明 |
| --- | --- |
| `catalogFile` | 外部 Catalog JSON 文件 |
| `templateSource` | 全局模板源覆盖；设置后不再自动尝试 Catalog 备用源 |
| `npmRegistry` | npm Registry，必须能提供项目使用的企业定制包 |
| `jhlcRegistry` | `@jhlc` 私有 Registry |
| `autoInstall` | 创建后是否自动安装依赖，默认 `false`；通常保持默认即可 |
| `autoGit` | 创建后是否初始化 Git 仓库 |
| `cacheTtlMinutes` | 模板缓存有效期；`0` 表示每次刷新 |

## 外部 Catalog

通过 `JH4J_CATALOG_FILE` 或用户配置中的 `catalogFile` 加载外部 Catalog。相同模板 ID 会覆盖内置定义，其他 ID 会追加到模板列表。

```json
{
  "schemaVersion": 1,
  "templates": [
    {
      "id": "web.jh4j-mf-remote",
      "name": "JH4J PC 微前端业务模板",
      "description": "企业 PC 业务子系统",
      "category": "frontend",
      "defaultSource": "https://git.example.com/templates/jh4j-ui-template.git",
      "sources": [
        "https://git-backup.example.com/templates/jh4j-ui-template.git"
      ],
      "sourceEnvironment": "JH4J_UI_TEMPLATE_SOURCE",
      "defaultRef": "main",
      "status": "stable",
      "tags": ["vue", "vite", "module-federation"]
    }
  ]
}
```

Catalog JSON Schema 位于 [`catalog.schema.json`](./catalog.schema.json)。

## 模板接入规范

每个模板仓库至少需要提供：

```text
template.manifest.json       # 模板 ID、版本、运行时、默认值和可选能力
project.config.json          # 项目默认配置
scripts/setup-project.mjs    # CLI 与直接 clone 共用的初始化入口
scripts/validate-template.mjs
```

模板初始化完成后必须生成 Manifest 声明的元数据文件，当前 PC 与移动端模板都使用 `.jhlc/project.json`。CLI 只有在元数据存在且模板初始化成功后才会提升 staging 目录。

校验本地模板：

```bash
jh4j template validate ../jh4j-ui-template
jh4j template validate ../../Robot_H5
```

模板列表和完整定义可通过 JSON 查看：

```bash
jh4j list --json
```

## 项目信息

在生成项目中查看模板与创建信息：

```bash
jh4j info .
jh4j info . --json
```

项目元数据位于 `.jhlc/project.json`，用于确认项目由哪个模板版本和 CLI 版本创建。

## 命令总览

```text
jh4j create [name]                    创建项目
jh4j list [--json]                    查看模板 Catalog
jh4j doctor [--json]                  检查 Node、pnpm、Git 与模板环境
jh4j info [path] [--json]             查看生成项目元数据
jh4j template validate [path]         校验模板契约
jh4j config list|get|set|unset|reset  管理用户配置
jh4j cache list|clear                 管理模板缓存
```

## 本地开发

```bash
git clone https://github.com/ChenyCHENYU/jh4j-cloud-cli.git
cd jh4j-cloud-cli
pnpm install
pnpm check
node bin/jh4j.js doctor
```

`pnpm check` 会依次执行 TypeScript 类型检查、自动化测试和生产构建。

发布包检查：

```bash
npm pack --dry-run
```

## 常见问题

### 模板拉取失败

```bash
jh4j doctor
jh4j create jh4j-ui-orders --no-cache
```

先检查 GitHub、Gitee 或自定义模板源是否可访问，再检查本地 Git 代理和凭据配置。

### 手动安装依赖

项目生成完成后，确认 `.npmrc` 和内部 Registry 网络，再手动执行：

```bash
pnpm install
```

PC 模板包含企业定制的非 scope 依赖，默认 npm Registry 必须能够提供这些包。

### 只生成文件，不初始化 Git

```bash
jh4j create jh4j-ui-orders --yes --skip-git
```

### 强制使用指定模板源

```bash
jh4j create jh4j-ui-orders \
  --source ./jh4j-ui-template \
  --ref main \
  --no-cache
```
