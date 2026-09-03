# 第六章：Session、Transcript、Resume 与搜索

## 结论

Grok Build 的 session 不是一个单一数据库行，而是由 `summary.json`、两个 JSONL
日志和若干按功能拆分的状态/制品文件组成的目录。所有写入先经过
`SessionPersistence` 的单写者 FIFO；需要“已经落到稳定介质”的调用显式等待
`FlushAndAck` 或 durable append。普通流式尾部允许暂留在页缓存，因此崩溃损失被限制在
最近一段 turn，而不会让多个并发 writer 互相覆盖。

这套设计同时服务于三种读取场景：完整恢复（包含 updates 与 rewind points）、轻量恢复
（先恢复对话，稍后再取 updates）和 replay（按文件顺序流式重放 ACP/xAI 事件）。fork
不是运行中的 session clone，而是先在 blocking 线程池复制文件、生成新的 UUIDv7，再
异步登记后端。

## 目录布局与文件职责

`JsonlStorageAdapter` 的注释明确给出布局 `{root}/sessions/{url_encoded_cwd}/{session_id}/`
（[`jsonl/mod.rs:26`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-shell/src/session/storage/jsonl/mod.rs:26)）。
session 目录中的核心文件名由 storage 模块集中定义：`summary.json`、`plan.json`、
`plan_mode.json`、`signals.json`、`usage.json`、`chat_history.jsonl`、
`updates.jsonl`（[`storage/mod.rs:28-38`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-shell/src/session/storage/mod.rs:28)）。
实际路径计算使用编码后的 cwd，而不是把原始路径直接当作目录名
（[`jsonl/mod.rs:175-205`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-shell/src/session/storage/jsonl/mod.rs:175)）。

| 文件/目录 | 代码事实 | 用途 |
|---|---|---|
| `summary.json` | `init_session` 首次创建并写入 `Summary::new`（[`jsonl/mod.rs:1155-1186`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-shell/src/session/storage/jsonl/mod.rs:1155)） | 标题、模型、计数器、session kind、cwd 等元数据 |
| `chat_history.jsonl` | `append_chat_message*` 追加；`replace_chat_history` 可整文件替换（[`jsonl/mod.rs:1737-1759`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-shell/src/session/storage/jsonl/mod.rs:1737)） | 当前可继续采样的 `ConversationItem` |
| `updates.jsonl` | update envelope 追加，读入时兼容 legacy 格式（[`jsonl/mod.rs:629-731`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-shell/src/session/storage/jsonl/mod.rs:629)） | ACP 生命周期/工具流与 xAI 扩展通知 |
| `rewind_points.jsonl` | 全量 JSONL 原子重写并按目标 index 合并 | `/rewind` 的过滤边界 |
| `compaction_checkpoints/`、`compaction_requests/`、`recap_requests/` | 每个请求/检查点独立 JSON 文件（[`jsonl/mod.rs:1841-1875`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-shell/src/session/storage/jsonl/mod.rs:1841)） | 压缩恢复与 recap 的审计制品 |
| `compaction/segment_NNN.md`、`INDEX.md` | 由 segment writer 分配磁盘上的下一个编号并追加索引（[`jsonl/mod.rs:1877-1912`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-shell/src/session/storage/jsonl/mod.rs:1877)） | 压缩前分段历史 |
| `workflows/<run-id>/` | workflow store 验证 run id 后保存 `state.json` 与 journal | 可恢复 workflow 状态 |

## 单写者 persistence actor

模块顶部把损失契约写得很具体：fire-and-forget 的 chunk、工具中间记录、feedback
等可以停留在 buffer；调用者等待的 `FlushAndAck`、`AppendUpdateDurablyAndAck` 则在
ack 发出时已同步到稳定介质；atomic rename 先同步临时文件再 rename，首次创建还同步
父目录（[`persistence.rs:1-14`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-shell/src/session/persistence.rs:1)）。
`PersistenceHandle` 只持有一个 unbounded sender，错误类型区分 `NotCommitted`、
`Committed` 和 `AcknowledgementLost`，因此上层能决定是否安全重试
（[`persistence.rs:1155-1281`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-shell/src/session/persistence.rs:1155)）。

ACP 连续文本 chunk 会先合并，再写一条 update；xAI 扩展通知直接写入。actor 主循环按
消息到达顺序处理 `Update`、durable append、`Chat`、chat replacement、模型/plan 状态等
消息（[`persistence.rs:1781-1953`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-shell/src/session/persistence.rs:1781)）。
这保证了“对话改变”和“对应通知”不会由两个异步任务交错写坏，但也意味着一个 session
的持久化吞吐受单 actor 顺序约束。

### barrier 的精确语义

`flush_pending` 先排空合并中的 notification；`flush_and_sync` 随后只同步自上个成功
barrier 以来被标记 dirty 的文件，并采用 first-error-wins：未提交的写入错误优先于
后续 fsync 错误（[`persistence.rs:1686-1719`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-shell/src/session/persistence.rs:1686)）。
`SessionFileSet` 当前追踪 updates/chat/summary/plan/rewind 五类文件
（[`storage/mod.rs:1101-1125`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-shell/src/session/storage/mod.rs:1101)）。
因此，“fsync 成功”不等于“刚才那条 buffered append 一定成功”：pending write error
会被保留到下一个 barrier，避免给调用者虚假的成功确认。

