# Changelog

## 0.4.0

- 接入 `mobile.robot-h5` 移动端 H5 模板，支持 GitHub/Gitee 双 HTTPS 源。
- 移动端创建流程使用应用标题、本地 API 地址等移动端语义，隐藏 PC 专属问题。
- CLI 与直接 clone 共用移动端模板初始化契约。
- 移除 `--ref` 的硬编码 `main` 默认值，允许各模板使用 Catalog 中声明的分支或标签。
- 重写中文 README，使说明与当前命令和能力保持一致。

## 0.3.0

- 增加“项目类型 → 具体模板 → 标准能力”的分层交互。
- 后端与移动端分类在无模板时明确显示为暂未提供。
- 增加通用模板能力协议及 `--features`、`--no-standards` 参数。
- PC 模板接入完整 `@robot-admin/git-standards` 可选能力。
- 调整 Git 初始化顺序，确保依赖安装时 Husky 能正确激活。
- 发布版默认使用 GitHub/Gitee HTTPS 主备源拉取模板。
- npm 包迁移到 `@agile-team/jh4j-cloud-cli` 并配置为公开发布。

## 0.2.0

- 增加外部模板 Catalog 合并与覆盖。
- 增加用户级配置文件和 `config` 命令。
- 增加 Git、HTTP/local tar 模板源与缓存管理。
- 创建过程改为 staging 事务和失败回滚。
- 增加 `--config`、`--no-cache` 和 JSON 输出。
- 增加缓存、Catalog、配置文件与事务故障测试。

## 0.1.0

- 首次实现 `create`、`list`、`doctor`、`info` 和模板校验。
- 接入 `jh4j-ui-template@1.0.0`。
