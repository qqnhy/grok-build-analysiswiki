# Crate 组件索引

下表是从当前 checkout 的 workspace 和章节证据整理出的导航索引。名称是源码中的 crate
或模块称呼；同名的远端服务、CLI 命令或产品功能不代表一定存在同一实现。

| 组件 | 位置/边界 | 关注点 | 延伸阅读 |
| --- | --- | --- | --- |
| `xai-grok-pager-bin` | `crates/codegen/xai-grok-pager-bin` | composition root、CLI 分流、启动 gate | [第 02 章](../../../analysis/02-startup-and-cli.md) |
| `xai-grok-pager` | `crates/codegen/xai-grok-pager` | ratatui 事件循环、slash commands、TUI 渲染 | [第 12 章](../../../analysis/12-tui-and-headless.md) |
| `xai-grok-shell` | `crates/codegen/xai-grok-shell` | ACP、session actor、prompt、持久化与扩展编排 | [第 03 章](../../../analysis/03-agent-loop-and-acp.md) |
| `xai-grok-agent` | `crates/codegen/xai-grok-agent` | agent definition、plugin/skill discovery、tool builder | [第 08 章](../../../analysis/08-mcp-skills-plugins.md) |
| `xai-grok-tools` | `crates/codegen/xai-grok-tools` | typed/JSON tool registry、bridge、workspace tool | [第 04 章](../../../analysis/04-tool-call-runtime.md) |
| `xai-grok-workspace` | `crates/codegen/xai-grok-workspace` | 文件系统、VCS、folder trust 和 workspace facade | [第 13 章](../../../analysis/13-workspace-filesystem-vcs.md) |
| `xai-grok-sandbox` | `crates/codegen/xai-grok-sandbox` | filesystem/network/process profile 与不可逆边界 | [第 09 章](../../../analysis/09-sandbox-permission-trust.md) |
| `xai-grok-sampler` | `crates/codegen/xai-grok-sampler` | Chat/Responses/Anthropic 请求、SSE、重试与取消 | [第 05 章](../../../analysis/05-sampling-and-model-api.md) |
| `xai-grok-memory` | `crates/codegen/xai-grok-memory` | Markdown memory、SQLite FTS/vector、archive | [第 07 章](../../../analysis/07-memory-and-compaction.md) |
| `xai-grok-mcp` | `crates/codegen/xai-grok-mcp` | transport、OAuth、server lifecycle 和 tool schema | [第 08 章](../../../analysis/08-mcp-skills-plugins.md) |
| `xai-chat-state` | `crates/codegen/xai-chat-state` | conversation、usage 和 compaction state | [第 06 章](../../../analysis/06-session-persistence.md) |
| `xai-tool-runtime` | `crates/common/xai-tool-runtime` | 工具 trait、dispatch 和统一事件流 | [第 04 章](../../../analysis/04-tool-call-runtime.md) |

需要函数级证据时，从[代码证据索引](../../../analysis/15-code-evidence-index.md)反向定位，而不是
只根据 crate 名称推断调用关系。
