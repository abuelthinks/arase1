// Bundles the docs/learning lessons into one self-contained HTML file that
// works offline (copy it to a phone and open it in the browser).
// Run with: npm run learn:offline

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { micromark } from 'micromark';
import { gfm, gfmHtml } from 'micromark-extension-gfm';
import { LESSONS } from '../src/app/learn/learn-data.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const lessonsDir = join(root, 'docs', 'learning');
const outFile = join(lessonsDir, 'arase-course.html');

const escapeHtml = (text) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const slugs = new Set(LESSONS.map((lesson) => lesson.slug));

// Sibling lesson links become in-page links; repo file paths can't be opened
// on a phone, so they render as plain path labels instead of dead links.
const rewriteLinks = (html) =>
  html.replace(/<a href="([^"]*)">([\s\S]*?)<\/a>/g, (match, href, inner) => {
    if (/^https?:\/\//.test(href)) {
      return `<a href="${href}" target="_blank" rel="noreferrer">${inner}</a>`;
    }
    const sibling = href.match(/^([\w-]+)\.md(?:#.*)?$/);
    if (sibling && slugs.has(sibling[1])) {
      return `<a href="#${sibling[1]}">${inner}</a>`;
    }
    return `<span class="path">${inner}</span>`;
  });

const sections = LESSONS.map((lesson, index) => {
  const markdown = readFileSync(join(lessonsDir, `${lesson.slug}.md`), 'utf8');
  const body = rewriteLinks(
    micromark(markdown, { extensions: [gfm()], htmlExtensions: [gfmHtml()] }),
  );
  const prev = LESSONS[index - 1];
  const next = LESSONS[index + 1];
  const pager = `
    <nav class="pager">
      ${prev ? `<a href="#${prev.slug}" class="pager-link"><span>Previous</span>${escapeHtml(prev.title)}</a>` : '<span></span>'}
      ${next ? `<a href="#${next.slug}" class="pager-link pager-next"><span>Next</span>${escapeHtml(next.title)}</a>` : '<span></span>'}
    </nav>`;
  const doneToggle = lesson.reference
    ? ''
    : `<label class="done-toggle"><input type="checkbox" data-done="${lesson.slug}"> Mark this lesson done</label>`;
  return `<article id="${lesson.slug}" class="lesson">${body}${doneToggle}${pager}</article>`;
}).join('\n');

const parts = [...new Set(LESSONS.map((lesson) => lesson.part))];
const menu = parts.map((part) => {
  const items = LESSONS.filter((lesson) => lesson.part === part).map((lesson) => `
        <li><a href="#${lesson.slug}" data-nav="${lesson.slug}">
          <span class="nav-num">${lesson.reference ? '' : escapeHtml(lesson.num)}</span>
          <span class="nav-title">${escapeHtml(lesson.title)}</span>
          ${lesson.reference ? '' : '<svg class="nav-check" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>'}
        </a></li>`).join('');
  return `<div class="nav-part"><h2>${escapeHtml(part)}</h2><ul>${items}</ul></div>`;
}).join('');

const builtOn = new Date().toISOString().slice(0, 10);

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ARASE Code Course</title>
<script>document.documentElement.classList.add('js');</script>
<style>
:root {
  --bg: #ffffff; --surface: #f6f7f9; --text: #1f2328; --muted: #59636e; --line: #d8dee4;
  --accent: #2563eb; --accent-soft: #eff4ff; --code-bg: #eef1f4; --done: #15803d;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0f1115; --surface: #171a21; --text: #e6e8eb; --muted: #9aa4af; --line: #2c313a;
    --accent: #6ea0ff; --accent-soft: #18233a; --code-bg: #1d2129; --done: #4ade80;
  }
}
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body {
  margin: 0; background: var(--bg); color: var(--text);
  font: 16px/1.65 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}
