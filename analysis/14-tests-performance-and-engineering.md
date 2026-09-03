# 测试、性能与工程流程

本仓库是大型 Rust workspace，测试策略不是“全 workspace 一次跑完”，而是按边界拆分：纯单元测试保障状态算法，mock ACP/HTTP 测试保障 actor/协议，PTY 测试保障真实 terminal，leader/workspace 测试保障多进程和 sandbox。根 `Cargo.toml` 是生成文件，版本和构建脚本也属于可复现构建的一部分。

## 测试分层

| 层级 | 位置/入口 | 覆盖重点 | 运行成本 |
| --- | --- | --- | --- |
| 纯单元 | 各 crate `src/**/tests`、`#[cfg(test)]` | parser、permission、queue、compaction、path containment、Git 状态转换、stream classify | 低；适合每次改动运行 |
| actor/协议集成 | `xai-grok-sampler`、`xai-chat-state`、shell `session/acp_session_tests` 与 `tests/acp_harness` | mocked SSE/ACP、取消、重试、usage/persistence、session lifecycle | 中；无需真实 TUI/网络 |
| pager 集成 | `xai-grok-pager/tests/*.rs` | command dispatch、settings、scripted scenarios、minimal/clipboard/doctor | 中到高 |
| PTY e2e | `pager/tests/pty_e2e/`，由多个 `[[test]]` root 组织 | 键盘/鼠标、scrollback、resize、terminal restore、队列/interjection、真实渲染 | 高；启动真实 binary，普通 Cargo 默认 ignore |
| leader 多进程 | `pager/tests/leader_pty_e2e/`、shell `test_leader_*` | flock/socket、共享 session、reattach、durable log、fallback | 高；与普通 PTY 分池 |
| workspace/server | `xai-grok-workspace/src/**` tests、shell `test_leader_sandbox_confinement` | root confinement、symlink、Git checkpoint、Hub RPC、daemon/reconnect | 中到高 |

pager manifest 的测试 root 在 `xai-grok-pager/Cargo.toml:214-272`：smoke、queue、scroll_selection、minimal、config_ui、shell_tools、persistence、clipboard、leader、settings、scripted、auto。注释明确所有 PTY case 普通 Cargo 仍 `#[ignore]`，选定运行需提供 `PAGER_BINARY`；settings_e2e 不走 ignore。shell manifest 的 startup prefetch 集成测试要求 `test-support` feature（`xai-grok-shell/Cargo.toml:262-280`）。

## PTY harness 的可观测设计

`xai-grok-pager-pty-harness/src/lib.rs:1-46` 将 harness 分为：

1. `pty`：spawn、写入按键、resize、drain；
2. `screen`：以 `alacritty_terminal` 维护虚拟屏幕，断言用户实际看到的文本；
3. `timing`：解析 `?2026 h/l` frame marker，得到每帧耗时；
4. `content`：启动 mock inference server，驱动确定性 SSE/模型响应；
5. `scenarios`/`results`：参数化负载、聚合统计和 baseline compare；
6. `scroll_matrix`/`scripted`：滚动验证矩阵与声明式场景。

测试应优先使用 `PtyHarness::new_in_sandbox`/`spawn_with_content`（约 `lib.rs:100-220`），让 `GROK_HOME`、凭证、模型 endpoint 和 cwd 在隔离 sandbox 内固定。真实终端查询默认不回送；minimal 测试需要 `set_respond_to_queries(true)`，否则启动 cursor-position probe 可能降级到 fullscreen。PTY 公共 helper 还会记录 asciinema cast、纯文本/HTML 屏幕快照（`pager/tests/pty_e2e/common.rs:1218-1248`）。

## 确定性与并行陷阱

- Shell/workspace 测试会修改 `GROK_HOME`、`HOME` 等 process-global 环境；workspace 提供 crate 级 `ENV_TEST_LOCK`/`LockedTestEnv`（`workspace/src/lib.rs:70-150`）来保证 `cargo test --lib` 多线程时不互相污染。
- Sampler、auth refresh 和 timeout 测试大量使用 `#[tokio::test(start_paused = true)]`；shell 的 `test-util` feature 为 paused virtual clock 提供支持（`xai-grok-shell/Cargo.toml:233-239`）。
- PTY 进程共享 CPU、agent LocalSet 和 mock server；resume 比 cold start 重，公共 helper 将 `RESUME_TIMEOUT` 设为 120s（`pager/tests/pty_e2e/common.rs:24-37`），不要把单机经验阈值硬编码到 CI。
- leader PTY 单独拆 target，是为了避免多进程 cluster bring-up 与普通家族争用 bounded libtest workers（`pager/Cargo.toml:254-256`）。

## 性能路径与已有仪表

### 启动

TUI 在连接前并行做 auth refresh、model/settings prefetch、HTTP warm-up 和 Git info（`pager/src/app/mod.rs:643-666`）；connect budget、各 phase timer、prefetch wait 都写 startup telemetry。若修改 startup 顺序，应保持“可并行的网络/磁盘预热不阻塞 terminal 初始化”的目标，并重新检查 leader fallback 的总预算。

