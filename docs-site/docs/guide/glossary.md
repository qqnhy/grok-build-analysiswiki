# 术语表

| 术语 | 含义 |
| --- | --- |
| ACP | Agent Client Protocol，客户端与 agent 的消息协议 |
| SessionActor | 串行调度一个会话 turn、事件和恢复状态的 actor |
| FinalizedToolset | 在 turn 边界确定、供模型和执行器共享的工具目录 |
| Compaction | 在上下文预算不足时生成摘要并替换旧 conversation segment |
| Folder Trust | 对项目配置和扩展来源进行信任判定的门控 |
| ToolHarness | 远程 workspace RPC 中承载工具调用的服务端适配器 |
