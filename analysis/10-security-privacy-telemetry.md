# 10｜安全、隐私与遥测审计

## 结论

凭据、网络、插件、日志和 memory 的实现总体采用“默认少收集、结构化 schema、出口再校验”的方向：auth/MCP 文件使用 owner-only 权限和原子写；WebFetch 对 DNS 结果和重定向做 SSRF 检查；OAuth callback 绑定 loopback 并要求 `code`+`state`；内部/外部 OTel 在 emit 与 exporter 两处脱敏、默认关闭 prompt/body；memory 归档拒绝 symlink/FIFO/超大文件。

仍有数个高影响边界：

1. 凭据和 memory 是明文文件，权限收紧失败通常只 warning 后继续；auth 磁盘满时会退回非原子写，存在 torn-read 窗口。
2. hook HTTP 的 `is_blocked_ip` 明确把 IPv4 127/8 和 IPv6 loopback 当作不阻断，`https://127.0.0.1`/`https://[::1]` 可通过；DNS rebinding 也只在解析时检查。
3. external OTEL 一旦用户双重显式开启，内容由 customer collector 保留，独立于 ZDR/产品 telemetry；`user.email` 等 identity 不受 content gate。
4. 插件没有加密签名；`require_sha` 默认关闭，mutable branch/tag/HEAD 可替换，已安装插件重装还会短路 pin gate。
5. README 的 `curl | bash`、`irm | iex` 与构建期间联网下载工具是供应链入口；ripgrep 下载当前未见 tarball hash，fd/protoc 有固定摘要。

## 数据流总览

```text
环境变量/配置/登录
  ├─ auth.json（xAI token，明文 + 0600）
  └─ mcp_credentials.json（OAuth token，明文 + 0600）
            │
            ├─ WebFetch/WebSearch ── SSRF + allowlist + redirect gate ── 网络
            ├─ MCP OAuth callback ── loopback code/state ── token exchange
            ├─ hooks command/http ── child seccomp / HTTPS SSRF ── 网络
            └─ plugin git ── ref/SHA gate ── clone/cache/install

事件/提示/工具输出 ── secret/path scrub ── typed OTel schema ── exporter validator
memory Markdown ── tar.gz（nofollow/cap）─ session registry/GCS（可选）
```

审计区分三个不同出口：xAI 产品 telemetry、customer-controlled external OTEL、用户/会话主动触发的 GCS/代理上传；一个开关（如 ZDR）不自动覆盖另外两个出口。

## 1. 认证凭据与文件权限

### 实现事实

`secure_file` 明确写出数据以明文保存，OS 权限是唯一保护：Unix 0600，Windows 当前用户 SID ACL；权限收紧是 best-effort（`crates/codegen/xai-grok-shell-base/src/util/secure_file.rs:1-10,19-89`）。

`auth.json` 读取后尝试 chmod，失败只 warning 仍继续使用 token；正常路径临时文件+rename。非空损坏文件会重命名为 `.corrupt.<timestamp>`，备份仍含 token；磁盘满时 atomic 写失败会退回 truncate/rewrite，允许并发读观察撕裂文件，下一次读取再修复（`crates/codegen/xai-grok-shell/src/auth/storage.rs:42-66,89-183,253-325`）。

认证模型支持 OIDC、External、ApiKey 和旧 WebLogin；`Debug` 只保留 bearer/refresh suffix，`coding_data_retention_opt_out` 默认 true（`auth/model.rs:20-24,26-120,132-181`）。deployment key 优先于 OIDC；deployment/user token 的 header 形态不同，`Debug` 对 token/key 显示 `<redacted>`（`util/grok_auth_credentials.rs:1-112`）。

External provider 通过平台 shell（`sh -c`）运行，stdout 读取 token、stderr 面向用户；7 秒 timeout、进程组终止，并以 `CommandLog::Shown(command)` 记录命令文本，故 secret 不应嵌入命令（`auth/external_auth.rs:42-89`）。

### 风险与建议

- 同用户恶意进程、备份、崩溃转储或磁盘取证可读取明文 token；建议优先使用 OS keychain/Secret Service，至少对 `$GROK_HOME` 目录和 corrupt backup 做启动时权限硬失败与定期清理。
- 磁盘满 fallback 是可用性取舍，但可导致并发进程读到半个 token；可采用写入独立版本文件+目录 rename，或加读锁/校验和。
- chmod 失败继续使用应在 UI/遥测中明确“凭据保护降级”，而不是普通 warning。

