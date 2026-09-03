import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(HERE, '..', 'dist');
const htmlFiles = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.html')) htmlFiles.push(full);
  }
}

if (!fs.existsSync(DIST)) {
  console.error('dist/ does not exist; run npm run docs:build first');
  process.exit(1);
}

walk(DIST);
const errors = [];
const hrefPattern = /href\s*=\s*["']([^"']+)["']/gi;
for (const file of htmlFiles) {
  const html = fs.readFileSync(file, 'utf8');
  let match;
  while ((match = hrefPattern.exec(html))) {
    const href = match[1];
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#|mailto:|javascript:)/i.test(href)) continue;
    const target = href.split('#')[0].split('?')[0];
    if (!target) continue;
    const resolved = path.resolve(path.dirname(file), target);
    if (!fs.existsSync(resolved)) errors.push(`${path.relative(DIST, file)} -> ${href}`);
  }
  if (html.includes('/home/qiqiang/opensource/grok-build/')) errors.push(`${path.relative(DIST, file)} contains a local source path`);
  if (html.match(/href=["']\/(?!\/)/)) errors.push(`${path.relative(DIST, file)} contains a root-relative href`);
}

const required = ['index.html', '404.html', 'style.css', 'favicon.svg', 'sitemap.xml', 'robots.txt'];
for (const rel of required) if (!fs.existsSync(path.join(DIST, rel))) errors.push(`missing ${rel}`);
if (errors.length) {
  console.error(`Link check failed (${errors.length} issue${errors.length === 1 ? '' : 's'})`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log(`Link check passed: ${htmlFiles.length} HTML pages`);
