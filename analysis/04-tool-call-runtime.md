# 第四章：Tool Call、Registry 与流式协议

## 结论

工具系统用两层 trait 解决 Rust 类型安全与动态注册的冲突：具体工具实现 typed
`Tool<Args, Output>`，registry 通过对象安全的 `ToolDyn/ToolDispatch` 接受 JSON。所有
调用都遵守 `Progress* + Terminal` 流不变量，因而同一工具可以被模型、ACP、TUI、MCP
适配器和 headless 输出共同消费。

## 统一工具协议

`crates/common/xai-tool-runtime/src/tool.rs:32` 定义 `Tool`：

- `Args` 必须可从 JSON 反序列化并有 JSON Schema（36–47）；
- `description()`、`capabilities()`、`should_list()` 可按 turn context 动态决定模型清单
  （49–77）；
- 默认 `execute()` 把 blocking `run()` 包成单项 terminal stream（79–112）。

流类型和不变量在 `tool.rs:114`–`125`：零个或多个 `Progress`，最后且仅一个
`Terminal(Result<...>)`。`terminal_only()` 与 `with_progress()`（202–226）是工具作者
应使用的构造器。类型擦除后的 `TypedToolOutput` 同时保存序列化 JSON、模型可见 content
blocks 和可选 chat-completion frame（229–302）。

`crates/common/xai-tool-runtime/src/dispatch.rs:24` 的 `ToolDispatch` 是对象安全入口：
`call(tool_id, args, ctx)` 返回流，`call_terminal()` 默认 drain progress、遇到第一个
Terminal 即返回（31–67）。这让上层不需要知道 futures/具体工具类型。

## Registry 构建阶段

`crates/codegen/xai-grok-tools/src/registry/types.rs:531`–`641` 的
`ToolRegistryBuilder` 负责 typed 注册和名称映射。内置清单在 677–767，覆盖：

- Bash/terminal、read/edit/search/list/grep；
- task/background/wait/kill、todo/goal/workflow；
- WebSearch/WebFetch、LSP、image/video；
- plan、ask-user、monitor/scheduler；
- Codex/OpenCode 兼容工具；
- memory/search/use_tool 以及 concise/hashline 变体。

构建器在 795–937 做配置校验：重复 MCP client name、`standard` 与 `hashline` 互斥、
requirements 和工具依赖都在 finalize 前 fail-fast。

## `finalize()` 注入资源

`types.rs:948`–`1275` 的 `finalize()` 把工具从“定义”变成 session 可执行的
`FinalizedToolset`：

1. 创建共享 `Resources`，注入 terminal、filesystem、cwd、session env；
2. 注入 skills、memory、LSP、Web、image/video client；
3. 恢复 `resources_state.json`，建立 scheduler；
4. 固化 tool metadata、template renderer 和 permission 所需上下文。

资源对象是跨工具的依赖注入容器；工具自身不必重新发现 cwd、session id 或后台任务。

## 调用尾部的统一语义

底层调用在 `types.rs:1501`–`1675` 完成 JSON decode、stream drain、取消 token、行为版本
和参数反映射；1682–1758 生成 `DispatchParts`。无论工具实现来自内置、MCP 还是兼容层，
1760–1809 的 post-dispatch tail 都统一执行：

- 输出转换与 content extraction；
- reminder/prompt text 注入；
- resource persistence；
- `ToolRunResult` 封装。

这条尾部是权限事件、工具结果渲染和 session 保存的“单一汇合点”，也是审计工具行为时
最值得优先阅读的路径。

## Bridge 与动态 Skills

`crates/codegen/xai-grok-tools/src/bridge.rs:49` 的 `ToolBridge` 适配 shell session 与
registry；98–213 提供定义、名字/种类解析和调用，278–414 负责 skills discovery 动态更新，
479–520 管理前台/后台 terminal 的 background/kill。shell 侧只需持有 bridge，不直接依赖
每一个 concrete tool。

## 取消、并发与模型可见性

- `should_list()` 决定工具是否出现在当前 turn 的模型 manifest；可动态隐藏不适用工具。
- capability flags（并发、scope、frame cap）由 registry 统一读取，避免每个调用者各自实现。
- stream terminal 是强约束：工具若违反，dispatcher 只能把 malformed stream 当错误处理；
  这比“返回任意 JSON”更容易做跨 transport 的一致测试。
- gitignore filter、display cwd、session owner 等都通过 `Resources` 注入，工具看到的是
  已经过滤/虚拟化的路径，不应直接绕过 workspace 层访问宿主。

## 风险观察

工具 registry 的扩展性很强，意味着新工具同时获得 terminal、文件和网络资源；真正的安全
边界不在 trait，而在后续 permission、trust 和 sandbox（见第 09 章）。MCP/插件注册必须
经过来源与信任门控，否则“动态可见”会变成“动态可执行”。
