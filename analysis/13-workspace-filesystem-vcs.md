# Workspace、文件系统与 VCS

`xai-grok-workspace` 是 agent 工具与主机/沙箱之间的边界层。它同时支持进程内 Local 和 Computer Hub Proxy 两种模式；两者共享同一组 typed request/response，尽量让 agent 不感知部署位置。

## crate 组成

| crate/模块 | 作用 |
| --- | --- |
| `xai-grok-workspace/src/lib.rs:1-52` | 导出 FS、VCS、permission、hub、session、worktree、workspace ops、trust 等公共 API；`WorkspaceHandle` 是进程内根对象。 |
| `workspace_ops.rs:1424-1435` | `WorkspaceOps::{Local, Proxy}` 双模式 facade；Local 持有 `WorkspaceHandle`，Proxy 持有 `WorkspaceClient`。 |
| `xai-grok-workspace-types` | `WorkspaceRpc` trait、method 常量、RPC envelope 和所有 wire DTO。 |
| `xai-grok-workspace-client` | 基于 Hub `ToolHarness` 的 typed RPC client；连接断开 latch、deadline、stream terminal 消费和错误映射。 |
| `xai-grok-workspace/src/hub_server.rs` | `WorkspaceRpcHandler`，注册 `workspace_rpc` ToolServer handler，把 JSON method dispatch 到本地 handle。 |
| `xai-grok-workspace-daemon` | 独立 daemonize/pidfile/preview supervisor；刻意不依赖 workspace library，避免生命周期环。 |

## Local/Proxy 统一调度

`WorkspaceOp` 在 `workspace_ops.rs:83-102` 定义本地 `execute(&WorkspaceHandle, session_id)`，并继承 `WorkspaceRpc`。`WorkspaceOps::dispatch`（约 `1581-1600`）按模式选择直接执行或序列化 RPC：

```text
agent/session
    │ WorkspaceOps::dispatch(op)
    ├─ Local  ──> op.execute(handle, session_id)
    └─ Proxy  ──> WorkspaceClient::rpc -> ToolHarness(workspace_rpc)
                                      └─> WorkspaceRpcHandler::dispatch
                                           └─> op.execute(server_handle, bound_session)
```

工具调用也遵循同一抽象（`workspace_ops.rs:1671-1715`）：Local 从指定 session 的 `FinalizedToolset` 调用，Proxy 以工具名构造 `ToolId`，消费 `ToolStream` 到 terminal，再反序列化 `ToolRunResult`。Proxy 的 transport fatal 会把 `WorkspaceClient` 标为 disconnected，后续调用快速失败，等待 SDK reconnect 显式 `mark_connected`。

RPC server 在 `hub_server.rs:191-204` 用统一 `dispatch_op` 完成参数反序列化、`WorkspaceOp::execute` 和 envelope 序列化；`hub_server.rs:393-418` 的 method match 覆盖 FS、Git、hunk、worktree、search、MCP、plugin 等。mutation 会先记 activity，调用者 session 以 server-bound envelope 为权威；旧 `caller_session_id` 仅作为兼容 fallback（`hub_server.rs:101-151`）。

## 文件系统层

### 三种实现

- `file_system::LocalFs`（`file_system/local_fs.rs:1-60`）直接对 canonical/local path 调用 Tokio FS，负责基本 exists/read/write/delete；它不自行做根限制，限制由 WorkspaceHandle/调用方完成。
- `file_system::AcpSessionFs`（`acp_fs.rs:6-111`）把读写转换为 ACP `ReadTextFile`/`WriteTextFile` 请求，删除因 ACP 尚无协议支持而明确返回错误。AB overlay 场景可用 `display_cwd` 把模型看到的路径重写到真实 overlay root。
- `file_system::ext_fs`（`ext_fs.rs:1-130`）实现远端 `x.ai/fs/*` RPC。`FsList/Read/Write/Delete` 先解析绝对/相对路径，再调用 `WorkspaceHandle::confine_to_workspace_root`；大文件支持 ranged/base64 读取，遍历使用分页和 gitignore/glob 选项。

共享 `file_system::walk` 提供 `MAX_READ_BYTES`、`MAX_LIST_COLLECT`、分页 list、binary-safe `read_range` 和 chunk 编码。客户端面向 bound session 的 `client_fs_*` 会把 session cwd 作为 workspace root 的安全 suffix；非法、不存在或越界 cwd 回退到 root（`handle.rs:1783-1840`）。

### 根限制与 symlink 防护

`WorkspaceHandle::resolve_path_within_root`（`handle.rs:1840-1942`）执行两层检查：

1. 文本层折叠 `.`/`..`，拒绝空 path，并要求 normalized path 以 root 或 canonical root 开头。
2. 文件存在时 canonicalize 并检查 canonical path 在 canonical root 内；遇到未创建的尾路径则向父目录回溯，同时最多跟随 40 个 symlink hop，防止 symlink escape/环。

