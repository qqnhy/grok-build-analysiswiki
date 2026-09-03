# TUI 与 Headless 运行路径

本章对比交互式 pager 与脚本化 headless 的启动、会话物化、ACP 驱动和退出语义。两条路径共享 `MvpAgent`、SessionActor、工具和 workspace，但在 terminal、输出和等待策略上刻意分开。

## 交互 TUI 启动阶段

入口是 `crates/codegen/xai-grok-pager/src/app/mod.rs:612` 的 `app::run`，调用方是组合根 `main.rs:2003` 的非 headless 分支。

| 阶段 | 代码证据 | 行为 |
| --- | --- | --- |
| 配置与认证预热 | `app/mod.rs:621-656` | 读取有效 TOML，必要时执行 pre-TUI external login；在有界超时内刷新 auth，同时启动 models/settings prefetch、HTTP client warm-up 和 cwd Git 信息任务。 |
| 远端 settings 与策略 | `app/mod.rs:661-695` | 等待早期 prefetch、缓存 auto/prompt suggestions/campaigns，解析 leader 是否被 CLI、策略或 sandbox 禁用。chat 模式与 leader 冲突会在终端初始化前报错。 |
| session startup intent | `app/mod.rs:740-746` | 根据新建、`--resume`、`--continue`、fork/worktree 选项物化启动状态；恢复可触发本地历史重放或远程存储恢复。 |
| flags 与屏幕策略 | `app/mod.rs:794-901` | 汇总 model/effort/permission/tool/MCP 等 ConnectFlags；依据 config、CLI、tmux/control mode 和 mouse leak 选择 fullscreen/minimal。 |
| 终端与连接 | `app/mod.rs:903-999` | 起 writer thread、初始化 terminal；按有界 connect budget 连接 leader 或 embedded。leader 失败时若未取消，记录 telemetry 后用同一 flags fallback embedded。 |
| event loop | `app/mod.rs:1040-1060` → `event_loop.rs:1076` | 传入 ACP channel、models、commands、materialized startup、config watcher 和 writer events；event loop 构造 AppView 并开始消费 UI/ACP/后台事件。 |

### 屏幕与连接的独立性

屏幕模式先于 agent 连接解析并初始化，因此 connect 失败可以安全恢复终端；`restore_terminal` 在失败和正常退出都执行（`app/mod.rs:1017-1027,1060` 附近）。minimal 不是另一套 agent：它只改变 terminal ownership、鼠标报告和渲染布局，ACP/session 语义相同。`pager-bin/main` 调用 `xai_grok_pager_minimal::install()` 安装反向依赖无法表达的 IoC hook（`main.rs:1923-1929`）。

## TUI event loop

`app/event_loop.rs:1076-1091` 的函数收到已经握手的 `AcpConnection`，然后在 `1092-1115` 初始化 unified log、`AppView`、leader 标志、screen mode 和 action registry。之后的循环同时处理：

- crossterm 输入、resize、鼠标/选择、paste、外部 editor 和 screen-mode relaunch；
- ACP agent notifications（assistant chunks、tool calls、permission prompts、session updates）；
- config/appearance、leader roster/status、writer thread 和后台 update channel；
- 本地队列/interjection/plan approval，并把用户输入变成 ACP `PromptRequest`。

AppView 只保留呈现与交互状态；模型历史、工具状态和持久化由 shell session actor 持有。这样多个 leader client 可以各自有 viewport，同时共享服务端 session。event loop 退出后，`app/mod.rs` 清理 signal handler、flush unified log、恢复 terminal、释放 `AgentShutdownGuard`，再杀掉遗留 process scope（`app/mod.rs:1060-1103`）。

## Headless 单 turn

入口 `crates/codegen/xai-grok-pager/src/headless.rs:762` 的 `run_single_turn`，由 `main.rs` 在检测到 `--single`、`--prompt-json`、`--prompt-file` 或 `--memory-flush` 后调用。其生命周期如下：

