# jh4j-cloud-cli

JH4J Cloud 企业内部标准化项目脚手架。CLI 与模板独立发布、独立版本化，不依赖也不修改社区版 `robot-cli`。

## 运行环境

- Node.js 24（推荐）或 Node.js 22.12+
- pnpm 11.8+
- Git（使用 Git 模板源或初始化项目仓库时需要）

## 安装与开发

```bash
pnpm install
pnpm check
node bin/jh4j.js doctor
```

发布到内部 npm 后：

```bash
npx @agile-team/jh4j-cloud-cli create my-app

# 或全局安装
pnpm add -g @agile-team/jh4j-cloud-cli
jh4j create my-app
```

## 创建项目

```bash
# 交互模式
jh4j create my-app

# 依次选择项目类型、具体模板和模板提供的标准能力
# 当前后端、移动端会显示为“暂未提供”，加入 Catalog 后自动开放

# 非交互模式
jh4j create my-app \
  --yes \
  --category frontend \
  --template web.jh4j-mf-remote \
  --module my-app \
  --title "My Application" \
  --port 8001

# 从 JSON 文件读取项目参数
jh4j create my-app --yes --config ./project-input.json

# 预览，不写入项目目录
jh4j create my-app --yes --dry-run

# 生成源码但不安装依赖、不初始化 Git
jh4j create my-app --yes --skip-install --skip-git

# 使用模板但不安装完整 Git/代码标准化包
jh4j create my-app --yes --no-standards
```

PC 模板默认启用完整的 `@robot-admin/git-standards`。也可以通过 `--features git-standards` 或 JSON 参数中的 `features` 明确指定；能力选择会写入生成项目元数据。

创建过程先在当前目录的隐藏 staging 目录中完成模板初始化。只有模板脚本和项目元数据校验成功后才原子替换目标目录；即使使用 `--force`，初始化失败时原目录也会保留。

### 创建参数文件

`--config` 接受与模板 `project.config.json` 相同的部分字段，命令行参数优先级更高：

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

## 模板来源

支持以下来源：

- 本地模板目录
- Git HTTP/SSH/file URL，可指定 branch 或 tag
- 本地 `.tgz`、`.tar.gz`、`.tar`
- HTTP(S) 模板压缩包

来源优先级：

```text
--source
→ 模板专属环境变量
→ 用户配置 templateSource
→ Catalog defaultSource + sources（按顺序自动降级）
```

```bash
jh4j create my-app --source ../jh4j-ui-template
jh4j create my-app --source https://git.example/jh4j-ui-template.git --ref v1.0.0
jh4j create my-app --source ./jh4j-ui-template-1.0.0.tgz
```

内置 PC 模板在 CLI 开发期优先读取兄弟目录 `../jh4j-ui-template`；发布安装后依次尝试以下 HTTPS 源，主源不可用时自动降级：

```text
https://github.com/ChenyCHENYU/jh4j-ui-template.git
→ https://gitee.com/ycyplus163/jh4j-ui-template.git
```

也可设置单一强制源：

```powershell
$env:JH4J_UI_TEMPLATE_SOURCE="https://git.example/jh4j-ui-template.git"
```

### 模板缓存

远程 Git 和压缩包模板按 `source + ref` 缓存在 `$JH4J_HOME/cache/templates`，默认有效期 60 分钟。

```bash
jh4j cache list
jh4j cache list --json
jh4j cache clear
jh4j create my-app --no-cache
```

## 用户配置

默认保存在 `~/.jh4j/config.json`；可以通过 `JH4J_HOME` 修改根目录。

```bash
jh4j config list
jh4j config get autoInstall
jh4j config set autoInstall false
jh4j config set templateRef v1.0.0
jh4j config set cacheTtlMinutes 120
jh4j config unset templateRef
jh4j config reset
```

支持的配置项：

| 配置 | 说明 |
| --- | --- |
| `catalogFile` | 外部 Catalog JSON 文件 |
| `templateSource` | 全局模板源覆盖 |
| `templateRef` | 默认 Git branch/tag |
| `npmRegistry` | npm registry；必须能提供企业定制的非 scope 包 |
| `jhlcRegistry` | `@jhlc` 私有 registry |
| `autoInstall` | 创建后是否安装依赖 |
| `autoGit` | 创建后是否初始化 Git |
| `cacheTtlMinutes` | 模板缓存有效期，0 表示每次刷新 |

## 外部 Catalog

通过 `JH4J_CATALOG_FILE` 或用户配置 `catalogFile` 加载。相同 ID 会覆盖内置定义，其他模板会追加：

```json
{
  "schemaVersion": 1,
  "templates": [
    {
      "id": "web.jh4j-mf-remote",
      "name": "JH4J PC 微前端业务模板",
      "description": "企业 PC 业务子系统",
      "category": "frontend",
      "defaultSource": "https://git.example/jh4j-ui-template.git",
      "sources": [
        "https://git-backup.example/jh4j-ui-template.git"
      ],
      "sourceEnvironment": "JH4J_UI_TEMPLATE_SOURCE",
      "defaultRef": "main",
      "status": "stable",
      "tags": ["vue", "vite", "module-federation"]
    }
  ]
}
```

## 命令

```text
jh4j list [--json]
jh4j create [name]
jh4j doctor [--json]
jh4j info [path] [--json]
jh4j template validate [path]
jh4j config list|get|set|unset|reset
jh4j cache list|clear
```

## 后续边界

当前版本专注“可靠创建标准项目”。以下能力将在模板发布流程稳定后继续实现：

- 项目 `upgrade` 与模板 migrations
- 更多模板专属 Recipes 与标准能力追加
- GitLab 自动建仓和权限初始化
- 后端与移动端模板 Catalog