## 2. WebFetch / WebSearch 网络与 SSRF

### WebFetch

默认 SSRF gate 逐个检查 DNS 结果，阻止 loopback、RFC1918、link-local、metadata、CGNAT、reserved/test/multicast；`allow_local` 只放行显式 localhost、127/8、`::1`，公共域名解析到 loopback 仍阻止（`crates/codegen/xai-grok-tools/src/implementations/grok_build/web_fetch/ssrf.rs:1-175`）。客户端只接受 http/https、拒绝 URL userinfo，普通 HTTP 自动升级 HTTPS（`web_fetch/client.rs:70-115`）。

重定向不自动跟随；手动最多 10 跳、仅 exact same host，每跳重新 SSRF 检查；body 有大小上限，SVG 排除，图片/视频检查 magic bytes，未知 media subtype 的 magic 检查可能 fail-open（`web_fetch/client.rs:356-440,471-511`）。域名/path allowlist 由 permission manager 的静态 `DomainMatcher` gate 负责，大小写、`www.`、尾点规范化；这与网络层 SSRF gate 是两个独立控制（`web_fetch/domain.rs:17-145`）。

### WebSearch

`allowed_domains`/`excluded_domains` 是 authoritative 配置；模型每次调用提供的 allowlist 不能绕过配置 blocklist；API key 放 Authorization header。401/错误响应 body 原文进入 `ToolError`，上层日志必须继续依赖 sanitizer（`crates/codegen/xai-grok-tools/src/implementations/web_search/client.rs:13-21,100-132,206-249`）。

### 风险

WebFetch 的显式 `allow_local` 是有意的开发者开关，开启后 localhost 数据可进入模型上下文；未知 subtype 的内容鉴别和 WebSearch error-body 记录是残余泄漏面。allowlist gate 不可替代 DNS/IP gate，新增网络工具不能只复用域名匹配。

## 3. MCP OAuth、callback 与 transport

### OAuth flow

discovery 有 5 秒 timeout，拒绝 rmcp legacy endpoint guessing；同进程用 watch 去重，Unix 用 `flock` 跨进程协调，拿不到锁会 warning 后继续浏览器流程（`crates/codegen/xai-grok-mcp/src/oauth.rs:23-47,61-136,138-220`）。callback listener 绑定 `127.0.0.1`，默认随机端口，也允许配置指定端口；redirect URI 为 `http://127.0.0.1:<port>/callback`（`oauth.rs:360-374`）。BYO client_id/secret/scopes/callback_port 来自配置；否则动态注册 client（`oauth.rs:376-419`）。

callback 必须有非空 `code` 与 `state`，可携带 RFC 9207 `iss` 并传给 token exchange；GET/POST 错误页面做 HTML escape（`oauth.rs:454-613`）。浏览器打不开时 warning 会包含完整 auth URL，URL 可能携带 OAuth 参数，应避免进入集中日志（`oauth.rs:421-427`）。底层 PKCE/state 由 rmcp URL/manager 生成并在 exchange 接收 state；本审计未展开 rmcp 外部实现，建议把 PKCE verifier/state 绑定测试列为未核查项。

### 凭据与 transport

MCP token 独立存于 `$GROK_HOME/mcp_credentials.json`；目标 0600、atomic temp/persist，chmod 失败 warning 后仍使用；sidecar lock 获取失败退化无锁 mutate/save（`credentials.rs:1-45,85-136,239-287`）。

caller 不能伪造 `X-Grok-Agent-ID`：配置 header 被剥离，只能由 spawn context 重新添加；OAuth Authorization 不放 default headers，而由 AuthClient 每请求注入（`servers.rs:51-57,3886-3925,4778-4791`）。local agent endpoint 使用 no_proxy+redirect none。普通 MCP HTTP/SSE transport 没有统一 WebFetch SSRF gate，因此其 URL 主要受配置/folder trust 边界约束，不应假设自动阻止内网地址（`servers.rs:4098-4140,4680-4820`）。stdio MCP 的 command/args/env/PATH 可由用户配置，设置 session ID、process group，并调用 child network restriction（`servers.rs:4693-4753`）。

## 4. Hooks HTTP/command

