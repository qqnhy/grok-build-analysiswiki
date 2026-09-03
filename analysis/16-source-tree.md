# 第十六章：源码树与 crate 地图

## Workspace 分层

根 `Cargo.toml:6`–`106` 是自动生成 workspace，edition 2024、resolver 2；当前 checkout
约 93 个 package。按依赖方向可以分为五层：

```text
third_party / crates/common
        ↓
build + protocol + runtime primitives
        ↓
codegen leaf crates (config, auth, mcp, sampler, sandbox, memory)
        ↓
xai-grok-workspace + xai-grok-tools + xai-grok-agent
        ↓
xai-grok-shell + xai-grok-pager
        ↓
xai-grok-pager-bin (composition root)
```

## 主要目录说明

| 目录 | 代表 crate | 责任 |
|---|---|---|
| `crates/common/` | `xai-tool-runtime`, `xai-grok-compaction`, `xai-tool-types` | 与宿主无关的协议、工具流、压缩抽象 |
| `crates/build/` | `xai-proto-build` | protobuf/代码生成 |
| `crates/codegen/` | `xai-grok-shell`, `xai-grok-tools`, `xai-grok-workspace` | 产品主体与平台能力 |
| `prod/mc/` | `cli-chat-proxy-types` | 生产侧协议类型 |
| `third_party/` | Mermaid/dagre/graphlib | vendored 图渲染依赖 |

## Shell crate 的内部树

`xai-grok-shell/src/lib.rs:14`–`47` 导出 agent、auth、config、extensions、leader、MCP、
remote、sampling、session、tools、upload 等模块。`src/session/` 是最大的编排目录，包含：

- `acp_session.rs`、`handle.rs`、`commands.rs`：session actor 和命令 mailbox；
- `persistence.rs`、`chat_persistence.rs`、`export.rs`：本地/远端存储；
- `compaction.rs`、`compaction_segments.rs`：上下文压缩与片段；
- `mcp_*`、`memory_*`、`goal_*`、`message_delivery.rs`：扩展、记忆、长期任务和队列；
- `worktree*.rs`、`merge.rs`：隔离 checkout 与结果合并。

## Pager crate 的 UI 树

`xai-grok-pager/src/app/` 集中事件循环、session startup、modal、status line、inline/minimal
渲染、foreign session 和 ACP tracker；`src/components/`、`src/render/` 负责可视化；命令模块
（mcp/plugin/worktree/sessions/memory 等）与 TUI 共用 shell service。

## 测试与基准分布

每个核心 crate 旁边都有 `tests/` 或 `#[cfg(test)]`：MCP transport、sandbox profile、
session persistence、compaction edge cases、workspace file index、pager event loop 都有
专门测试。`benches/` 出现在 pager、shell、fsnotify、ratatui 等 crate，用于渲染、搜索和
终端性能回归（详见第 14 章）。

## 生成与同步边界

根 README:109–111 明确指出根 `Cargo.toml` 是生成文件；`SOURCE_REV` 保存 monorepo commit。
因此分析或修改应优先落在 per-crate `Cargo.toml` 和源码，不能把根 manifest 当成手写配置。