### Agent/session

SessionActor 串行处理 command/chat events，turn 长任务通过 `AgentTask`/LocalSet；ChatStateActor 负责顺序 persistence，避免每个查询复制完整 conversation。最重的单 turn 热点通常是 tool catalog/MCP readiness、prompt build/compaction、模型首 token 和工具执行；turn span 已记录 `tool_prep`、`ttft`、model calls、token usage 等字段（`session/acp_session_impl/turn.rs:2264-2339`）。

### Sampling

`xai-grok-sampler/src/lib.rs:1-28` 的三层 API 将 raw HTTP、stream event 和 actor orchestration 分开；`actor/mod.rs:1-108` 的 actor 只维护 active request，实际流式请求在 `JoinSet` task 并行。重试 backoff、429 budget、取消和 doom-loop recovery 是 latency 与成本的主要变量；变更时应同时看 sampler metrics 和 shell turn telemetry。

### Rendering/PTY

pager 有 `render`、`search`、`edit_highlight`、`resize` benchmark（`xai-grok-pager/Cargo.toml:198-212`），shell 有 `session_list`、`fork_copy`、`skills_watcher_startup`、`child_replay_lookup`（`xai-grok-shell/Cargo.toml:241-258`）。PTY harness 可以把 frame timing 输出为 JSON 并与 baseline 比较；滚动/大 markdown 负载应优先用 `scroll_stress`、`large_codeblock` 场景，而不是只看 unit benchmark。

## 可复现构建与发布

1. **工具链**：`rust-toolchain.toml:1-18` 固定 Rust 1.94.0、rustfmt/clippy，并声明 x86_64/aarch64 GNU targets。开发机应先安装 `rustup` 和 DotSlash；README 的 Building 部分说明 `bin/protoc` 通过 DotSlash 解析。
2. **目标 hardening**：`.cargo/config.toml` 为 musl 设置 full RELRO、立即绑定和 non-executable stack；Apple Silicon/Linux page size 环境变量供 jemalloc build 使用。迁移 Cargo/Bazel 时必须保留等价 linker flags。
3. **版本注入**：`xai-grok-pager-bin/build.rs:1-46` 监听 Git HEAD/log refs，注入 `VERSION_WITH_COMMIT`；源码树无可用 Git 时回退 `unknown`，因此 release artifact 的版本显示来自编译时环境。
4. **工具 bundle**：shell `build.rs` release 时打包 ripgrep（可用 `GROK_SHELL_BUNDLE_RG_PATH` 覆盖）；tools `build.rs` 可打包 rg/fd/bfs/ugrep，fd tarball 在解压前做 SHA-256 pin。debug `cargo check` 会跳过自动下载，离线构建应提供本地 override。
5. **proto codegen**：`crates/build/xai-proto-build` 封装 tonic/prost/protoc 调用和 rerun dependency tracking；`bin/protoc` 或 PATH 上的 protoc 缺失会在相关 crate build script 阶段失败。

## 推荐验证命令

```text
cargo check -p xai-grok-pager-bin       # 组合根快速编译
cargo test -p xai-grok-config            # 低成本叶子回归
cargo test -p xai-grok-sampler           # mock HTTP/SSE + actor
cargo test -p xai-grok-workspace         # FS/VCS/RPC 单元与集成
cargo clippy -p <crate>                  # 遵循根 clippy.toml/workspace lints
cargo test -p xai-grok-pager --test settings_e2e
cargo test -p xai-grok-pager --test pty_e2e_smoke -- --ignored  # 需先构建并设置 PAGER_BINARY
cargo fmt --all
```

完整 workspace 编译很慢；应先按变更边界选 crate，再在发布/CI 阶段运行 `cargo check/test/clippy --all-targets --workspace`。PTY、leader、真实 auth/relay 测试不要在没有 sandbox 和凭证 fixture 的环境里强行开启。

## 工程风险与维护清单

- **生成文件误改**：根 `Cargo.toml` 自动生成，修改应落在具体 crate manifest；提交前检查 `git diff --check` 和生成器是否会覆盖手工改动。
- **feature 漂移**：默认 Cargo、`default-bazel`、`release-dist`、`local-workspace` 可能编译不同代码；新增 API 至少在默认和发布 feature 下各做一次 check。
- **环境/时间隐式依赖**：使用全局 env、真实 wall clock 或 PTY 尺寸会造成 flaky；优先用 guard、paused clock、TestSandbox 和 mock endpoint。
- **阻塞线程池耗尽**：git2、目录 walk、压缩和外部命令应留在 `spawn_blocking`/detached process；不要在 SessionActor LocalSet 直接做同步大 I/O。
- **回收路径**：任何新 task、child process、watcher 或 stream 都要接入 cancellation/guard；headless stdout 写错、TUI connect 超时和 leader client 断开都必须验证最终回收。
- **协议兼容**：修改 ACP/WorkspaceRpc/tool stream 字段要同时更新 typed wire、client/server、fixtures 和跨版本 fallback；优先新增可选字段而非改变旧语义。
