# 09｜沙箱、权限与项目信任审计

## 结论

代码形成了多层防线：项目/全局配置先经过 folder trust，再选择 sandbox profile；进程级 sandbox 负责文件/网络能力，受限子进程再安装 seccomp；工具调用进入 permission manager，最后才启动 terminal、hook、MCP、LSP 等扩展。Bash 解析、deny-glob 展开、symlink 目标和 hook matcher 多数路径是 fail-closed，且 managed deny 优先于 YOLO。

最高优先级残余风险是沙箱启动的 fail-open：平台不支持或 `Sandbox::apply` 失败会记录 warning 后继续运行；Linux bwrap 的占位文件竞态也可能静默丢失 bind。沙箱并非“所有子进程都断网”：git/VCS、bwrap 重执行、剪贴板/图片 helper、updater 是保留父网络的可信基础设施边界。`PermissionHandle::AllowAll` 是显式嵌入调用方绕过；YOLO 仍需与 managed pin、策略 deny 一起审计。

## 执行链与信任边界

```text
全局 ~/.grok + 项目 .grok
          │
          ▼
folder trust（持久记录/TTY/headless） ── 未信任 ──> 阻止或询问
          │
          ▼
sandbox profile（workspace/devbox/read-only/strict）
          │ apply（不可逆）
          ├─ Linux bwrap bind/deny + namespace lockdown
          └─ 受限 child spawn ── seccomp 网络/namespace syscall
          │
          ▼
permission manager（deny > ask > allow；Bash 每个 segment）
          │
          ├─ terminal / shell / .envrc
          ├─ hooks（command/http）
          ├─ MCP stdio/HTTP/SSE
          └─ LSP、agents、plugins、workflow
```

这里的“信任”不是单一开关：folder trust 只决定项目携带的代码执行配置能否自动加载；permission policy 决定具体工具/路径；OS sandbox 是进程能力约束；child-network filter 是每次 spawn 的生命周期约束。

## 1. OS sandbox 与 Linux bwrap

### 实现事实

- `SandboxManager::apply` 明确标注“不可逆”。`off` 直接跳过；不支持平台打印 warning、写 `apply_failed` 事件并返回 `Ok(())`；`Sandbox::apply` 出错同样 warning 后返回 `Ok(())`。非 `enforce` 构建的 stub 也只记录信息并继续（`crates/codegen/xai-grok-sandbox/src/lib.rs:161-250`）。
- profile 解析后计算 capability 与 deny 集合。Linux bwrap 用 `grok_home` 下按 PID 命名的零权限文件/目录覆盖 deny 路径；代码注释承认创建/竞态失败会返回 `None`，从而静默丢失 bind（`lib.rs:394-427`）。
- deny glob 仅在启动时展开；后续新建的匹配文件不覆盖。glob 展开失败则拒绝启动并返回 `None`（`lib.rs:563-577`）。
- 项目 sandbox 配置是 additive-only：项目不能重定义同名全局 profile，避免仓库清空 `deny` 或扩大 `read_write`（`profiles.rs:114-167`）。
- `workspace`/`devbox` 的网络与读权限比 `read-only`/`strict` 宽；profile 的 `restrict_network` 决定已知 child launch 是否安装网络过滤器。

### 风险判断

1. 在 Linux/Unix 上，`apply` 失败仍继续运行，调用方若把 `Ok(())` 当作“已隔离”会出现权限假象。容器缺少 user namespace、bwrap 未安装/setuid、内核能力变化都可触发。
2. PID 占位文件解决了同机并发命名冲突，但 `create_dir_all`、创建、chmod 任一步失败都可能让 deny bind 缺席。占位文件本身位于用户可写的 `grok_home`，需防同用户其他进程替换/删除。
3. glob 的 launch-time 快照不能保护运行期生成的 secret 文件；它是约束“启动时已存在对象”，不是目录持续监控。

### 缓解与建议

- 对需要机密读隔离的 profile，启动策略应将 `!is_applied()` 视为阻断（除非用户明确选择 off），并把 unsupported/apply error 暴露为结构化 hard failure；保留当前 graceful 模式时至少在 UI 显示醒目标记。
- 对 deny glob 使用内核目录级机制、fanotify/landlock 或启动后禁止创建等替代方案；至少在文档中明确“只覆盖启动时匹配项”。
- 占位文件改为私有目录、`O_EXCL`/`openat2`、持有 fd 后 bind，并在 bwrap 启动前重新验证 inode/mode；失败时禁止执行而不是降级。

## 2. Child network / namespace seccomp

### 实现事实

namespace filter 阻止 mount/umount/pivot_root/open_tree/move_mount/fsopen/fsconfig/fsmount/mount_setattr、`unshare`、`setns`；带 `CLONE_NEW*` 的 legacy `clone` 返回 EPERM，`clone3` 返回 ENOSYS（`child_net.rs:100-128`）。网络 filter 阻止 connect/bind/send*/listen/accept 以及 io_uring setup/enter/register（`child_net.rs:180-217`），并用 parent-built BPF 在 fork 后只执行 async-signal-safe `prctl`（`child_net.rs:220-260`）。

受限边界覆盖 terminal commands、stdio MCP、hook commands、alternate bash、shell state、LSP、notification hooks、`.envrc`；可信基础设施 git/VCS、bwrap re-exec、剪贴板/图片 helper、updater 刻意保留父网络（`child_net.rs:274-299`）。

### 风险判断

- “受限子进程断网”不等于“会话断网”。可信基础设施若接受可控 URL/参数，仍是网络出口；其信任假设应写入 threat model。
- seccomp 过滤器只覆盖列出的 syscall；未来新增网络 API、平台差异或代理/Unix socket 通道需持续审计。过滤器安装失败的上层处理也应确认不会把受限 child 变成普通 child。

