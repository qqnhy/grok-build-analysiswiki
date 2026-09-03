# 第二十章：Prompt 管理、规则注入与上下文预算

## 结论

Grok Build 的 prompt 不是一段拼接字符串，而是一个有 authority、scope 和预算的构造管线：

```text
ACP ContentBlock
   ├─ query / @file / embedded resource / images
   ├─ skill_information
   └─ editor focused/open files
          ↓
prompt_parser → ParsedPrompt(context, query, skills, images)
          ↓
SessionActor prompt_build
   ├─ system prompt（按 model/config/agent 层级解析）
   ├─ AGENTS.md / user rules / workspace rules 分区
   ├─ VCS 状态、MCP server、skill catalog、shell 与日期
   ├─ bounded prefix + large-prompt offload
   └─ zero-turn rewrite / compaction 后重建
          ↓
模型请求
```

这套设计的核心不变量是：用户 query 与上下文保持可分离、技能指令紧邻 query、项目规则不会因 resume/fork 重复注入、超大消息永远先限长再进入模型。`<system-reminder>` 是结构化边界，不等同于模型不可覆盖的安全权限；真正的权限仍由 tool/permission/sandbox 层决定。

## 1. `prompt_parser`：从 ACP 内容块到可截断结构

`ParsedPrompt` 把输入拆成 `context`、`query`、`skill_information`、`images` 和 `is_cursor` 五个字段；`assemble_parts_with_skills` 保证 skill block 紧随 `<user_query>`，并把 context 放在后面（[`prompt_parser.rs:11-60`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-shell/src/session/prompt_parser.rs:11)）。这样调用方可以只裁掉 context，而不需要在一个扁平字符串里搜索 query 边界。

`parse_prompt_with_skills` 按 ACP `Text`、`Image`、`ResourceLink`、`Resource` 分流。只有人类/受信 authority 才展开 `@file` 和无 meta 的 resource link；`ModelAuthoredUntrusted` 禁止文件扩展，避免模型自己伪造 `@path` 把任意文件带入 prompt（[`prompt_parser.rs:65-153`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-shell/src/session/prompt_parser.rs:65)）。文件引用经 `FileReference::parse` 和 workspace working directory 解析，再渲染为 Grok `<file_contents>` 或 Cursor `<code_selection>` 格式；编辑器 focused/open files 则包在 `<system-reminder>`/资源链接段中（[`prompt_parser.rs:157-325`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-shell/src/session/prompt_parser.rs:157)）。

## 2. System prompt resolver 与 session 前缀

系统提示标签的层级是 env > model-specific config > `[agent]` > Grok Build per-model > Grok Build global > 默认 `Grok`（[`util/config/resolve/system_prompt.rs:1-35`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-shell/src/util/config/resolve/system_prompt.rs:1)）。层级解析只决定模板/标签选择；模板正文和工具目录由 agent definition、tool bridge 与 session 运行时共同渲染。

`build_user_message_prefix` 会读取 display cwd、日期、VCS status、UserMessageTemplate，并在默认模板中加入 browser-verification synthetic rules（[`prompt_build.rs:531-593`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-shell/src/session/acp_session_impl/prompt_build.rs:531)）。自定义模板则等待 MCP 前缀 ready，再汇总 workspace/user rules、skills、MCP servers、shell、workspace path、OS 与动态 read tool 名称交给 `UserMessageContext::render`（[`prompt_build.rs:594-672`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-shell/src/session/acp_session_impl/prompt_build.rs:594)）。因此 prompt 的“规则”来源不只 `AGENTS.md`，还包含兼容目录、MCP 和工具能力。

## 3. AGENTS.md / user rules 的 scope 分区与幂等

`partition_rules_by_scope` 根据 Grok home、vendor homes（`.claude`/`.cursor`）和 workspace roots 把发现的规则拆为 user 与 workspace 两组；路径位于 workspace/worktree 下的文件不应因为 basename 类似而错误提升为全局用户规则（[`prompt_build.rs:31-60`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-shell/src/session/acp_session_impl/prompt_build.rs:31)）。`gather_partitioned_rules` 同时考虑 on-disk repository root 和 display cwd，兼容 worktree/远程显示路径（[`prompt_build.rs:635-672`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-shell/src/session/acp_session_impl/prompt_build.rs:635)）。

`conversation_has_project_instructions`/`is_project_instructions` 检查 synthetic reason 和旧版前缀；`install_system_prompt` 对 subagent spawn 可覆盖继承的 leading system，而 top-level resume 保留已存 system（[`prompt_build.rs:263-305`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-shell/src/session/acp_session_impl/prompt_build.rs:263)）。这是 resume/fork 的关键幂等规则：重复启动不会不断追加同一份 AGENTS 内容，也不会让 child agent 沿用错误的 parent system prompt。

