# 项目概览

Grok Build 是一个以 Rust 编写的终端 coding agent。本 Wiki 不提供另一个客户端，
而是把当前源码 checkout 拆成可复核的阅读路径：先看入口和 session actor，再看工具、
模型、持久化、扩展和宿主安全边界。

## 这份 Wiki 覆盖什么

| 主题 | 你会看到什么 |
| --- | --- |
| 运行时 | CLI/TUI/headless/ACP 入口、Agent loop、turn 和事件流 |
| 能力总线 | typed/JSON tool registry、WorkspaceOps、MCP、Skills、Plugins、Hooks |
| 状态与上下文 | Session/Transcript、Memory、Compaction、Prompt 预算和 resume |
| 宿主边界 | Folder Trust、Permission、Sandbox、文件系统、VCS 和遥测 |
| 审计专题 | 隐私数据流、隐藏命令、Feature Flags 与证据索引 |

## 分析对象与版本

- **产品边界**：分析的是 SpaceXAI 的 Rust 终端 coding agent（命令名 `grok`），不是
  xAI 云端服务或模型本身。
- **源码基线**：源码镜像 `xai-org/grok-build` 的 commit 由仓库根目录 `SOURCE_REF`
  固定；章节中的路径和行号都可以从 GitHub Blob 链接复核。
- **规模口径**：README 中的 2,893 个 Rust 文件、423,653 行统计包含测试源码，且只覆盖
  `crates/codegen/`、`crates/common/` 和 `prod/mc/` 的 git-tracked 文件。

## 推荐入口

1. 先读[阅读路线图](reading-roadmap.md)，按目标选择最短路径。
2. 用[架构快览](architecture-overview.md)建立入口、session、工具和宿主边界的心智模型。
3. 需要按 crate 找实现时，查看[Crate / 组件总览](../components/component-overview.md)
   和[组件索引](../components/component-index.md)。
4. 对安全或隐私结论，回到章节里的源码证据，不要只依据流程图中的概念箭头。

## 读者须知

这是针对一个时间点 checkout 的研究记录，不是官方产品文档。远端策略、feature flag、
服务端响应和发布二进制可能改变最终行为；涉及凭据、网络上传或执行未信任代码时，
请以实际部署策略和官方文档为准。
