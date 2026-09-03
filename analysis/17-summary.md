# 第十七章：总结与可验证结论

## 架构判断

Grok Build 的核心不是某一个模型调用，而是“边界清晰的执行平台”：

```text
输入（CLI/ACP/TUI）
  → session actor（顺序、取消、持久化）
  → sampling + tool registry（模型与能力）
  → workspace（FS/VCS/terminal）
  → trust/permission/sandbox（宿主边界）
  → transcript/memory/telemetry（可恢复与可观测）
```

每一层都有独立 crate 和测试，允许替换 transport 或 UI，而不重写 turn 逻辑。

## 最重要的五个机制

1. **启动安全顺序**：resume target 与保存的 sandbox profile 在不可逆隔离前 pin（第 02 章）。
2. **统一工具流**：typed tool 经 `ToolDyn` 擦除，`Progress* + Terminal` 让多种客户端共享
   同一结果语义（第 04 章）。
3. **状态 actor**：session/chat state 通过 mailbox 串行修改，减少锁和竞态；ACP 只做适配
   （第 03、06 章）。
4. **可恢复上下文**：compaction 不仅生成摘要，还持久化 segment/index；memory 使用
   Markdown + FTS/向量双路径（第 07 章）。
5. **多层防线**：trust gate → permission → sandbox → 凭据/遥测脱敏，任何一层都不能被
   “插件可见”自动绕过（第 09、10 章）。

## 风险与审计重点

- 任何能注册 tool、hook、MCP 或 workflow 的来源，都应检查其 trust scope 和 permission
  provenance；动态 registry 本身不是安全边界。
- 请求头、session transcript、memory、trace upload 可能携带代码和路径。TelemetryMode
  的 `Disabled/SessionMetrics/Enabled` 要和企业配置一起审计，不能只看默认值。
- sandbox 在 Linux 上可能通过 bwrap/Landlock 重 exec；apply 失败时的降级日志和调用方策略
  是部署审计重点。
- session search、foreign-session import 和 compaction segment 会读取本地其他 agent 的
  元数据；其 capability/root allowlist 需要与用户预期匹配。

## 新增专题结论

- 第 18 章把“模型请求、本地 session/memory、trace/feedback、外部 OTLP、MCP/hooks/plugins”
  分成独立数据流，并给出逐项关闭或缩小暴露面的用户清单；`/share` 当前是 disabled，不能
  由此推断其他上传出口也关闭。
- 第 19 章确认 slash registry 同时维护 hard-hidden、menu-hidden、required-tool 和
  restricted gate；`/gboom`、`/scroll-debug` 以及 `workspace`/`--trigger` 等 CLI 入口都
  是源码可复核的隐藏或内部接线，不应只看 `--help` 判断能力边界。
- 第 20 章补齐 prompt 构造链：authority 解析、AGENTS/user/workspace scope、skill/MCP
  注入、large-prompt offload、zero-turn rewrite 和 memory 幂等；因此“发送给模型的文本”
  不能只用用户最后一句话重建。

## 可复核的工程亮点

- 兼容性：MCP 同时支持 stdio、streamable HTTP、OAuth；sampling 同时支持三种模型 API。
- 可观测性：typed session events、sampling metrics、Sentry scrubber、OTel content gate
  分离了故障诊断与内容上传。
- 可测试性：actor、transport、压缩、文件索引和权限 resolver 都有独立单元/集成测试，
  关键不变量（JSONL、terminal stream、journal replay、trust precedence）有测试向量。
- 可演进性：common crates 提供抽象 seam，shell/pager 只是宿主；插件和兼容工具不必侵入
  核心 session 状态机。

## 最终建议

阅读或改动代码时，先从第 15 章证据索引跳到入口，再沿 `MvpAgent → SessionActor →
prompt_build → ToolBridge/SamplerHandle → Workspace` 路径走一遍；涉及执行风险时同时阅读第
09、10、18、19、20 章。
任何只修改 UI 或单个工具而没有检查 persistence、cancellation、trust 和 telemetry 的
变更，都可能破坏跨入口一致性。