## 4. Skill、MCP 与工具目录如何进入 prompt

Skill 内容在 `ParsedPrompt.skill_information` 中保持独立 envelope；模板路径则通过 `slash_skills_for_resolve()` 读取当前 skill listing，并与 `gather_mcp_servers()` 的 server 描述一起传入 `UserMessageContext`（[`prompt_build.rs:594-672`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-shell/src/session/acp_session_impl/prompt_build.rs:594)）。动态 read 工具名通过 `ToolBridge::render_prompt("${{ tools.by_kind.read }}", …)` 求得，避免模板硬编码工具别名。

这意味着工具 schema 有两条路径：完整工具定义由 sampler/tool registry 作为模型工具参数发送；可读性提示（工具名、skill/MCP listing）则可能进入 system/user prefix。工具是否可执行仍由 registry 的 capabilities、permission 和 sandbox 决定，prompt 中出现名称不代表授予权限。

## 5. 大 prompt offload、head/tail 预算与失败策略

`prompt_build.rs` 为大型消息定义 query/context/skill 的独立预算；`bound_head_tail` 保留头部和尾部并使用 UTF-8-safe elision，尾部保留用户最后问题（[`prompt_build.rs:381-422`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-shell/src/session/acp_session_impl/prompt_build.rs:381)）。`build_truncated_prompt_message` 先给 skill 独立 inline 空间，再按比例分配 query 与 context；消息外还附带一个指向本地 offload 文件的 notice（[`prompt_build.rs:423-474`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-shell/src/session/acp_session_impl/prompt_build.rs:423)）。

写 offload 文件失败时不会把原始超大消息继续发送，而是去掉 notice、返回 bounded preview 并记录 warning（[`prompt_build.rs:478-499`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-shell/src/session/acp_session_impl/prompt_build.rs:478)）。这是可用性与隐私的双重边界：本地文件可能包含完整请求，模型只应看到受预算限制的片段；但拥有本机权限的进程仍可读取 offload 文件，需纳入 `$GROK_HOME` 清理和加密策略。

## 6. Zero-turn prefix 与动态重载

配置、MCP readiness 或 skill 变化可能要求重建首条 user prefix。`rewrite_zero_turn_prefix` 只在零 turn 时替换 conversation index 1，并可移除 startup skill reminder；已有 turn 不会被静默重排（[`prompt_build.rs:503-529`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-shell/src/session/acp_session_impl/prompt_build.rs:503)）。这保护 KV prefix/cache 与 transcript 顺序，但也意味着运行中配置变化通常要等下一 session 或显式 reload 才完全体现。

Memory 注入采用类似幂等策略：leading system 已有 `<memory-context>` 时不重新搜索，以避免改变 system prefix、打破 KV cache（[`session/helpers/memory_context.rs:13-18`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-shell/src/session/helpers/memory_context.rs:13)）。compaction 后则可重新注入相关 memory，详见第 07 章。

## 7. 审计要点

1. 复现一次 prompt 时同时记录 authority、system resolver 层级、规则 scope、skill/MCP listing、tool catalog 和最终 token snapshot；只打印用户文本不足以解释模型所见上下文。
2. 将 `ModelAuthoredUntrusted` 的文件扩展保护视为安全不变量；新增 ACP content block 或 resource link 类型必须补 authority 测试。
3. 审核 offload 目录的权限、生命周期和备份；大 prompt 失败时确认 bounded preview 而不是原文 fallback。
4. 修改模板、AGENTS discovery 或 zero-turn rewrite 时，回归 resume、fork、subagent spawn、compaction 和 KV-cache 命中率。

## 证据索引

| 主题 | 证据 |
|---|---|
| ParsedPrompt 与 skill 排布 | [`prompt_parser.rs:11-60`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-shell/src/session/prompt_parser.rs:11) |
| authority、@file、resource 渲染 | [`prompt_parser.rs:65-153`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-shell/src/session/prompt_parser.rs:65) |
| system prompt 层级 | [`system_prompt.rs:1-35`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-shell/src/util/config/resolve/system_prompt.rs:1) |
| prefix、rules、MCP/skills 汇总 | [`prompt_build.rs:531-672`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-shell/src/session/acp_session_impl/prompt_build.rs:531) |
| scope partition 与幂等 system | [`prompt_build.rs:31-60,263-305`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-shell/src/session/acp_session_impl/prompt_build.rs:31) |
| large prompt offload | [`prompt_build.rs:381-499`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-shell/src/session/acp_session_impl/prompt_build.rs:381) |
| zero-turn rewrite / memory idempotency | [`prompt_build.rs:503-529`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-shell/src/session/acp_session_impl/prompt_build.rs:503)、[`memory_context.rs:13-18`](/home/qiqiang/opensource/grok-build/crates/codegen/xai-grok-shell/src/session/helpers/memory_context.rs:13) |
