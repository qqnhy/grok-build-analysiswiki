# 第十五章：代码证据索引

下表按“可验证结论”反向列出主要源码位置。行号以当前 checkout 为准，代码更新后应重新核对；链接指向本地源码，便于在编辑器中跳转。

| 结论 | 证据 |
|---|---|
| 二进制入口和初始化顺序 | [`main.rs:1906`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-pager-bin/src/main.rs:1906)、[`main.rs:2003`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-pager-bin/src/main.rs:2003) |
| 命令分流 | [`main.rs:2103`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-pager-bin/src/main.rs:2103) |
| CLI 参数与 resume sandbox pin | [`cli.rs:421`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-pager/src/app/cli.rs:421)、[`cli.rs:939`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-pager/src/app/cli.rs:939) |
| ACP agent 建立 | [`agent/app.rs:138`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-shell/src/agent/app.rs:138)、[`app.rs:230`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-shell/src/agent/app.rs:230) |
| prompt 校验、锁与结果 | [`acp_agent.rs:998`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-shell/src/agent/mvp_agent/acp_agent.rs:998)、[`acp_agent.rs:1409`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-shell/src/agent/mvp_agent/acp_agent.rs:1409)、[`acp_agent.rs:1548`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-shell/src/agent/mvp_agent/acp_agent.rs:1548) |
| typed tool 与 stream invariant | [`tool.rs:32`](/home/qiqiang/opensource/grok-build/crates/common/xai-tool-runtime/src/tool.rs:32)、[`tool.rs:114`](/home/qiqiang/opensource/grok-build/crates/common/xai-tool-runtime/src/tool.rs:114) |
| object-safe dispatch | [`dispatch.rs:24`](/home/qiqiang/opensource/grok-build/crates/common/xai-tool-runtime/src/dispatch.rs:24) |
| registry 清单与 finalize | [`types.rs:531`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-tools/src/registry/types.rs:531)、[`types.rs:948`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-tools/src/registry/types.rs:948)、[`types.rs:1760`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-tools/src/registry/types.rs:1760) |
| ToolBridge | [`bridge.rs:49`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-tools/src/bridge.rs:49) |
| sampling 分层 | [`sampler/lib.rs:1`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-sampler/src/lib.rs:1) |
| API 后端与身份头 | [`client.rs:1`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-sampler/src/client.rs:1)、[`client.rs:52`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-sampler/src/client.rs:52) |
| Responses token 修正 | [`client.rs:122`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-sampler/src/client.rs:122) |
| session event JSONL | [`session-events/lib.rs:1`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-session-events/src/lib.rs:1)、[`log.rs:19`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-session-events/src/log.rs:19) |
| session search cache | [`session-search/lib.rs:1`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-session-search/src/lib.rs:1) |
| session persistence FIFO、durable barrier 与 replay | [`persistence.rs:1-14`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-shell/src/session/persistence.rs:1)、[`replay.rs:300-341`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-shell/src/session/storage/replay.rs:300) |
| memory layout/index | [`memory/lib.rs:1`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-memory/src/lib.rs:1)、[`index.rs:80`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-memory/src/index.rs:80) |
| full-replace compaction | [`xai-grok-compaction/lib.rs:22`](/home/qiqiang/opensource/grok-build/crates/common/xai-grok-compaction/src/lib.rs:22)、[`compaction_utils.rs:669`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-chat-state/src/compaction_utils.rs:669) |
| compaction segment Markdown | [`compaction-transcript/lib.rs:432`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-compaction-transcript/src/lib.rs:432) |
| MCP 责任边界 | [`mcp/lib.rs:1`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-mcp/src/lib.rs:1) |
| MCP 凭据隔离/权限 | [`credentials.rs:1`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-mcp/src/credentials.rs:1)、[`credentials.rs:17`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-mcp/src/credentials.rs:17) |
| skills 发现上限与解析 | [`skills/discovery.rs:15`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-tools/src/implementations/skills/discovery.rs:15)、[`discovery.rs:68`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-tools/src/implementations/skills/discovery.rs:68) |
| agent precedence | [`agent/discovery.rs:58`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-agent/src/discovery.rs:58)、[`discovery.rs:275`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-agent/src/discovery.rs:275) |
| workflow 沙箱/预算 | [`workflow/engine.rs:103`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-workflow/src/engine.rs:103)、[`engine.rs:119`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-workflow/src/engine.rs:119) |
| sandbox profile | [`sandbox/lib.rs:161`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-sandbox/src/lib.rs:161)、[`profiles.rs:405`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-sandbox/src/profiles.rs:405) |
| folder trust gate | [`folder_trust.rs:60`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-workspace/src/folder_trust.rs:60)、[`folder_trust.rs:238`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-workspace/src/folder_trust.rs:238) |
| telemetry modes | [`telemetry/config.rs:5`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-telemetry/src/config.rs:5) |
| Sentry 脱敏 | [`telemetry/sentry.rs:29`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-telemetry/src/sentry.rs:29)、[`sentry.rs:193`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-telemetry/src/sentry.rs:193) |
| workspace file index/gitignore | [`file_system/index.rs:535`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-workspace/src/file_system/index.rs:535) |
| prompt 解析、规则注入与预算 | [`prompt_parser.rs:11`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-shell/src/session/prompt_parser.rs:11)、[`prompt_build.rs:381`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-shell/src/session/acp_session_impl/prompt_build.rs:381)、[`system_prompt.rs:1`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-shell/src/util/config/resolve/system_prompt.rs:1) |
| slash registry 可见性与 feature gate | [`slash/registry.rs:108`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-pager/src/slash/registry.rs:108)、[`commands/mod.rs:75`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-pager/src/slash/commands/mod.rs:75)、[`app/cli.rs:8`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-pager/src/app/cli.rs:8) |
| hidden `/gboom`、`/scroll-debug` | [`gboom.rs:14`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-pager/src/slash/commands/gboom.rs:14)、[`scroll_debug.rs:12`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-pager/src/slash/commands/scroll_debug.rs:12) |
| 显式数据出口与本地规避 | [`trace_cmd.rs:35`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-pager/src/trace_cmd.rs:35)、[`effects/mod.rs:3646`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-pager/src/app/effects/mod.rs:3646)、[`external/config.rs:72`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-telemetry/src/external/config.rs:72) |

