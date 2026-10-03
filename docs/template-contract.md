# 模板契约

CLI 0.7.0 使用 schemaVersion 1，兼容现有 PC/H5 的 `node scripts/setup-project.mjs --yes` 字符串入口，也支持结构化入口。接入模板需要 Manifest、package.json、项目默认配置和初始化脚本；显式运行 `template validate` 还需要验证脚本。

```text
template.manifest.json
package.json
project.config.json
scripts/setup-project.mjs
scripts/validate-template.mjs
```

## Manifest

```json
{
  "schemaVersion": 1,
  "id": "web.company-template",
  "name": "团队业务模板",
  "description": "团队统一的 Vue 业务工程",
  "version": "1.0.0",
  "category": "frontend",
  "runtime": {
    "node": "^22.13.0 || ^24.0.0",
    "recommendedNode": "24",
    "packageManager": "pnpm@11.8.0"
  },
  "defaults": {
    "projectName": "company-app",
    "moduleName": "app",
    "title": "业务应用",
    "devServerPort": 8001,
    "localBackendUrl": "http://localhost:10010",
    "localPublicUrl": "http://localhost:8002",
    "npmRegistry": "https://registry.npmjs.org",
    "jhlcRegistry": "https://registry.npmjs.org"
  },
  "features": [
    {
      "id": "git-standards",
      "name": "代码规范",
      "description": "团队 Git 与代码质量规范",
      "defaultEnabled": true,
      "required": false
    }
  ],
  "parameters": [
    { "name": "projectName", "type": "string", "required": true },
    {
      "name": "tenant",
      "type": "string",
      "required": true,
      "default": "acme",
      "pattern": "^[a-z]+$"
    }
  ],
  "display": {
    "techStack": ["Vue 3", "Vite", "TypeScript"],
    "corePackages": ["@company/core"],
    "startScript": "dev"
  },
  "entry": {
    "nonInteractive": {
      "script": "scripts/setup-project.mjs",
      "args": ["--yes"]
    }
  },
  "generatedMetadata": ".jhlc/project.json"
}
```

- `id` 与 Catalog 一致，`version` 是有效 semver；`category` 是 frontend/backend/mobile，并与 Catalog 一致。
- 当前 CLI 支持 pnpm 模板，`runtime.packageManager` 必须是 `pnpm@<精确版本>`；package.json 若声明 packageManager，必须一致。当前 Node 必须满足模板 runtime.node。
- 默认项目名、模块、标题、端口和两个 Registry 必须存在。本地 URL 可以在默认值或项目配置中提供。
- 初始化脚本须是模板内的 `.js/.mjs/.cjs` 普通文件或内部有效链接，不允许绝对路径、外部链接或路径越界。不通过 shell 执行入口。旧字符串入口只支持 `node <脚本> [参数]`，复杂参数推荐结构化写法。
- `generatedMetadata` 必须是模板内的相对文件路径。初始化前排除模板遗留的元数据；执行后必须新生成。
- `features` 的 ID 必须唯一，默认和必需标记为布尔值；未知能力直接报错，必需能力始终保留。
- `parameters` 可声明 string/number/boolean、required、default、pattern、minimum/maximum、enum，字符串支持 `format: "uri"`（当前要求 HTTP(S)）。扩展参数由项目默认配置或 `--config` 提供；CLI 通用交互只覆盖通用字段。
- `display` 可选。CLI 仅展示实际声明的技术栈和核心包，避免对第三方模板套用 PC/H5 的描述。`startScript` 必须出现在生成 package.json 的 scripts 中，才能进入下一步提示；未声明时优先使用存在的 dev 脚本。

## 默认配置与参数

```json
{
  "projectName": "company-app",
  "moduleName": "app",
  "title": "业务应用",
  "devServerPort": 8001,
  "localBackendUrl": "http://localhost:10010",
  "localPublicUrl": "http://localhost:8002",
  "features": ["git-standards"],
  "tenant": "acme",
  "environments": {
    "dev": { "webUrl": "http://localhost:8080", "apiPrefix": "dev-api" },
    "prd": { "webUrl": "https://app.example.com", "apiPrefix": "api" }
  }
}
```

环境名称来自模板，数量和名称可以不同于内置五套环境。每项包含 HTTP(S) webUrl 和非空 apiPrefix。创建配置可以局部覆盖已有环境，不接受未声明的环境名称或环境子字段。

CLI 将最终参数写入 staging 内的 `.jh4j-cli-input.json`，通过以下参数调用 Manifest 声明的脚本：

```text
node <声明的脚本> <声明的 args> --yes --config <临时参数文件> --created-by @agile-team/jh4j-cloud-cli@<版本>
```

已在 args 中提供的 `--yes` 不会重复添加。脚本工作目录是 staging，stdin 关闭；应读取配置文件并完全非交互执行。临时参数文件无论成功失败都会清理。脚本日志默认被捕获，`--verbose` 时实时写 stderr。

脚本需要应用名称、模块、标题、端口、联调地址、能力和环境配置；修改 package.json、.npmrc、.env 等文件，并生成项目元数据。退出非零、超时、取消或契约不一致都会阻止 staging 提升。

## 生成元数据

```json
{
  "schemaVersion": 1,
  "template": { "id": "web.company-template", "version": "1.0.0" },
  "platformVersion": null,
  "createdAt": "2026-10-04T00:00:00.000Z",
  "createdBy": "@agile-team/jh4j-cloud-cli@0.7.0",
  "parameters": {
    "projectName": "company-orders",
    "title": "订单中心",
    "devServerPort": 8001,
    "features": ["git-standards"]
  }
}
```

schemaVersion、模板 ID/版本、有效创建时间、createdBy、platformVersion（字符串或 null）与 parameters 对象都必须存在。模板与 CLI 来源必须匹配本次创建计划。parameters 至少包含 projectName、title、devServerPort、features；提供的其他同名参数也必须与计划一致。

生成 project.config.json 的项目名、模块、标题、端口、本地 URL、能力和环境必须与计划一致。通过校验后 CLI 将完整解析参数补充到元数据，并写入 provenance：

```json
{
  "source": "https://git.example.com/templates/ui.git",
  "ref": "v1.0.0",
  "commit": "0123456789abcdef0123456789abcdef01234567",
  "cached": false
}
```

Git 记录实际 commit；压缩包记录 archiveSha256，ref/commit 为 null；本地目录 ref/commit 为 null。HTTP 来源去除 credentials/query/fragment。`jh4j info` 根据 Manifest 读取声明路径，也兼容旧项目默认位置。

## 验证与迁移

```bash
jh4j template inspect /path/to/template --json
jh4j template validate /path/to/template --json
jh4j create probe --yes --source /path/to/template --template web.company-template --skip-git --dry-run --json
```

自定义 ID 需先通过 Catalog 注册。inspect 校验基础契约并展示定义；validate 还执行固定的 `scripts/validate-template.mjs`。获取模板时只进行基础校验；dry-run 不执行初始化或验证脚本。

从 0.6.x 升级时，原来的合法入口保持兼容；仅生成 `{}` 或缺少必要字段的元数据、越界路径、无效运行时/默认值、未知能力、错误类型和不一致输出将被明确拒绝。模板运行在普通 Node 进程中，不是安全沙箱；团队应审核和固定可信来源。