JSONL 追加本身不是 crash-atomic。写入前检查最后一个字节；如果上次进程在换行前退出，
本次追加先插入换行，把损坏限制为一条孤立坏记录，读者再跳过该行
（[`jsonl/mod.rs:395-460`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-shell/src/session/storage/jsonl/mod.rs:395)）。
全量重写（rewind points、chat replacement）则写临时文件后 rename，旧文件不会被半写覆盖
（[`jsonl/mod.rs:606-610`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-shell/src/session/storage/jsonl/mod.rs:606)）。
这是“追加日志容忍单行损坏、快照文件 old-or-new”的有意取舍。

## 恢复、轻量恢复与 replay

`PersistedData` 包含 summary、chat history、全部 updates、plan、rewind、signals、goal
和 workflow runs；`PersistedDataLight` 明确省略 updates 与 rewind points，后者由
`FileStateTracker` 延迟读取（[`storage/mod.rs:780-816`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-shell/src/session/storage/mod.rs:780)）。
完整加载会在 chat 文件为空时从历史重建，并对 updates 的 envelope/legacy 格式做兼容解析；
损坏行记录 warning 后继续恢复，而不是让整个 session 不可用
（[`jsonl/mod.rs:1500-1625`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-shell/src/session/storage/jsonl/mod.rs:1500)）。

Replay 的路径解析先验证 session id 是单一普通 path component，再按 child/parent cwd
提示快速命中 `sessions/<encoded-cwd>/<id>`；未命中时才扫描 relocation view
（[`replay.rs:192-239`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-shell/src/session/storage/replay.rs:192)）。
生产路径使用 `stream_replay_updates_at_hinted`，逐行过滤 rewind 标记、丢弃不可解析行，
把 `ToolCall` 与后续 `ToolCallUpdate` 合并，并按文件顺序转发 ACP 与 xAI 事件；EOF 时
仍未完成的 tool call 会作为 pending 输出（[`replay.rs:241-341`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-shell/src/session/storage/replay.rs:241)）。
因此 replay 是“面向客户端的事件重建”，不是简单把 JSONL 原样吐出。

## Resume 与 fork

fork 请求由 `fork_session` 生成纯 UUIDv7（固定 36 字符），在 blocking 线程池调用
`copy_session_data_sync`，并将 parent id、目标 cwd/model、session kind、source workspace
等写入子 session 选项；默认还复制 compaction segment archive
（[`fork.rs:50-100`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-shell/src/session/fork.rs:50)）。
本地文件复制完成即可返回；后端 upsert 在 detached task 中进行，失败只记录 warning，
不会让本地 fork 失效（[`fork.rs:104-145`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-shell/src/session/fork.rs:104)）。

`CopySessionOptions` 还支持按 prompt index 截断、过滤不完整 turn、剥离 reasoning、
继承 prefix 长度以及选择性复制 plan/signals/usage 等状态
（[`storage/mod.rs:838-895`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-shell/src/session/storage/mod.rs:838)）。
所以 fork 的“上下文继承”是可配置的文件变换，不是共享可变 transcript。

## 搜索索引与一致性边界

本章的 session search 与 memory index 不应混为一谈：session replay 读取本地
`updates.jsonl`；跨 session memory 则另有 SQLite/FTS/向量索引（见第 07 章）。当 session
持久化成功后，搜索索引更新可异步进行；即使远端 registry、relay 或 telemetry 上传失败，
本地 transcript 仍由 persistence actor 独立保留。这是源码明确的本地优先事实；“远端最终
一定可见”则不是本地代码能保证的行为。

## 可验证证据表

| 结论 | 证据 |
|---|---|
| FIFO actor 与稳定介质契约 | [`persistence.rs:1-14`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-shell/src/session/persistence.rs:1) |
| durable append 错误可分类 | [`persistence.rs:1179-1281`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-shell/src/session/persistence.rs:1179) |
| first-error-wins barrier | [`persistence.rs:1686-1778`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-shell/src/session/persistence.rs:1686) |
| JSONL torn-tail healing | [`jsonl/mod.rs:395-460`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-shell/src/session/storage/jsonl/mod.rs:395) |
| 完整/轻量加载差异 | [`storage/mod.rs:780-816`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-shell/src/session/storage/mod.rs:780) |
| replay 过滤与 tool-call 合并 | [`replay.rs:300-341`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-shell/src/session/storage/replay.rs:300) |
| fork UUID、复制与后台登记 | [`fork.rs:50-145`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-shell/src/session/fork.rs:50) |

“稳定介质”取决于操作系统的 fsync/目录同步能力；源码对 Windows 的目录同步限制有
说明，但不等价于对任意文件系统、断电模型或远端同步服务作出强保证。