command hook 可经 `sh -c` 执行配置字符串，或执行 source_dir 下路径；runner-owned `GROK_HOOK_*`、`GROK_SESSION_ID`、workspace vars 覆盖 extra_env，进程组、timeout、输出 cap、child seccomp 生效（`crates/codegen/xai-grok-hooks/src/runner/command.rs:55-180`）。managed hook 即使用户 disabled 仍运行；健康 hook 的 deny/block 才阻断，hook 执行失败通常 fail-open（`dispatcher.rs:20-42,77-110,216-229`）。matcher 编译失败改为 `never()`；global hooks 先于 project hooks，按内容+matcher 去重并以高 authority provenance 覆盖低 authority copy（`discovery.rs:107-125,141-223`）。

HTTP hook 仅 HTTPS、不跟随 redirect，DNS resolution 时检查 private/link-local/metadata；但 `is_blocked_ip` 对 IPv4 127/8 和 IPv6 loopback 明确返回 false，故 `https://127.0.0.1` 与 `https://[::1]` 可能通过。注释还承认只在 resolution time 检查，DNS rebinding 在发送时仍可换成受阻地址（`runner/http.rs:34-126,128-134`）。这是与 WebFetch 策略不一致的 P0/P1 缺口；建议共享统一 IP 分类器，并在实际连接 socket 前校验 peer IP。

## 5. 插件供应链

直接 git 安装会校验 URL/ref/sha 的 NUL、前导 `-`、空值；full SHA 只接受 40/64 hex。`require_sha` 开启时拒绝没有 full SHA 的远程插件，并把 ref 中的 full SHA hoist 到 sha slot，再 fetch-by-sha 校验 HEAD（`crates/codegen/xai-grok-agent/src/plugins/git_install.rs:118-201,237-257`）。

Marketplace 没有加密签名；无 `git_sha` 时跟随 mutable branch/tag/HEAD，可被能推送该 ref 的主体替换。`require_sha` 来自 `[marketplace].require_sha` 或 `GROK_MARKETPLACE_REQUIRE_SHA=1`，默认关闭；已安装插件重装在 pin gate 前短路，vendored local plugin 不受该 gate 保护（`crates/codegen/xai-grok-plugin-marketplace/src/installer.rs:98-111,131-163,254-265`；`config.rs:31-45`）。git cache 有 URL hash、锁、5 分钟 TTL、15 秒 clone/fetch timeout，但策略关闭时仍跟随 mutable ref（`git.rs:16-20,61-115,145-180`）。

建议 release/企业配置默认 `require_sha=true`，目录索引强制发布 full SHA；为插件包增加签名/透明日志，更新前后记录 commit、来源和 hash；重装已存在插件也应重新执行 pin gate；对 marketplace source 本身和 vendored local plugin 建立独立审核/签名链。

## 6. Secret sanitizer 与内部 telemetry

`xai-grok-secrets` 覆盖 xAI/OpenAI/AWS/GitHub/GitLab/Slack/Google/Pem/Bearer/JWT、URL query secret 与 assignment key；JSON string 递归脱敏，URL 去 userinfo/fragment、替换敏感 query；`$HOME`→`~`，用户名路径段→`<user>`（`crates/codegen/xai-grok-secrets/src/sanitizer.rs:8-108,110-141,180-309`）。

OTel span 属性 default-deny，只允许 typed allowlist string keys；URL key 降为 origin；event name 改为 callsite filepath/line，去掉 tracing 自由文本；未知/non-scalar value fail-closed/drop（`crates/codegen/xai-grok-telemetry/src/otel_layer/redact.rs:9-18,150-218,220-287`）。这显著降低误把命令、prompt、路径写进 span 的概率，但 allowlist 中的 `path/cwd/source` 仍可能泄露项目结构，需按组织策略判断是否必要。

## 7. External OTEL（customer collector）

外部流要求 `GROK_EXTERNAL_OTEL=1` 加至少一个真实 exporter（metrics/logs），默认不构造 provider/thread/socket；配置文件没有 headers 字段，collector token 只能来自 `OTEL_EXPORTER_OTLP_HEADERS` 环境变量（`external/config.rs:1-7,111-116,344-394,510-531`）。prompt/response/tool details/content gates 默认关闭；配置/环境可本地开启，remote policy 只能关闭或 tighten，不能远程开启（`config.rs:72-89,628-654`；`external/mod.rs:73-82,385-417`）。

emit 时每个字符串先 secret/path scrub 再裁剪：prompt/response/tool body 约 60KB，preview/error 约 4KB；identity 注入 user/team/org/deployment ID，`prompt.id` 只进事件不进 metrics（`external/emit.rs:87-114,125-227`）。export-time validator 对非 schema key、closed gate、未脱敏 string、非标量值直接丢弃；metric schema 违反则整批丢弃，fail-closed（`external/redact.rs:1-8,53-100,121-152,198-242`）。