## 3. Permission manager 与 shell 访问

### 实现事实

- Bash 按每个链式 segment 检查，递归剥离 `timeout`/`env` wrapper，递归解析 `bash -c` 与 `env -S`；无法分解返回 `AskFailClosed`（`permission/policy.rs:127-218`）。规则优先级为 deny > ask > allow；native path 会 canonicalize/follow symlink，并对目标重新应用 deny/ask（`policy.rs:221-300`）。
- shell access 检查 redirect 及 `cp/mv/ln/install/rm/mkdir/touch/tee/sed -i` 等读写；cwd 不确定、动态路径、symlink 无法解析时升级 Ask（`permission/shell_access.rs`，相关实现约 `18-243`）。
- `PermissionHandle::AllowAll` 是无条件 Allow 的嵌入调用方分支（`permission/manager/mod.rs:74-96`）。managed deny 在 YOLO 前执行（`mod.rs:1736-1760`）；sandbox auto-allow Bash 只在无安全 finding 时生效（`mod.rs:2054-2072`）。

### 风险与建议

`AllowAll` 若被新入口误用会完全绕过用户提示和策略，应限制为测试/明确受信内部构造并记录调用点。YOLO/auto-allow 应继续保留 managed deny、shell-forced prompt、hook-forced prompt 的夹钳；新增 wrapper/parser 必须加入 fail-closed 测试。

## 4. Folder trust、项目配置与持久 trust store

### 实现事实

folder trust 优先级为：feature off → durable trusted → home/root/不可记录 key → 无 repo-local code-exec config → TTY prompt → headless untrusted。release 构建扫描 `.mcp.json`、`.grok/config.toml` 的 MCP/plugins/permission、LSP、`.envrc`、Claude/Cursor hooks/settings、agents/roles/workflows 等；global hooks 先于 project hooks。无 `GROK_VERSION` 的本地/dev build 会使 folder trust inert，项目配置可自动信任（`folder_trust.rs:10-20,109-158,234-390`）。

`~/.grok/trusted_folders.toml` 由 canonical path + workspace key 判定，most-specific wins；拒绝 home、filesystem root、相对路径作为 trust root。写入用 sidecar lock、read-modify-write、0600 临时文件、fsync、atomic rename（`trust.rs:66-160,196-307`）。无 home 时返回空 store，不会回退到项目内 `.grok`。

### 风险判断

- 本地/dev build 的 `GROK_VERSION` 差异是高影响配置漂移：开发者可能误以为项目被询问，实际上 repo-local code-exec 自动加载。
- trust store 的 most-specific 逻辑健壮，但用户可写 `$GROK_HOME` 仍属于同用户信任根；恶意同用户程序可修改记录或 hook/plugin。
- 扫描清单若落后于新增配置文件类型，会产生“未发现即信任”的缺口。

### 建议

统一 debug/release 的 trust 行为；把是否启用扫描设为显式构建能力而非环境变量隐式差异。新增可执行配置必须先加入探测清单和回归测试；信任提示中显示将执行的 MCP/hooks/LSP/`.envrc` 来源。

## 5. Fail-open / fail-closed 对照

| 场景 | 行为 | 评价 |
|---|---|---|
| sandbox unsupported / apply error | warning + `Ok(())`，继续执行 | **Fail-open，高风险** |
| `enforce` feature 未编译 | stub 返回 `Ok(())` | **Fail-open，发布配置需显式标识** |
| Linux deny placeholder 创建/竞态失败 | bind 可能被静默丢弃 | **Fail-open，高风险** |
| deny glob 展开失败 | 拒绝启动 | Fail-closed |
| deny glob 后续新建文件 | 不覆盖 | 残余边界（非错误处理） |
| 无法解析 Bash / 动态 wrapper | `AskFailClosed` | Fail-closed |
| deny 规则、managed deny | 在 YOLO 前阻断 | Fail-closed |
| symlink 目标不可解析 | 升级 Ask | Fail-closed |
| hook matcher 编译失败 | `never()`，不执行该 matcher | Fail-closed |
| hook 执行失败 | dispatcher 健康 hook 失败通常不阻断 | **Fail-open，需接受的可用性取舍** |
| unknown media subtype magic 检查 | 可能放行 | **Fail-open（见第 10 章）** |

## 6. 审计优先级

P0：把需要隔离的 sandbox apply/placeholder 失败改为阻断或显式用户确认；验证所有 child spawn 处理 seccomp 安装错误。P1：移除生产路径的 `AllowAll`，统一 debug/release folder-trust 行为；对可信基础设施网络出口做参数 allowlist。P2：持续扩展配置扫描和 parser fuzz/regression，监控 launch-time glob 与运行期文件创建差异。

## 证据索引

- `crates/codegen/xai-grok-sandbox/src/lib.rs:161-250,394-427,563-577`
- `crates/codegen/xai-grok-sandbox/src/profiles.rs:114-167`
- `crates/codegen/xai-grok-sandbox/src/child_net.rs:100-128,180-315`
- `crates/codegen/xai-grok-workspace/src/permission/policy.rs:127-218,221-300`
- `crates/codegen/xai-grok-workspace/src/permission/shell_access.rs:18-243`
- `crates/codegen/xai-grok-workspace/src/permission/manager/mod.rs:74-96,1736-1760,2054-2072`
- `crates/codegen/xai-grok-workspace/src/folder_trust.rs:10-20,109-158,234-390`
- `crates/codegen/xai-grok-workspace/src/trust.rs:66-160,196-307`