启用 `confine_fs_to_workspace_root` 后，`confine_to_workspace_root` 返回 `(resolved_path, Some(canonical_root))`，list 还会把 walk 限制在该 root（`handle.rs:1943-1975`）。独立 workspace server 默认启用此选项（`src/bin/workspace_server.rs` 的 `confine_fs_to_workspace_root` 参数），本地开发可显式关闭。实现文档诚实标注了 TOCTOU 限制：检查与实际 I/O 之间若恶意替换 symlink，服务级 API 不能单独保证 containment；需 `O_NOFOLLOW`、mount namespace 等更强边界。

### 写入和部分失败

`put_files` 按顺序写入；第 N 个文件失败时前 N-1 个已落盘且不会回滚（`handle.rs:1978-1990` 注释）。调用方必须读取逐文件结果，不能把批量 API 当成事务。工具层的 hunk tracker 另行记录 agent edit；纯 `client_fs` 写入不自动生成 hunk。

## Git/JJ 设计

`session/git.rs:1-15` 给出策略：结构化 status/diff/info 优先使用 vendored `git2`，简单 stage/commit/push/checkout 使用 CLI。`git_cli`（`65-107`）统一加 `--no-optional-locks`、认证抑制环境和 detached process，避免 status 刷新产生 `index.lock`；mutating wrapper 在成功或失败后都 invalidate git gate，防止缓存陈旧。

结构化 API 包括：

- `git_info`/`list_branches`/`get_current_commit`（约 `896-1008`）在 `spawn_blocking` 中读取 repo、branch、remote、default branch 和 HEAD；
- `status`（`1316-1430` 左右）用 git2 取 staged/unstaged、统计和 patch，libgit2 异常时 fallback CLI；
- `read_files`/`diffs`（`1507-1660`）支持版本内容、merge-base、patch/content 以及大小限制；
- stage/unstage/discard/stash/checkout/push 等显式 mutation 通过 CLI，Jujutsu 则以 `jj_cli`/`jj_cli_mut` 区分是否 `--ignore-working-copy`（`119-180`）。

远端 URL 输出会 scrub userinfo，避免 token 从 Git 错误串泄漏（`strip_url_credentials`/`scrub_git_output` 附近）。Git 命令 stdin 为空且脱离 pager 环境，避免交互阻塞。

## turn checkpoint、rewind 与 worktree

FS 与 Git 是两个 checkpoint domain。`session/checkpoint.rs:85-227` 负责 per-turn hunk/file-state capture；Git 的 `GitCheckpointStore`（`session/git.rs:2338-2408`）按 prompt index first-wins 保存 HEAD SHA 与 staged path，防止重复 begin 把“turn 中间状态”覆盖“turn 开始状态”。`GROK_WORKSPACE_REWIND_GIT` 默认关闭（`git.rs:2320-2336`），因为只有 Git rewind 会移动 HEAD。

启用时 `soft_restore_git_state`（`git.rs:2548-2640`）遵循 stash-or-abort → `git reset --soft <head>` → `git reset -- .`，绝不 `reset --hard`、绝不删除 commit；FS revert 完成后再按记录的相对路径 restage。合并/rebase 未完成、stash 失败或 reset 失败会中止并保留可恢复状态。

`WorkspaceHandle::create_session*`（`handle.rs:750-824`）为每个 agent session 建立 cwd、hunk tracker、permission/toolset；`WorkspaceOps::bind_local_session`（`workspace_ops.rs:1485-1510`）把 agent 的 toolset 安装到对应 workspace session，保证 hunk tracker 与工具实际写入目录一致。worktree 与 AB overlay 的路径虚拟化由 `worktree/`、`path_virtualization.rs` 和 `AcpSessionFs::display_cwd` 协同处理。

## Workspace server 与 daemon

`xai-grok-workspace/src/bin/workspace_server.rs` 是远程 sandbox 中的 ToolServer：解析 hub URL/auth/server id、可选 daemonize/preview/OOM 保护，建立 Tokio runtime 后连接 Hub；`hub_server.rs` 负责 `workspace_rpc` dispatch 和按 method/result 记录指标。`xai-grok-workspace-daemon/src/lib.rs:1-24` 明确 daemon crate 只包含 double-fork/setsid、pidfile 和 preview child supervisor，不依赖 workspace library；二进制负责把 preview activity sink 适配回 `ActivityTracker`。

## 维护时的边界检查

- 新增 workspace 方法时先在 `workspace-types` 定义 request/response 和 `WorkspaceRpc`，再加 Local `execute`、server dispatch 和 client convenience method；否则 Local/Proxy 很容易漂移。
- 所有用户提供路径都应经过 root/confine API；不要直接把绝对 path 传给 `tokio::fs` 或 Git。注意服务级 symlink 检查的 TOCTOU caveat。
- mutation RPC 必须使用 bound session identity，不能信任客户端自报的 session id；检查 `hub_server.rs:101-151` 的兼容统计。
- 大文件、diff 和目录遍历要沿用分页/size cap；批量写入不是事务，UI 必须展示 per-file error。
