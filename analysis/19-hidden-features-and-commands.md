# 第十九章：隐藏命令、Feature Flags 与产品彩蛋

## 结论

Grok Build 的“隐藏”不是单一机制，而是四种不同的可见性策略：

1. **硬隐藏**：命令既不出现在补全菜单，也不能被 typed dispatch 解析（例如 feature 未开启的 `/dashboard`、`/voice`、`/auto`）。
2. **菜单隐藏**：不提供下拉/ghost completion，但用户知道名字仍可执行（例如 `/share`、某些维护命令）。
3. **动态隐藏**：根据当前工具集、screen mode、权限或 session 状态改变可见性（例如需要 `scheduler_create` 的 `/loop`）。
4. **CLI/构建隐藏**：Clap 的 `hide = true`、`cfg(feature = ...)` 或内部参数只在特定构建/调用链出现（例如 `workspace`、`--trigger`、`login --devbox`）。

这些策略有助于灰度发布和保持菜单简洁，但也造成“源码可调用、用户不可发现”和“环境变量覆盖远端策略”的审计难点。Feature resolver 的层级是 requirement pin > CLI/env > 本地配置 > managed/remote > 默认值；不能把某个 TOML 字段的值当作最终生效值。

## 1. Slash 命令注册表：完整集合与可见性

`builtin_commands()` 是 pager 内置命令的单一来源，注册 tutorial、settings、dashboard、workflows、plugin、voice、model、context、compaction、fork/resume、plan/remember/rewind、session export/find/usage、MCP/hooks、theme/auto/vim、image/video、privacy、doctor、import、login/logout、`gboom` 和 `scroll-debug` 等（[`xai-grok-pager/src/slash/commands/mod.rs:1-139`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-pager/src/slash/commands/mod.rs:1)）。命令本身可声明 `required_tools()`、`session_scoped` 和参数形态，registry 再叠加环境/状态 gate。

Registry 明确区分 `hidden` 与 `menu_hidden`：前者影响 `get_for_dispatch()`，后者只影响 completion；缺少 required tool 的命令同样从菜单和 dispatch 中过滤（[`xai-grok-pager/src/slash/registry.rs:100-140`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-pager/src/slash/registry.rs:100)；[`registry.rs:191-211`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-pager/src/slash/registry.rs:191)）。这解释了为什么“在帮助里找不到”不一定表示命令不存在。

典型动态 gate 包括：

- `/loop` 只有在 ACP 工具集中存在 `scheduler_create` 时才解析；缺少工具时 fail-closed。
- `/share` 默认 menu-hidden，但可由 `set_share_visible` 在策略允许时公开；当前 share handler 仍返回 disabled（见第 18 章）。
- `/dashboard`、`/recap`、`/voice`、`/auto` 默认 hard-hidden，由 feature/能力初始化后显式 reveal；`/auto` 未可用时连 typed dispatch 也拒绝。
- plugin 相关命令由 plugin visibility gate 控制，工具或权限变化时 registry 会重建索引。

## 2. 真正的隐藏彩蛋与诊断入口

### `/gboom`

`GboomCommand::visible()` 永远返回 `false`，因此从不进入 slash 下拉；只有精确输入裸 `/gboom` 才发出 `OpenGboom` action，带参数时按未知命令原样 pass-through（[`gboom.rs:1-38`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-pager/src/slash/commands/gboom.rs:1)）。实现注释说明它通过 kitty graphics protocol 渲染一个小型 raycaster shooter；这属于 UI 彩蛋，不是 agent 能力。

### `/scroll-debug` 与 `GROK_SCROLL_DEBUG`

`/scroll-debug` 同样永不显示，裸命令切换滚动诊断 HUD，带参数则 pass-through；源码注释还指出 `GROK_SCROLL_DEBUG=1` 可在启动时启用 HUD（[`scroll_debug.rs:1-32`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-pager/src/slash/commands/scroll_debug.rs:1)）。该开关会改变渲染诊断信息，不应在共享屏幕或录屏环境启用。