## 各章最小核心证据

下面每章至少保留一个可直接复核的执行层证据；需要理解完整链路时，再回到对应章节中的证据表。

| 章节 | 核心证据 | 可验证行为 |
|---|---|---|
| 06 Session persistence | [`persistence.rs:1155-1281`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-shell/src/session/persistence.rs:1155) | 单写者队列处理 append/flush 请求并返回 ack；核对 durable barrier 与顺序。 |
| 07 Memory/compaction | [`compaction.rs:1293-1323`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-shell/src/session/compaction.rs:1293) | full-replace 在摘要与 checkpoint 后替换 conversation；核对压缩提交边界。 |
| 08 MCP/skills/plugins/workflow | [`servers.rs:3520-3591`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-mcp/src/servers.rs:3520) | MCP transport 生命周期、超时/重连与工具注册入口。 |
| 09 Sandbox/permission/trust | [`folder_trust.rs:238`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-workspace/src/folder_trust.rs:238) | 项目目录 trust gate 的拒绝/询问分支。 |
| 10 Security/privacy/telemetry | [`sentry.rs:193`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-telemetry/src/sentry.rs:193) | Sentry 事件出口的字段脱敏。 |
| 11 Multi-agent/leader/worktree | [`coordinator.rs:265-358`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-tools/src/implementations/grok_build/task/coordinator.rs:265) | coordinator 单写者 admission/registry 状态转移。 |
| 12 TUI/headless | [`app/mod.rs:903-999`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-pager/src/app/mod.rs:903) | terminal 初始化、leader 连接及 embedded fallback。 |
| 13 Workspace/filesystem/VCS | [`workspace_ops.rs:1581`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-workspace/src/workspace_ops.rs:1581) | Local/Proxy facade 的统一 dispatch。 |
| 14 Tests/performance/engineering | [`Cargo.toml:214-272`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-pager/Cargo.toml:214) | pager 测试 root、PTY/leader 分池及 ignore 约束。 |
| 18 Privacy/data flow | [`trace_cmd.rs:35`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-pager/src/trace_cmd.rs:35) | `--local` 在 trace 命令入口短路远程上传；其余 feedback/memory/OTel 出口见第 18 章。 |
| 19 Hidden/features | [`registry.rs:190-214`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-pager/src/slash/registry.rs:190) | 菜单隐藏与 typed dispatch 的区别，以及 required-tool fail-closed。 |
| 20 Prompt management | [`prompt_build.rs:381-499`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-shell/src/session/acp_session_impl/prompt_build.rs:381) | 大消息 head/tail 限长、offload 失败降级与隐私边界。 |

## 证据使用规则

- 只把源码明确写出的行为称为“实现”；远端 API、策略服务和部署默认值另行标注。
- 同一结论若跨层，至少列出入口层和执行层两个证据点。
- 行号是定位提示，不是 API 稳定性承诺；审计时应同时阅读相邻函数和测试。
