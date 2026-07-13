# jh4j-cloud-cli

JH4J Cloud 企业内部标准化项目脚手架。CLI 与模板独立维护，不依赖社区版 `robot-cli`。

## 运行环境

- Node.js 24（推荐），兼容 Node.js 22.12+
- pnpm 11.8+
- Git

## 本地开发

```bash
pnpm install
pnpm build
node bin/jh4j.js doctor
node bin/jh4j.js list
```

开发期默认读取兄弟目录 `../jh4j-ui-template`。模板独立推送后，可通过环境变量或命令参数切换：

```bash
$env:JH4J_UI_TEMPLATE_SOURCE="https://git.example.internal/jh4j-ui-template.git"
node bin/jh4j.js create my-app --ref main

# 或
node bin/jh4j.js create my-app --source ../jh4j-ui-template
```

## 创建项目

```bash
# 交互模式
jh4j create my-app

# 非交互模式
jh4j create my-app \
  --yes \
  --module my-app \
  --title "My Application" \
  --port 8001

# 开发期快速验证，不安装依赖、不初始化 Git
jh4j create my-app --yes --skip-install --skip-git
```

## 命令

```text
jh4j list
jh4j create [name]
jh4j doctor
jh4j info [path]
jh4j template validate [path]
```

首期只实现创建与诊断能力。项目升级、Recipes、GitLab 自动建仓和多端模板在后续版本加入。