### 隐藏的子进程 helper

主入口在完整 CLI 初始化之前检查 Mermaid 渲染和 voice capture helper；voice 模块注释说明 macOS 麦克风通过隐藏 `__mic-capture` 模式在进程外捕获（[`xai-grok-pager-bin/src/main.rs:1906-1915`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-pager-bin/src/main.rs:1906)；[`xai-grok-pager/src/voice/mod.rs:1-26`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-pager/src/voice/mod.rs:1)）。这是实现细节而非稳定公共 CLI；安全审计必须把 helper 的环境继承、麦克风权限和临时文件纳入范围。

## 3. 隐藏/内部 CLI 参数

顶层 `Command` 枚举里有多个对普通 `--help` 隐藏或仅用于兼容的入口（[`xai-grok-pager/src/app/cli.rs:8-148`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-pager/src/app/cli.rs:8)）：

| 入口 | 隐藏方式 | 用途与边界 |
|---|---|---|
| `share` | `#[command(hide = true)]` | 会话共享控制面；当前实现返回 disabled。 |
| `workspace` | `hide = true` + server-side gate | 暴露 workspace 给 Computer Hub；`GROK_WORKSPACE_COMMAND=1` 只用于本地测试/显式启用。 |
| `wrap` | `hide = true`（平台相关） | 在本地 PTY 包装任意命令并转发 OSC 52 剪贴板；它不是 sandbox 绕过许可。 |
| `login --devbox` | clap `arg(skip)`/feature `devbox-login` | 远程开发认证，构建不带该 feature 时字段仍存在但不会注册 flag。 |
| `update --trigger`、`--auto` | `hide = true` | 记录自动更新来源，旧父进程兼容；不应由用户脚本伪造。 |
| `disk-usage` | canonical name `du`，alias `disk-usage` | 诊断 `$GROK_HOME` 磁盘占用，属于低调入口而非安全边界。 |

`main.rs` 对 workspace 和 dashboard 做额外启动 gate：workspace 由远端设置或 `GROK_WORKSPACE_COMMAND` 覆盖，dashboard 被显式禁用时在 TUI 启动前返回错误（[`main.rs:451-540`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-pager-bin/src/main.rs:451)；[`main.rs:1635-1658`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-pager-bin/src/main.rs:1635)）。因此仅凭 Clap 是否显示命令不能判断最终是否可执行。

## 4. Feature resolver：灰度、覆盖与“看似关闭”陷阱

`Config::feature_sources` 收集 requirement pin、本地 `[features]`、远端 settings 和进程环境，再由 `Feature::resolve` 计算最终值；调用方应使用 `is_feature_enabled()`/`feature_off_reason()`，不要直接读取反序列化的 `Features` 字段（[`xai-grok-shell/src/agent/config.rs:2547-2562`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-shell/src/agent/config.rs:2547)）。代码注释给出的通用优先级是 `requirement > CLI/env > config > remote > default`，具体 resolver 可能增加 managed 层。

当前可由源码确认的 feature 族包括：

| 族 | 代表键/环境变量 | 影响 |
|---|---|---|
| 隐私与观测 | `features.telemetry`、`GROK_TELEMETRY_ENABLED`、`GROK_EXTERNAL_OTEL` | telemetry mode、customer OTLP 内容 gate；external OTLP 需双重显式开启。 |
| 生成能力 | `image_gen`、`video_gen`、`GROK_IMAGE_GEN`、`GROK_VIDEO_GEN` | `/imagine`、`/imagine-video` 与对应工具；模型 override 另有 env/config/remote 层。 |
| 上下文 | `two_pass_compaction`、`GROK_COMPACTION_MODE`、`GROK_COMPACTION_DETAIL` | compaction 触发、详情和 transcript segment 输出。 |
| 多 agent | `GROK_SUBAGENTS`、`[subagents].enabled` | Task/subagent 工具与 child session。 |
| MCP 生命周期 | `GROK_MCP_LIVENESS_WATCHERS`、`GROK_MCP_AUTO_RESTART`、`GROK_MCP_PUSH_SERVER_STATUS`、`GROK_MCP_RECURSIVE_CONFIG_WATCH` | watcher、stdio 重启、status push、项目配置 watch。 |
| 目标/工作流 | `GROK_GOAL*`、`features.workflows` | goal planner/verifier 与 Rhai workflow。 |
| UI 灰度 | `GROK_AGENT_DASHBOARD`、`GROK_SCROLL_DEBUG`、voice/recap flags | dashboard、诊断 HUD、voice/recap 命令可见性。 |

