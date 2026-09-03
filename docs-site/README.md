# Grok Build 源码分析阅读站

这是 Wiki 的静态 GitHub Pages 站点。构建脚本直接读取仓库根目录的 `analysis/`、
`diagrams/` 和 `docs/components/`，因此不需要复制或维护第二份章节内容。

```bash
npm ci
npm run docs:build
npm run docs:check
# 或一次完成构建 + 检查
npm run docs:verify
npm run docs:preview
```

构建产物位于 `dist/`；GitHub Actions 会将它发布到 Pages。`dist/` 和
`node_modules/` 已在忽略规则中排除。

构建器默认使用根目录 `SOURCE_REF` 指定的源码 commit，以及
`qqnhy/grok-build-analysiswiki` 作为站点仓库。迁移到其他仓库时可通过环境变量覆盖：

```bash
SITE_REPO=owner/repo PAGES_URL=https://owner.github.io/repo npm run docs:build
```

`SOURCE_REPO`、`SOURCE_REF` 也支持环境变量覆盖；这使得更新源码快照时无需修改构建逻辑。