provider 不注册 global、不带内部 xAI auth；external OTEL 独立于 ZDR/产品 telemetry，用户开启后内容保留由 customer collector 管理。settings 未解析前 gate fail-closed，默认最多等待 30 秒，超时按本地配置发出，后续 policy 仍可关闭（`external/mod.rs:148-179,255-355`）。`user.email` 是 identity 字段，不受 content gate。

风险是“本地默认关闭”不代表组织端已无留存：一旦双重 opt-in，数据可能进入第三方 collector、备份和下游 SIEM；headers 环境变量也会出现在进程/CI 诊断上下文。建议在首次启用时显示目的地 origin、字段 gate 与 retention 提示，企业策略默认锁死 content gate，并对 customer endpoint/cert 做 allowlist/证书 pinning。

## 8. Sentry、sampling log 与身份数据

Sentry `send_default_pii=false`、trace sample rate 1%；`before_send` 脱敏 message/exception/stacktrace/breadcrumbs/tags/extras，删除 `cwd` 和 server_name；broken-pipe/disk-full 类 panic 丢弃（`crates/codegen/xai-grok-telemetry/src/sentry.rs:29-75,79-239`）。本地 sampling 只有 `GROK_LOG_SAMPLING=1` 才启用 `~/.grok/logs/sampling.jsonl`，有统一裁剪但不是加密文件（`sampling_log.rs:1-69`）。

## 9. Memory/session/archive/upload 隐私流

memory 位于 `~/.grok/memory/`，包括 global `MEMORY.md`、workspace `MEMORY.md`、按日期/首条用户消息 slug/session 前缀命名的 session logs（`crates/codegen/xai-grok-memory/src/lib.rs:1-19`；`storage.rs:138-183`）。Markdown 明文写入；本层未见统一 0600 或加密封装。`read_file` canonicalize 路径并限制在 memory root，读取 canonical path 防 TOCTOU（`storage.rs:254-301`）。temp-dir workspace 会跳过 workspace persistence。

归档器只打开 regular file、`O_NOFOLLOW|O_NONBLOCK`，跳过 symlink/FIFO/超大文件，单文件 cap 8MiB；tar header mode 为 0644（`archive.rs:10-39,40-87,89-132`）。这防止 agent 在可写 memory 目录中用 symlink 偷带 `~/.ssh/id_rsa`，但归档内 mode 0644 仍不应被视为机密保护。

`session_registry_enabled` 时，整个 memory archive 进入 GCS/代理；Defer 模式过 deadline 后 detached best-effort upload，直接上传最多再等 30 秒（`crates/codegen/xai-grok-shell/src/upload/memory.rs:36-39,108-185,189-223`）。因此“本地 memory”是明确的外传边界，取决于 session registry、trace upload 配置和 ZDR gate，而不是单纯 telemetry 开关。

session/context telemetry 记录 session ID、model、context occupancy、tool/skill/MCP/AGENTS/workflow token counts；trace upload 事件只记录方法、结果、reason/status；session-end 记录 teardown phase timing（`crates/codegen/xai-grok-telemetry/src/session_metrics.rs:42-65,115-145`；`session_end.rs:1-9,75-145`）。这些是元数据，仍可能构成工作模式/项目结构指纹。

## 10. 根目录与构建供应链

- `Cargo.toml:1-7` 的 `[patch.crates-io]` 将 `async-openai` 指向 GitHub fork 固定 rev；`Cargo.lock` 锁定解析版本，但 fork/rev 的发布控制仍是供应链信任点。
- `bin/protoc:1-45` 是 DotSlash 描述文件，下载 protobuf v29.3 平台 zip 并校验固定 SHA-256；若找不到 DotSlash，README 指示使用 PATH/`$PROTOC` 的 protoc，需在 CI 固定来源。
- `xai-grok-shell/build.rs` 与 `xai-grok-tools/build.rs` 的 release 路径都会从 GitHub 下载 ripgrep 15.0.0 tar.gz（shell：`build.rs:73-120`；tools：约 `build.rs:300-350`）；当前两处 ripgrep 下载均未见与 fd 同等的 tarball SHA 校验。`xai-grok-tools/build.rs` 对 fd 资产有 per-target SHA-256（约 `build.rs:17-39,116-153`），bfs/ugrep 由本地 override 提供。
- README 安装命令直接执行远程 shell：`curl -fsSL https://x.ai/cli/install.sh | bash` 与 `irm https://x.ai/cli/install.ps1 | iex`（`README.md:40-72`）。这在产品分发上方便，但应提供签名/校验和、固定版本和离线安装说明。
- `third_party/NOTICE:1-70` 及各 vendored `Cargo.toml` 记录 Mermaid/dagre/graphlib/ordered_hashmap 来源、许可证和局部修改；vendored 代码扩大审计面，`ordered_hashmap` 仍含需复核的 unsafe 迭代器实现（`third_party/ordered_hashmap/Cargo.toml:21-26`）。