`Features` 结构本身还明确声明 codebase indexing、non-git warning、managed config、title refresh、memory/compaction 等字段（[`config.rs:4522-4640`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-shell/src/agent/config.rs:4522)）。其中部分 MCP 字段为了容忍未来配置而从 raw TOML out-of-band 重读；例如 `[features] mcp_push_server_status=false` 不会改变 pager 侧 env-only cache，必须设置 `GROK_MCP_PUSH_SERVER_STATUS=0` 才能可靠关闭。这是典型“配置看似生效但消费者未读取”的陷阱。

## 5. 构建 feature 与版本差异

CLI 还通过 Cargo `cfg(feature = ...)` 改变命令/依赖集合：`local-workspace` 才编译 `--local-workspace`，`devbox-login` 才注册对应登录参数；`jemalloc`、`release-dist` 会改变 allocator、bundle 和启动路径（[`xai-grok-pager/src/app/cli.rs:600-620`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-pager/src/app/cli.rs:600)；[`xai-grok-pager-bin/src/main.rs:8-15`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-pager-bin/src/main.rs:8)）。因此“源码里存在”不表示当前发行二进制暴露；审计/回归至少要覆盖默认 Cargo、发布 feature 和 Bazel feature-unification 图。

## 6. 审计与运维建议

1. 生成命令清单时同时记录三列：`builtin_commands` 注册、registry visibility、最终 dispatch 可达；不要仅抓 `--help` 或 slash 文档。
2. 对每个 feature 记录 pin/config/env/remote/default 五层及 `feature_off_reason()`；发布时把远端 settings snapshot 固化到构建/运行报告。
3. 在生产环境关闭 `/scroll-debug`、`GROK_SCROLL_DEBUG`、gboom helper 和不需要的 voice；录屏、CI、remote relay 进程避免继承调试环境变量。
4. 把 `workspace`、MCP HTTP、hook HTTP 和 `wrap` 当作高权限边界，分别核对 folder trust、permission、sandbox 与网络策略。
5. 对 hidden CLI 做 smoke tests：未知参数应失败、旧兼容 alias 不能绕过 policy、feature-off 命令必须 fail-closed；这比只检查帮助文本更能防止灰度泄漏。

## 证据索引

| 主题 | 证据 |
|---|---|
| 内置 slash 命令全集 | [`commands/mod.rs:1-139`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-pager/src/slash/commands/mod.rs:1) |
| hard/menu hidden 与 required tool | [`slash/registry.rs:100-211`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-pager/src/slash/registry.rs:100) |
| gboom 彩蛋 | [`gboom.rs:1-38`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-pager/src/slash/commands/gboom.rs:1) |
| scroll-debug | [`scroll_debug.rs:1-32`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-pager/src/slash/commands/scroll_debug.rs:1) |
| 顶层 hidden CLI | [`app/cli.rs:8-148`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-pager/src/app/cli.rs:8) |
| workspace/dashboard gate | [`main.rs:451-540`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-pager-bin/src/main.rs:451)、[`main.rs:1635-1658`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-pager-bin/src/main.rs:1635) |
| feature precedence | [`config.rs:2547-2562`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-shell/src/agent/config.rs:2547) |