1. **解析运行上下文**（`headless.rs:767-849`）：设置 headless client mode，canonicalize cwd，建立 `HeadlessEmitter`；读取 config，提前写入 model/effort，解析 agent/tools/disallowed-tools/allow-deny/max-turns/permission mode，并可授予 folder trust。
2. **spawn + ACP initialize/auth**（`850-928`）：`spawn_grok_shell` 创建 embedded agent 和 cancellation guard；通过 ACP 发 initialize，再用返回的 auth methods 执行 authenticate。失败会写入 emitter、结束 startup telemetry，并让 guard 回收 agent thread。
3. **session materialization**（`930-1019`）：把 resume/continue/fork 解析为 `MaterializedStartup`。headless 明确 `has_worktree=false`（`headless.rs:740-758`），因此不会隐式创建 worktree；然后执行 new/open/load/fork，返回 session id、模型目录和 cwd。
4. **输出上下文与模型解析**（`1021-1080`）：可选登记 active session；先向 emitter 写 session metadata，再按需刷新 model catalog，应用 `--model` 与 reasoning effort。
5. **prompt 与后台任务**（`headless.rs:1080` 之后）：将 prompt blocks 封装为 ACP `PromptRequest`，循环消费 ACP 消息并增量写 stdout。`wait_for_background` 开启时，收到 PromptResponse 后继续追踪 background/subagent id，直到清空或达到 `background_wait_timeout`；关闭时仍有短 grace drain，避免丢掉末尾事件。
6. **收尾**：stdout 写失败会停止 stream loop，但仍走连接关闭、pending background 处理和 guard drop；不初始化 alternate screen，也不依赖 terminal restore。结构化 output format（plain/json/streaming messages JSON）由 `HeadlessEmitter` 统一编码，错误不会混入正常 JSON stream。

## 三种 shell 入口的差异

`xai-grok-shell/src/agent/app.rs` 还提供独立进程入口：

| 入口 | 证据 | 特征 |
| --- | --- | --- |
| `run_stdio_agent` | `app.rs:230-308` | stdin reader 写入 simplex channel，stdout 为 ACP writer；注册长期 fs-watch runtime，在 LocalSet 中创建 auth manager、MvpAgent 和 IO handler；stdin EOF 后延迟关闭 channel。 |
| `run_headless` | `app.rs:311-390` | agent 自己处理 auth/relay 与模型预取，设置 `AgentMode::Headless`，通过 grok.com relay/WebSocket 连接而非 TUI stdout。适合旧式独立 headless agent API。 |
| `run_leader` | `app.rs:680-900` | 先抢 leader flock，再清理 socket、启动 IPC server、等待 socket ready，完成有界非交互 auth 后发送 ready；随后在 LocalSet 中运行 agent、IPC/WS bridge、relay、config watcher。多客户端复用一个 agent。 |

pager 的 `headless::run_single_turn` 与 shell 的 `run_headless` 都叫 headless，但前者是“pager 驱动 ACP 并负责 stdout reducer”的单次命令路径，后者是“shell 作为独立服务并连接 relay”的服务路径；不要把两者当成同一入口。

## TUI 与 headless 对照

| 维度 | TUI | Headless |
| --- | --- | --- |
| terminal | raw mode、fullscreen/minimal、writer thread、鼠标/剪贴板 | 不接管 terminal；stdout 是协议输出，stderr 承载诊断 |
| agent 连接 | 可 leader，失败自动 embedded fallback | `run_single_turn` 固定 embedded；独立 shell headless 另有 relay |
| session | welcome/dashboard、交互队列、resume/fork/worktree | new/resume/continue/fork；不创建 worktree |
| 输出 | AppView 消费 ACP 通知并渲染 | `HeadlessEmitter` 编码 plain/json/streaming JSON，支持 JSON schema |
| 后台任务 | UI 中显示、由 event loop 管理 | 可等待，具有明确超时；不等待也会短暂 drain |
| 退出 | 恢复终端、关闭 agent/workspace、可触发更新 relaunch | guard/cancel/flush；stdout 错误不跳过回收 |

## 错误、取消与可观测性

连接阶段用 startup timer 区分 ConfigLoad、LeaderConnect/AgentSpawn、ACP Initialize、EagerAuth 等 phase；leader fallback 会把第一次失败作为 `EarlierAttempt` 附到第二次 telemetry。Session/turn 阶段不混入 connect histogram（headless `922-928` 明确如此）。按 Ctrl-C/Esc 的取消本质是取消 turn task 和 sampler request，再由 SessionActor 的 finalization lease 确保队列状态不会被旧 completion 污染。

排查启动卡住时先看 `GROK_CONNECT_UI_TIMEOUT`（`app/mod.rs:927-935`）与 startup phase telemetry；排查“提示词完成但进程不退”时看 headless background wait；排查 TUI 花屏时先确认 event loop 是否已进入、terminal restore 是否报错，而不是先怀疑模型 API。

## 相关测试入口

pager manifest 将 PTY 测试拆成 smoke、queue、scroll/selection、minimal、config、shell-tools、persistence、clipboard 和 leader 家族（`xai-grok-pager/Cargo.toml:214-272`）。大多数 PTY case 标为 `#[ignore]`，需要 `PAGER_BINARY`；settings_e2e 和 scripted/auto 入口则单独声明。headless 的 session、output、background 等逻辑可在 pager 单元测试或 shell 的 ACP session tests 中不启动真实 terminal 地覆盖。
