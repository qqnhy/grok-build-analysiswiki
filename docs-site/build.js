import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DIST = path.join(HERE, 'dist');
const SITE_TITLE = 'Grok Build 源码分析';
const DEFAULT_SITE_REPO = 'qqnhy/grok-build-analysiswiki';
const DEFAULT_SOURCE_REPO = 'xai-org/grok-build';
const DEFAULT_SOURCE_REF = '72a61251fcffb464bcc687aeb5a998e5a98ec0c9';

function readFirstLine(file, fallback) {
  try {
    const value = fs.readFileSync(file, 'utf8').trim().split(/\s+/)[0];
    return value || fallback;
  } catch {
    return fallback;
  }
}

function repoSlug(value, fallback) {
  const normalized = String(value || '')
    .trim()
    .replace(/^https?:\/\/github\.com\//i, '')
    .replace(/\.git$/, '')
    .replace(/^\/+|\/+$/g, '');
  return normalized || fallback;
}

const SOURCE_REPO = repoSlug(process.env.SOURCE_REPO, DEFAULT_SOURCE_REPO);
const SOURCE_REF = process.env.SOURCE_REF || readFirstLine(path.join(ROOT, 'SOURCE_REF'), DEFAULT_SOURCE_REF);
const SITE_REPO = repoSlug(process.env.SITE_REPO || process.env.GITHUB_REPOSITORY, DEFAULT_SITE_REPO);
const SITE_REPO_URL = (process.env.SITE_REPO_URL || `https://github.com/${SITE_REPO}`).replace(/\/+$/, '');
const PAGES_URL = (process.env.PAGES_URL || `https://${SITE_REPO.split('/')[0]}.github.io/${SITE_REPO.split('/')[1]}`).replace(/\/+$/, '');
const SOURCE_URL = `https://github.com/${SOURCE_REPO}/blob/${SOURCE_REF}`;

const guides = [
  { slug: 'overview', title: '项目概览', file: 'docs/guide/overview.md' },
  { slug: 'reading-roadmap', title: '阅读路线图', file: 'docs/guide/reading-roadmap.md' },
  { slug: 'architecture-overview', title: '架构快览', file: 'docs/guide/architecture-overview.md' },
  { slug: 'glossary', title: '术语表', file: 'docs/guide/glossary.md' },
];

const chapters = [
  { slug: '01-architecture-overview', title: '总体架构与模块边界', desc: '入口、crate 分层与核心调用边界', group: '核心运行时' },
  { slug: '02-startup-and-cli', title: '启动顺序与 CLI 分流', desc: '从 main 到 TUI、headless 与 ACP', group: '核心运行时' },
  { slug: '03-agent-loop-and-acp', title: 'Agent loop 与 ACP', desc: 'session actor、turn 与协议事件', group: '核心运行时' },
  { slug: '04-tool-call-runtime', title: 'Tool Call、registry 与流式协议', desc: '统一工具目录与 Progress/Terminal 流', group: '核心运行时' },
  { slug: '05-sampling-and-model-api', title: 'Sampling、SSE 与模型 API', desc: '采样请求、重试、取消与流式响应', group: '核心运行时' },
  { slug: '06-session-persistence', title: 'Session、Transcript、Resume 与搜索', desc: 'JSONL 持久化、恢复与检索', group: '状态与扩展' },
  { slug: '07-memory-and-compaction', title: 'Memory、Embedding 与 Compaction', desc: '记忆索引、压缩和上下文预算', group: '状态与扩展' },
  { slug: '08-mcp-skills-plugins', title: 'MCP、Skills、Plugins、Hooks 与 Workflow', desc: '扩展发现、信任和生命周期', group: '状态与扩展' },
  { slug: '11-multi-agent-leader-worktree', title: 'Multi-Agent、Leader、后台任务与 Worktree', desc: '协作调度、隔离工作树与 relay', group: '状态与扩展' },
  { slug: '20-prompt-management', title: 'Prompt 管理、规则注入与上下文预算', desc: 'prompt 解析、规则作用域与 offload', group: '状态与扩展' },
  { slug: '09-sandbox-permission-trust', title: 'Sandbox、Permission 与 Folder Trust', desc: '宿主边界、审批和执行隔离', group: '边界、安全与界面' },
  { slug: '10-security-privacy-telemetry', title: '安全、隐私与 Telemetry', desc: '凭据、脱敏、遥测与数据出口', group: '边界、安全与界面' },
  { slug: '12-tui-and-headless', title: 'TUI、Headless 与 Relay', desc: '交互渲染和无界面入口', group: '边界、安全与界面' },
  { slug: '13-workspace-filesystem-vcs', title: 'Workspace、文件系统与 VCS', desc: '文件、终端与 Git 操作策略', group: '边界、安全与界面' },
  { slug: '14-tests-performance-and-engineering', title: '测试、性能与工程实践', desc: '测试布局、并发和性能护栏', group: '工程与审计' },
  { slug: '15-code-evidence-index', title: '代码证据索引', desc: '结论到源码位置的反向索引', group: '工程与审计' },
  { slug: '16-source-tree', title: '源码树与 crate 地图', desc: 'workspace 成员和目录导航', group: '工程与审计' },
  { slug: '17-summary', title: '总结与可验证结论', desc: '边界、证据与待验证假设', group: '工程与审计' },
  { slug: '18-privacy-and-data-flow', title: '用户隐私、数据流与规避建议', desc: '本地落盘、网络上传与风险清单', group: '专题审计' },
  { slug: '19-hidden-features-and-commands', title: '隐藏命令、Feature Flags 与产品彩蛋', desc: '隐藏入口、开关和兼容行为', group: '专题审计' },
];

const diagrams = [
  { slug: 'startup-flow', title: 'CLI 启动流程', file: 'diagrams/startup-flow.md', desc: '从 argv 到运行时分流' },
  { slug: 'agent-flow', title: 'Agent 执行流程', file: 'diagrams/agent-flow.md', desc: '一次 turn 的消息与事件路径' },
  { slug: 'tool-call-flow', title: 'Tool Call 调用流程', file: 'diagrams/tool-call-flow.md', desc: 'registry、适配器和终态结果' },
  { slug: 'mcp-flow', title: 'MCP 集成流程', file: 'diagrams/mcp-flow.md', desc: '初始化、schema、调用与重连' },
  { slug: 'memory-flow', title: 'Memory 管理流程', file: 'diagrams/memory-flow.md', desc: 'Markdown、索引、embedding 与注入' },
  { slug: 'sandbox-flow', title: 'Sandbox 权限控制', file: 'diagrams/sandbox-flow.md', desc: 'trust、permission 与 sandbox 组合边界' },
];
const components = [
  { slug: 'component-overview', title: 'Crate / 组件总览', file: 'docs/components/component-overview.md', desc: 'Rust crate 分层与运行时边界' },
  { slug: 'component-index', title: 'Crate 组件索引', file: 'docs/components/component-index.md', desc: '组件位置、责任与延伸阅读' },
];

const navGroups = [
  { label: '阅读指南', items: guides.map(item => ({ ...item, file: `guide/${item.slug}` })) },
  { label: '组件体系', items: components.map(item => ({ ...item, file: `components/${item.slug}` })) },
  ...['核心运行时', '状态与扩展', '边界、安全与界面', '工程与审计', '专题审计'].map(label => ({
    label,
    items: chapters.filter(item => item.group === label).map(item => ({ ...item, file: `chapters/${item.slug}`, navTitle: `第 ${Number(item.slug.slice(0, 2))} 章：${item.title}` })),
  })),
  { label: '架构流程图', items: diagrams.map(item => ({ ...item, file: `diagrams/${item.slug}` })) },
];

const chapterItems = navGroups.filter(group => ['核心运行时', '状态与扩展', '边界、安全与界面', '工程与审计', '专题审计'].includes(group.label)).flatMap(group => group.items).sort((a, b) => a.file.localeCompare(b.file, undefined, { numeric: true }));
const allPages = [...navGroups.find(group => group.label === '阅读指南').items, ...navGroups.find(group => group.label === '组件体系').items, ...chapterItems, ...navGroups.find(group => group.label === '架构流程图').items];
const outputBySource = new Map();
for (const item of guides) outputBySource.set(path.resolve(HERE, item.file), `guide/${item.slug}`);
for (const item of chapters) outputBySource.set(path.resolve(ROOT, 'analysis', `${item.slug}.md`), `chapters/${item.slug}`);
for (const item of diagrams) outputBySource.set(path.resolve(ROOT, item.file), `diagrams/${item.slug}`);
for (const item of components) outputBySource.set(path.resolve(HERE, item.file), `components/${item.slug}`);

function assertCatalog() {
  const check = (directory, listed, label) => {
    if (!fs.existsSync(directory)) throw new Error(`Missing ${label} directory: ${directory}`);
    const actual = fs.readdirSync(directory).filter(name => name.endsWith('.md')).sort();
    const missing = listed.filter(name => !actual.includes(name));
    const unlisted = actual.filter(name => !listed.includes(name));
    if (missing.length || unlisted.length) {
      throw new Error(`${label} catalog mismatch; missing: ${missing.join(', ') || 'none'}; unlisted: ${unlisted.join(', ') || 'none'}`);
    }
  };
  check(path.join(ROOT, 'analysis'), chapters.map(item => `${item.slug}.md`), 'analysis');
  check(path.join(ROOT, 'diagrams'), diagrams.map(item => item.file.replace(/^diagrams\//, '')), 'diagrams');
  check(path.join(HERE, 'docs/guide'), guides.map(item => item.file.replace(/^docs\/guide\//, '')), 'guides');
  check(path.join(HERE, 'docs/components'), components.map(item => item.file.replace(/^docs\/components\//, '')), 'components');
}

function esc(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function stripFrontmatter(md) {
  return md.replace(/^---[\s\S]*?---\s*/, '');
}

function titleOf(md, fallback) {
  const match = md.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : fallback;
}

function sourceHref(destination, label = '') {
  const prefix = '/home/qiqiang/opensource/grok-build/';
  if (!destination.startsWith(prefix)) return null;
  const relative = destination.slice(prefix.length);
  // GitHub's blob viewer accepts one contiguous range; preserve additional
  // ranges in the visible label and link the first range.
  const match = relative.match(/^(.+?):(\d+)(?:-(\d+))?(?:,.*)?$/);
  if (!match) return `${SOURCE_URL}/${relative}`;
  const [, file, first, destinationLast] = match;
  // Most notes keep the end line in the human-readable label rather than in
  // the Markdown destination (`path.rs:31` with label `path.rs:31-60`).
  // Recover that range so the published link opens the complete evidence.
  const labelMatch = String(label).match(/:(\d+)(?:-(\d+))?/);
  const last = destinationLast || (labelMatch && labelMatch[2]);
  return `${SOURCE_URL}/${file}#L${first}${last ? `-L${last}` : ''}`;
}

function relativeUrl(target, from) {
  const fromDepth = from ? from.split('/').length - 1 : 0;
  return `${'../'.repeat(fromDepth)}${target}.html`;
}

function internalHref(destination, sourceFile) {
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(destination) || destination.startsWith('#')) return null;
  const match = destination.match(/^([^#?]*)(.*)$/);
  const target = match ? match[1] : destination;
  const suffix = match ? match[2] : '';
  if (!target.endsWith('.md')) return null;
  const resolved = path.resolve(path.dirname(sourceFile), target);
  const output = outputBySource.get(resolved);
  return output ? `${relativeUrl(output, outputBySource.get(sourceFile) || '')}${suffix}` : null;
}

function rewriteLinks(md, sourceFile) {
  // Destinations in this corpus have no spaces. Restricting the replacement
  // to Markdown link destinations avoids changing code examples containing a
  // local path.
  return md.replace(/\[([^\]]*)\]\(([^\s)]+)\)/g, (whole, label, destination) => {
    const source = sourceHref(destination, label);
    if (source) return `[${label}](${source})`;
    const internal = internalHref(destination, sourceFile);
    return internal ? `[${label}](${internal})` : whole;
  });
}

const renderer = new marked.Renderer();
renderer.code = (token, language) => {
  const code = typeof token === 'object' ? token.text : token;
  const lang = typeof token === 'object' ? token.lang : language;
  if ((lang || '').toLowerCase() === 'mermaid') return `<div class="mermaid">${esc(code)}</div>\n`;
  return `<pre><code class="language-${esc(lang || '')}">${esc(code)}</code></pre>\n`;
};
// Keep future contributions from injecting arbitrary markup/script into Pages.
renderer.html = token => esc(typeof token === 'object' ? token.text : token);
marked.use({ renderer, gfm: true, breaks: false });

function nav(current) {
  const depth = current ? current.split('/').length - 1 : 0;
  const root = '../'.repeat(depth);
  let out = `<div class="site-brand"><a href="${root}index.html" aria-label="返回首页">Grok Build<br>源码分析</a></div>`;
  out += '<nav aria-label="站点导航">';
  for (const group of navGroups) {
    out += `<div class="nav-group"><div class="nav-group-label">${esc(group.label)}</div>`;
    for (const item of group.items) {
      const active = current === item.file ? ' active' : '';
      out += `<a class="nav-link${active}"${active ? ' aria-current="page"' : ''} href="${root}${item.file}.html">${esc(item.navTitle || item.title)}</a>`;
    }
    out += '</div>';
  }
  return `${out}</nav>`;
}

function pageNavigation(file, root) {
  if (!file) return '';
  const index = allPages.findIndex(item => item.file === file);
  if (index < 0) return '';
  const prev = allPages[index - 1];
  const next = allPages[index + 1];
  return `<nav class="page-navigation" aria-label="页面导航">${prev ? `<a rel="prev" href="${root}${prev.file}.html">← ${esc(prev.navTitle || prev.title)}</a>` : '<span></span>'}${next ? `<a rel="next" href="${root}${next.file}.html">${esc(next.navTitle || next.title)} →</a>` : '<span></span>'}</nav>`;
}

function page(file, title, body, options = {}) {
  const depth = file ? file.split('/').length - 1 : 0;
  const root = '../'.repeat(depth);
  const canonical = options.canonical ? `<link rel="canonical" href="${esc(options.canonical)}">` : '';
  const mermaid = options.hasMermaid
    ? '<script src="https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js" integrity="sha384-WmdflGW9aGfoBdHc4rRyWzYuAjEmDwMdGdiPNacbwfGKxBW/SO6guzuQ76qjnSlr" crossorigin="anonymous"></script><script>mermaid.initialize({startOnLoad:true,theme:\'neutral\',securityLevel:\'strict\'});</script>'
    : '';
  const description = options.description || 'Grok Build Rust coding agent 源码分析阅读站';
  const documentTitle = title === SITE_TITLE ? title : `${title} - ${SITE_TITLE}`;
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#8b4513"><meta name="description" content="${esc(description)}"><meta property="og:title" content="${esc(documentTitle)}"><meta property="og:description" content="${esc(description)}"><meta property="og:type" content="article"><meta property="og:url" content="${esc(options.canonical || PAGES_URL)}">${canonical}<title>${esc(documentTitle)}</title><link rel="icon" href="${root}favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="${root}style.css"></head><body><a class="skip-link" href="#main-content">跳到正文</a><div class="layout"><aside class="sidebar">${nav(file)}</aside><main id="main-content" class="content">${body}${pageNavigation(file, root)}<div class="page-footer"><a href="${root}index.html">← 返回首页</a> · <a href="${esc(SITE_REPO_URL)}" target="_blank" rel="noopener">GitHub</a> · © 2026 grok-build-analysis contributors</div></main></div>${mermaid}</body></html>`;
}

function writeDoc(item, file, sourceFile) {
  if (!fs.existsSync(sourceFile)) throw new Error(`Missing document: ${sourceFile}`);
  const raw = rewriteLinks(stripFrontmatter(fs.readFileSync(sourceFile, 'utf8')), sourceFile);
  const body = marked.parse(raw);
  const output = path.join(DIST, `${file}.html`);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, page(file, titleOf(raw, item.title), body, {
    hasMermaid: raw.includes('```mermaid'),
    description: item.desc || `${item.title}：${SITE_TITLE}`,
    canonical: `${PAGES_URL}/${file}.html`,
  }));
}

function card(item) {
  return `<div class="chapter-card"><a href="${item.file}.html">${esc(item.navTitle || item.title)}</a>${item.desc ? `<p class="card-desc">${esc(item.desc)}</p>` : ''}</div>`;
}

function buildHomepage() {
  const sections = [];
  for (const group of navGroups.filter(group => !['阅读指南', '架构流程图'].includes(group.label))) {
    sections.push(`<div class="section-heading">${esc(group.label)}</div><div class="chapter-grid">${group.items.map(card).join('')}</div>`);
  }
  sections.push(`<div class="section-heading">架构流程图</div><div class="chapter-grid">${diagrams.map(item => card({ ...item, file: `diagrams/${item.slug}` })).join('')}</div>`);
  const intro = '<p>本阅读站对 Grok Build Rust coding agent 的运行时、扩展、安全与工程实现进行可复核的源码分析。每个源码证据链接固定到一个公开 commit，便于复查与引用。</p>';
  const body = `<div class="home-hero"><h1>${SITE_TITLE}</h1><p class="tagline">深入理解终端 AI Coding Agent 的工程设计</p><div class="stats"><span>🦀 Rust workspace</span><span>📚 ${chapters.length} 个章节</span><span>📊 ${diagrams.length} 张流程图</span><span>🔍 ${esc(SOURCE_REF.slice(0, 12))}…</span></div></div><div class="home-intro">${intro}</div><div class="section-heading">阅读指南</div><div class="chapter-grid">${guides.map(item => card({ ...item, file: `guide/${item.slug}` })).join('')}</div>${sections.join('')}`;
  fs.writeFileSync(path.join(DIST, 'index.html'), page('', SITE_TITLE, body, { description: 'Grok Build Rust coding agent 的系统性源码分析阅读站。', canonical: PAGES_URL }));
}

function writeExtras() {
  fs.copyFileSync(path.join(HERE, 'style.css'), path.join(DIST, 'style.css'));
  fs.copyFileSync(path.join(HERE, 'favicon.svg'), path.join(DIST, 'favicon.svg'));
  fs.writeFileSync(path.join(DIST, '.nojekyll'), '');
  fs.writeFileSync(path.join(DIST, '404.html'), page('', '页面未找到', `<h1>页面未找到</h1><p>这个页面不存在，或链接已经移动。</p><p><a href="${esc(`${PAGES_URL}/index.html`)}">返回首页</a></p>`, { description: '页面未找到', canonical: PAGES_URL }));
  const urls = ['index.html', ...allPages.map(item => `${item.file}.html`)];
  fs.writeFileSync(path.join(DIST, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map(url => `<url><loc>${esc(`${PAGES_URL}/${url}`)}</loc></url>`).join('')}</urlset>`);
  fs.writeFileSync(path.join(DIST, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${PAGES_URL}/sitemap.xml\n`);
}

function build() {
  assertCatalog();
  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });
  writeExtras();
  buildHomepage();
  for (const item of guides) writeDoc(item, `guide/${item.slug}`, path.join(HERE, item.file));
  for (const item of components) writeDoc(item, `components/${item.slug}`, path.join(HERE, item.file));
  for (const item of chapters) writeDoc(item, `chapters/${item.slug}`, path.join(ROOT, 'analysis', `${item.slug}.md`));
  for (const item of diagrams) writeDoc(item, `diagrams/${item.slug}`, path.join(ROOT, item.file));
  console.log(`Built ${allPages.length} content pages (+ index, 404, sitemap, robots) in ${DIST}`);
}

build();