## 11. Fail-open / fail-closed 与残余风险表

| 控制点 | 失败/默认行为 | 评价 |
|---|---|---|
| auth/MCP chmod | warning，继续用现有 token | **Fail-open** |
| auth atomic write ENOSPC | truncate/rewrite，可能 torn read | 可用性优先，残余风险 |
| WebFetch DNS/redirect | 每跳 SSRF 检查；超限拒绝 | Fail-closed（未知 media subtype 除外） |
| MCP HTTP transport SSRF | 无统一 WebFetch gate | **配置/信任边界，残余** |
| Hook loopback IP | 127/8、IPv6 loopback 未阻断 | **Fail-open，高风险** |
| Hook matcher 解析 | `never()` | Fail-closed |
| Hook 执行错误 | 健康 hook 通常不阻断 | Fail-open（可用性取舍） |
| Plugin require_sha | 默认 off；开启才拒绝 unpinned | **供应链残余** |
| External OTEL schema/gate violation | 丢记录/整批 metric | Fail-closed |
| External OTEL 未双 opt-in | 不创建 provider | Fail-closed |
| Memory archive symlink/FIFO/size | 跳过 | Fail-closed（针对归档输入） |
| Memory/session 文件本地保存 | 明文，未见统一 0600 | **隐私残余** |
| session registry | 整个 memory.tar.gz 可上传 | **明确外传边界** |

## 12. 建议路线图

P0：修复 hook loopback/peer-IP 校验；让凭据 chmod 失败和关键 sandbox/transport 安全能力降级可见且可阻断；审查 MCP HTTP 是否需要统一 SSRF gate。P1：release/企业默认启用 `require_sha`，插件签名；给 ripgrep/protoc/安装器提供可验证签名或 hash；memory/auth 使用 keychain 或加密、限制备份留存。P2：把 external OTEL destination/retention/content gates 纳入首启确认和组织策略；定期 fuzz sanitizer、URL parser、OAuth callback 与 archive race；补核对 rmcp PKCE/state 底层实现以及所有 feedback/share/upload 调用点的 sanitizer 覆盖。

## 证据索引

- 认证：`xai-grok-shell-base/src/util/secure_file.rs:1-10,19-89`；`xai-grok-shell/src/auth/storage.rs:42-183,253-325`；`auth/model.rs`；`auth/external_auth.rs`；`util/grok_auth_credentials.rs`
- 网络：`web_fetch/ssrf.rs:1-175`；`web_fetch/client.rs:70-115,356-511`；`web_fetch/domain.rs:17-145`；`web_search/client.rs`
- MCP：`xai-grok-mcp/src/oauth.rs:23-47,138-220,360-613`；`credentials.rs:1-45,85-287`；`servers.rs:51-57,3886-4140,4680-4820`
- Hooks：`xai-grok-hooks/src/runner/http.rs:34-126`；`runner/command.rs`；`dispatcher.rs`；`discovery.rs`
- Plugins：`xai-grok-agent/src/plugins/git_install.rs:118-201`；`xai-grok-plugin-marketplace/src/installer.rs:98-111,131-163,254-265`；`config.rs:31-45`；`git.rs:16-180`
- Telemetry：`xai-grok-secrets/src/sanitizer.rs:8-309`；`xai-grok-telemetry/src/otel_layer/redact.rs:9-287`；`external/config.rs`；`external/emit.rs`；`external/redact.rs`；`external/mod.rs`；`sentry.rs`；`sampling_log.rs`
- Memory：`xai-grok-memory/src/storage.rs:138-301`；`archive.rs:10-132`；`xai-grok-shell/src/upload/memory.rs:108-223`
- 供应链：`Cargo.toml:1-7`；`bin/protoc:1-45`；`README.md:40-72`；`THIRD-PARTY-NOTICES`；`third_party/NOTICE:1-70`；相关 `build.rs`