.topbar {
  position: sticky; top: 0; z-index: 10; display: flex; align-items: center; gap: 12px;
  padding: 10px 16px; background: var(--bg); border-bottom: 1px solid var(--line);
}
.topbar h1 { font-size: 15px; margin: 0; flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.icon-btn {
  display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px;
  border: 1px solid var(--line); border-radius: 10px; background: var(--surface); color: var(--text);
  cursor: pointer; transition: background-color .15s, border-color .15s;
}
.icon-btn:hover { border-color: var(--accent); }
.icon-btn svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.progress { font-size: 13px; color: var(--muted); white-space: nowrap; }
.layout { display: flex; flex-direction: column; max-width: 1100px; margin: 0 auto; }
/* Without JavaScript (e.g. an iOS Files preview) the menu is a plain contents
   list and every lesson shows on one long page. */
.nav { padding: 16px; background: var(--surface); border-bottom: 1px solid var(--line); }
html:not(.js) #menu-btn, html:not(.js) .done-toggle, html:not(.js) .progress { display: none; }
html:not(.js) .lesson + .lesson { margin-top: 48px; padding-top: 8px; border-top: 3px solid var(--line); }
html.js .nav {
  position: fixed; inset: 0 auto 0 0; width: min(320px, 85vw); z-index: 20; overflow-y: auto;
  border-bottom: 0; border-right: 1px solid var(--line);
  transform: translateX(-100%); transition: transform .2s;
}
html.js body.nav-open .nav { transform: none; }
.scrim { position: fixed; inset: 0; z-index: 15; background: rgba(0,0,0,.4); display: none; }
body.nav-open .scrim { display: block; }
.nav-part h2 { font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); margin: 18px 0 6px; border: 0; padding: 0; }
.nav-part:first-child h2 { margin-top: 0; }
.nav ul { list-style: none; margin: 0; padding: 0; }
.nav a {
  display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 8px;
  color: var(--text); text-decoration: none; border: 1px solid transparent;
  transition: background-color .15s, color .15s, border-color .15s;
}
.nav a:hover { background: var(--accent-soft); border-color: var(--line); }
.nav a.active { background: var(--accent-soft); color: var(--accent); border-color: var(--accent); }
.nav-num { width: 22px; font-size: 13px; color: var(--muted); font-variant-numeric: tabular-nums; }
.nav-title { flex: 1; font-size: 14px; }
.nav-check { width: 16px; height: 16px; fill: none; stroke: var(--done); stroke-width: 3; visibility: hidden; }
.nav a.done .nav-check { visibility: visible; }
main { flex: 1; min-width: 0; padding: 20px 16px 48px; }
@media (min-width: 900px) {
  .layout { flex-direction: row; }
  .nav, html.js .nav {
    position: sticky; top: 61px; height: calc(100vh - 61px); overflow-y: auto; transform: none; flex: 0 0 280px;
    border-bottom: 0; border-right: 1px solid var(--line);
  }
  .scrim, #menu-btn { display: none !important; }
  main { padding: 28px 40px 64px; }
}
.lesson h1 { font-size: 26px; line-height: 1.25; margin: 0 0 12px; }
.lesson h2 { font-size: 20px; margin: 32px 0 10px; padding-top: 16px; border-top: 1px solid var(--line); }
.lesson h3 { font-size: 17px; margin: 24px 0 8px; }
.lesson a { color: var(--accent); text-underline-offset: 2px; }
.lesson code, .path {
  font: 0.86em/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  background: var(--code-bg); padding: .1em .35em; border-radius: 4px; overflow-wrap: anywhere;
}
.path code { background: none; padding: 0; font-size: 1em; }
.lesson pre {
  background: var(--surface); border: 1px solid var(--line); border-radius: 8px;
  padding: 12px 14px; overflow-x: auto; -webkit-overflow-scrolling: touch;
}
.lesson pre code { background: none; padding: 0; font-size: 12.5px; line-height: 1.5; overflow-wrap: normal; white-space: pre; }
.lesson table { display: block; overflow-x: auto; border-collapse: collapse; font-size: 14px; margin: 14px 0; }
.lesson th, .lesson td { border: 1px solid var(--line); padding: 7px 10px; text-align: left; vertical-align: top; }
.lesson th { background: var(--surface); }
.lesson blockquote { margin: 16px 0; padding: 4px 14px; border-left: 3px solid var(--accent); background: var(--accent-soft); border-radius: 0 8px 8px 0; }
.lesson hr { border: 0; border-top: 1px solid var(--line); margin: 24px 0; }
.lesson hr + h2 { border-top: 0; padding-top: 0; margin-top: 8px; }
.lesson img { max-width: 100%; }
.done-toggle {
  display: flex; align-items: center; gap: 10px; margin: 32px 0 0; padding: 12px 14px;
  border: 1px solid var(--line); border-radius: 10px; background: var(--surface); cursor: pointer;
}
.done-toggle input { width: 20px; height: 20px; accent-color: var(--done); }
.pager { display: flex; justify-content: space-between; gap: 12px; margin-top: 16px; }
.pager-link {
  flex: 1; max-width: 48%; padding: 10px 14px; border: 1px solid var(--line); border-radius: 10px;
  color: var(--text); text-decoration: none; font-size: 14px; transition: background-color .15s, border-color .15s;
}
.pager-link:hover { border-color: var(--accent); background: var(--accent-soft); }
.pager-link span { display: block; font-size: 12px; color: var(--muted); }
.pager-next { text-align: right; }
.footer { margin-top: 32px; font-size: 12px; color: var(--muted); }
</style>
</head>
<body>
<header class="topbar">
  <button id="menu-btn" class="icon-btn" type="button" aria-label="Open lesson list" aria-expanded="false">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
  </button>
  <h1 id="current-title">ARASE Code Course</h1>
  <span id="progress" class="progress"></span>
