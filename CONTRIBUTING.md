# 贡献指南

欢迎补充 Grok Build 的源码分析。这个仓库只保存分析文字、图表和发布脚本，不复制上游源码。

## 更新一篇分析

1. 在 `analysis/` 新建或修改 Markdown，并为关键结论提供固定源码路径和行号。
2. 如果引用了新的源码快照，更新根目录 `SOURCE_REF`，确认对应 commit 在
   `https://github.com/xai-org/grok-build` 可访问。
3. 跨章节阅读链接使用相对 Markdown 链接；构建器会把它们转换成 Pages 的 `.html` 链接。
4. 需要独立可视化时，在 `diagrams/` 添加 Mermaid 页面，并在 `docs-site/build.js` 的目录
   清单中登记。

## 本地检查

```bash
cd docs-site
npm ci
npm run docs:verify
```

`docs:verify` 会重建静态页面，并检查内部链接、必需资源、根相对路径和意外的本地源码路径。
提交前不要把 `docs-site/dist/` 或 `docs-site/node_modules/` 加入 Git。

## 内容约定

- 把“源码直接证明”和“基于证据的推断”分开写。
- 不在文档中粘贴凭据、用户会话、内部 endpoint 或未公开的个人信息。
- 涉及安全、隐私和远端策略时，注明分析快照和可能变化的条件。
- Mermaid 图应保持简洁，并在图下方链接到对应章节作为来源。