</header>
<div class="scrim" id="scrim"></div>
<div class="layout">
  <nav class="nav" id="nav" aria-label="Lessons">${menu}</nav>
  <main>
    ${sections}
    <p class="footer">Built ${builtOn} from docs/learning. Works offline. Rebuild with <code>npm run learn:offline</code>.</p>
  </main>
</div>
<script>
(function () {
  var STORE_KEY = 'arase-course-offline';
  var counted = ${JSON.stringify(LESSONS.filter((lesson) => !lesson.reference).map((lesson) => lesson.slug))};
  var titles = ${JSON.stringify(Object.fromEntries(LESSONS.map((lesson) => [lesson.slug, lesson.title])))};
  var first = ${JSON.stringify(LESSONS[0].slug)};

  function load() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}') || {}; } catch (e) { return {}; }
  }
  function save(state) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* storage unavailable */ }
  }
  var state = load();
  state.done = Array.isArray(state.done) ? state.done : [];

  function renderProgress() {
    var count = counted.filter(function (slug) { return state.done.indexOf(slug) !== -1; }).length;
    document.getElementById('progress').textContent = count + ' / ' + counted.length + ' done';
    document.querySelectorAll('[data-nav]').forEach(function (link) {
      link.classList.toggle('done', state.done.indexOf(link.getAttribute('data-nav')) !== -1);
    });
    document.querySelectorAll('[data-done]').forEach(function (box) {
      box.checked = state.done.indexOf(box.getAttribute('data-done')) !== -1;
    });
  }

  function setNav(open) {
    document.body.classList.toggle('nav-open', open);
    document.getElementById('menu-btn').setAttribute('aria-expanded', String(open));
  }

  function show() {
    var slug = decodeURIComponent(location.hash.slice(1));
    if (!titles[slug]) slug = state.last && titles[state.last] ? state.last : first;
    document.querySelectorAll('.lesson').forEach(function (el) { el.hidden = el.id !== slug; });
    document.querySelectorAll('[data-nav]').forEach(function (link) {
      link.classList.toggle('active', link.getAttribute('data-nav') === slug);
    });
    document.getElementById('current-title').textContent = titles[slug];
    document.title = titles[slug] + ' · ARASE Code Course';
    state.last = slug;
    save(state);
    setNav(false);
    window.scrollTo(0, 0);
  }

  document.getElementById('menu-btn').addEventListener('click', function () {
    setNav(!document.body.classList.contains('nav-open'));
  });
  document.getElementById('scrim').addEventListener('click', function () { setNav(false); });
  document.addEventListener('change', function (event) {
    var slug = event.target.getAttribute && event.target.getAttribute('data-done');
    if (!slug) return;
    state.done = state.done.filter(function (s) { return s !== slug; });
    if (event.target.checked) state.done.push(slug);
    save(state);
    renderProgress();
  });
  window.addEventListener('hashchange', show);

  renderProgress();
  show();
})();
</script>
</body>
</html>
`;

writeFileSync(outFile, html, 'utf8');
console.log(`Wrote ${outFile} (${(html.length / 1024).toFixed(0)} KB, ${LESSONS.length} pages)`);
