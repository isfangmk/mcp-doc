import {
  normalizeDocPayload,
  escapeHtml,
  downloadTextFile,
  docExportFilename,
} from './docExportShared';

/** 交互 HTML / 打印 PDF 共用的文档样式。 */
const DOC_CSS = `
:root {
  --bg: #0d1117;
  --surface: #161b22;
  --surface-2: #1c2129;
  --border: #30363d;
  --text: #e6edf3;
  --muted: #8b949e;
  --accent: #58a6ff;
  --accent-dim: rgba(88,166,255,.14);
  --success: #3fb950;
  --code-bg: #0b0f14;
  --shadow: 0 12px 40px rgba(0,0,0,.35);
  --radius: 14px;
  --font: "Segoe UI", "PingFang SC", "Noto Sans SC", system-ui, sans-serif;
  --mono: "SF Mono", "JetBrains Mono", ui-monospace, Menlo, monospace;
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  margin: 0;
  font-family: var(--font);
  background:
    radial-gradient(1200px 500px at 10% -10%, rgba(88,166,255,.16), transparent 55%),
    radial-gradient(900px 400px at 90% 0%, rgba(63,185,80,.08), transparent 50%),
    var(--bg);
  color: var(--text);
  line-height: 1.55;
  min-height: 100vh;
}
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
.app {
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
  gap: 0;
  max-width: 1240px;
  margin: 0 auto;
  min-height: 100vh;
}
.sidebar {
  position: sticky;
  top: 0;
  align-self: start;
  height: 100vh;
  padding: 24px 18px;
  border-right: 1px solid var(--border);
  background: rgba(13,17,23,.72);
  backdrop-filter: blur(10px);
  overflow: auto;
}
.brand {
  font-size: 12px;
  letter-spacing: .08em;
  text-transform: uppercase;
  color: var(--muted);
  margin-bottom: 8px;
}
.sidebar h1 {
  margin: 0 0 6px;
  font-size: 1.15rem;
  font-weight: 650;
  letter-spacing: -.02em;
}
.meta { color: var(--muted); font-size: .82rem; margin-bottom: 18px; }
.toc-title {
  font-size: .75rem;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: .06em;
  margin: 18px 0 8px;
}
.toc { list-style: none; padding: 0; margin: 0; display: grid; gap: 4px; }
.toc a {
  display: block;
  padding: 8px 10px;
  border-radius: 8px;
  color: var(--text);
  font-family: var(--mono);
  font-size: .82rem;
  border: 1px solid transparent;
}
.toc a:hover, .toc a.active {
  background: var(--accent-dim);
  border-color: rgba(88,166,255,.25);
  text-decoration: none;
  color: var(--accent);
}
.main { padding: 28px 32px 64px; }
.toolbar {
  position: sticky;
  top: 0;
  z-index: 5;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  padding: 14px 0 16px;
  margin-bottom: 8px;
  background: linear-gradient(180deg, rgba(13,17,23,.95), rgba(13,17,23,.82) 70%, transparent);
  backdrop-filter: blur(8px);
}
.search, .tag-filter {
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text);
  border-radius: 10px;
  padding: 10px 12px;
  font: inherit;
  font-size: .9rem;
}
.search { flex: 1; min-width: 200px; }
.tag-filter { min-width: 140px; }
.search:focus, .tag-filter:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-dim);
}
.hero {
  margin: 8px 0 24px;
  padding: 22px 24px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: linear-gradient(145deg, rgba(88,166,255,.1), rgba(22,27,34,.9));
  box-shadow: var(--shadow);
}
.hero h2 { margin: 0 0 8px; font-size: 1.45rem; letter-spacing: -.02em; }
.hero p { margin: 0; color: var(--muted); }
.stats { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 14px; }
.stat {
  font-size: .78rem;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--surface-2);
  color: var(--muted);
}
.card {
  border: 1px solid var(--border);
  background: var(--surface);
  border-radius: var(--radius);
  margin-bottom: 16px;
  overflow: hidden;
  box-shadow: 0 1px 0 rgba(255,255,255,.02) inset;
}
.card.hidden { display: none; }
.card-head {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  width: 100%;
  padding: 16px 18px;
  background: transparent;
  border: 0;
  color: inherit;
  cursor: pointer;
  text-align: left;
  font: inherit;
}
.card-head:hover { background: rgba(255,255,255,.02); }
.card-index {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  background: var(--accent-dim);
  color: var(--accent);
  font-size: .78rem;
  font-weight: 650;
  flex-shrink: 0;
}
.card-title { margin: 0; font-family: var(--mono); font-size: 1.02rem; }
.card-sub { margin: 4px 0 0; color: var(--muted); font-size: .88rem; }
.chevron {
  margin-left: auto;
  color: var(--muted);
  transition: transform .2s ease;
}
.card.open .chevron { transform: rotate(180deg); }
.tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.tag {
  font-size: .72rem;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--accent-dim);
  color: var(--accent);
  border: 1px solid rgba(88,166,255,.2);
}
.card-body {
  display: none;
  padding: 0 18px 18px;
  border-top: 1px solid var(--border);
}
.card.open .card-body { display: block; }
.section-label {
  margin: 16px 0 8px;
  font-size: .75rem;
  letter-spacing: .05em;
  text-transform: uppercase;
  color: var(--muted);
  font-weight: 650;
}
table {
  width: 100%;
  border-collapse: collapse;
  font-size: .88rem;
  overflow: hidden;
  border-radius: 10px;
  border: 1px solid var(--border);
}
th, td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
  text-align: left;
  vertical-align: top;
}
th { background: var(--surface-2); color: var(--muted); font-weight: 600; }
tr:last-child td { border-bottom: 0; }
code, .mono { font-family: var(--mono); font-size: .84em; }
.block {
  position: relative;
  background: var(--code-bg);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 14px 14px 14px;
}
.block pre {
  margin: 0;
  overflow: auto;
  font-family: var(--mono);
  font-size: .82rem;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}
.copy-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  border-radius: 8px;
  padding: 4px 10px;
  font-size: .75rem;
  cursor: pointer;
}
.copy-btn:hover { border-color: var(--accent); color: var(--accent); }
.empty-filter {
  display: none;
  text-align: center;
  color: var(--muted);
  padding: 40px 16px;
  border: 1px dashed var(--border);
  border-radius: var(--radius);
}
.empty-filter.show { display: block; }
.footer {
  margin-top: 28px;
  color: var(--muted);
  font-size: .8rem;
  text-align: center;
}
@media (max-width: 900px) {
  .app { grid-template-columns: 1fr; }
  .sidebar {
    position: relative;
    height: auto;
    border-right: 0;
    border-bottom: 1px solid var(--border);
  }
  .main { padding: 20px 16px 48px; }
}
@media print {
  :root { --bg: #fff; --surface: #fff; --surface-2: #f6f8fa; --border: #d0d7de; --text: #1f2328; --muted: #656d76; --accent: #0969da; --accent-dim: #ddf4ff; --code-bg: #f6f8fa; --shadow: none; }
  body { background: #fff; }
  .sidebar, .toolbar, .copy-btn, .chevron { display: none !important; }
  .app { display: block; max-width: none; }
  .main { padding: 0; }
  .card, .card-body { display: block !important; break-inside: avoid; box-shadow: none; }
  .card-head { cursor: default; padding-left: 0; }
  .hero { box-shadow: none; }
  a { color: inherit; text-decoration: none; }
}
`.trim();

/** 交互脚本：搜索、标签筛选、折叠、复制、目录高亮。 */
const DOC_JS = `
(() => {
  const q = document.getElementById('search');
  const tagSel = document.getElementById('tag-filter');
  const cards = [...document.querySelectorAll('.card')];
  const empty = document.getElementById('empty-filter');
  const tocLinks = [...document.querySelectorAll('.toc a')];

  function applyFilter() {
    const keyword = (q.value || '').trim().toLowerCase();
    const tag = tagSel.value || '';
    let visible = 0;
    cards.forEach((card) => {
      const name = card.dataset.name || '';
      const tags = (card.dataset.tags || '').split('|').filter(Boolean);
      const okName = !keyword || name.includes(keyword);
      const okTag = !tag || tags.includes(tag);
      const show = okName && okTag;
      card.classList.toggle('hidden', !show);
      if (show) visible += 1;
    });
    empty.classList.toggle('show', visible === 0);
  }

  q.addEventListener('input', applyFilter);
  tagSel.addEventListener('change', applyFilter);

  document.querySelectorAll('.card-head').forEach((btn) => {
    btn.addEventListener('click', () => {
      btn.closest('.card').classList.toggle('open');
    });
  });

  document.querySelectorAll('[data-copy]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-copy');
      const el = document.getElementById(id);
      if (!el) return;
      await navigator.clipboard.writeText(el.textContent || '');
      const old = btn.textContent;
      btn.textContent = '已复制';
      setTimeout(() => { btn.textContent = old; }, 1200);
    });
  });

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const id = entry.target.id;
      tocLinks.forEach((a) => a.classList.toggle('active', a.getAttribute('href') === '#' + id));
    });
  }, { rootMargin: '-20% 0px -70% 0px', threshold: 0 });
  cards.forEach((card) => observer.observe(card));
})();
`.trim();

/** 渲染单个文档卡片 HTML。 */
function renderCard(item, index, { openByDefault }) {
  const kindLabel =
    item.kind === 'resource' ? '资源' : item.kind === 'prompt' ? '提示词' : '工具';
  const tags = item.tags.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join('');
  const mimeTag = item.mimeType
    ? `<span class="tag">${escapeHtml(item.mimeType)}</span>`
    : '';
  const paramsRows =
    item.params.length === 0
      ? `<tr><td colspan="4" style="color:var(--muted)">无参数</td></tr>`
      : item.params
          .map(
            (p) => `<tr>
              <td><code>${escapeHtml(p.name)}</code></td>
              <td>${escapeHtml(p.type)}</td>
              <td>${p.required ? '是' : '否'}</td>
              <td>${escapeHtml(p.description || '—')}</td>
            </tr>`
          )
          .join('');

  const argsId = `args-${item.slug}-${index}`;
  const resultId = `result-${item.slug}-${index}`;
  const resultBlock = item.resultJson
    ? `<div class="block">
        <button type="button" class="copy-btn" data-copy="${resultId}">复制</button>
        <pre id="${resultId}">${escapeHtml(item.resultJson)}</pre>
      </div>`
    : `<p style="color:var(--muted);margin:0">无响应内容</p>`;

  return `
<article class="card${openByDefault ? ' open' : ''}" id="${escapeHtml(item.slug)}" data-name="${escapeHtml(
    item.name.toLowerCase()
  )}" data-tags="${escapeHtml(item.tags.join('|'))}">
  <button type="button" class="card-head" aria-expanded="${openByDefault ? 'true' : 'false'}">
    <span class="card-index">${index + 1}</span>
    <span>
      <h3 class="card-title">${escapeHtml(item.name)} <span class="tag">${kindLabel}</span></h3>
      ${item.title ? `<p class="card-sub">${escapeHtml(item.title)}</p>` : ''}
      ${item.description ? `<p class="card-sub">${escapeHtml(item.description)}</p>` : ''}
      ${tags || mimeTag ? `<div class="tags">${mimeTag}${tags}</div>` : ''}
    </span>
    <span class="chevron" aria-hidden="true">▾</span>
  </button>
  <div class="card-body">
    <div class="section-label">参数</div>
    <table>
      <thead><tr><th>参数</th><th>类型</th><th>必填</th><th>说明</th></tr></thead>
      <tbody>${paramsRows}</tbody>
    </table>
    <div class="section-label">请求示例</div>
    <div class="block">
      <button type="button" class="copy-btn" data-copy="${argsId}">复制</button>
      <pre id="${argsId}">${escapeHtml(item.argsJson)}</pre>
    </div>
    <div class="section-label">响应示例</div>
    ${resultBlock}
  </div>
</article>`;
}

/**
 * 生成可交互的自包含 HTML 文档。
 * interactive=true 时默认折叠卡片。
 */
export function buildDocHtml({
  serverName,
  tools,
  resources,
  prompts,
  interactive = true,
}) {
  const list = normalizeDocPayload({ tools, resources, prompts });
  const title = serverName ? `MCP 文档 · ${serverName}` : 'MCP 文档';
  const generatedAt = new Date().toLocaleString('zh-CN', { hour12: false });
  const allTags = [...new Set(list.flatMap((i) => i.tags))].sort();
  const openByDefault = !interactive;
  const toolCount = (tools || []).length;
  const resourceCount = (resources || []).length;
  const promptCount = (prompts || []).length;

  const toc = list
    .map((item) => `<li><a href="#${escapeHtml(item.slug)}"><code>${escapeHtml(item.name)}</code></a></li>`)
    .join('');

  const tagOptions = allTags
    .map((t) => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`)
    .join('');

  const cards = list.map((item, index) => renderCard(item, index, { openByDefault })).join('\n');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>${DOC_CSS}</style>
</head>
<body>
  <div class="app">
    <aside class="sidebar">
      <div class="brand">MCP Doc</div>
      <h1>${escapeHtml(serverName || 'MCP 文档')}</h1>
      <div class="meta">工具 ${toolCount} · 资源 ${resourceCount} · 提示词 ${promptCount} · ${escapeHtml(generatedAt)}</div>
      <div class="toc-title">目录</div>
      <ul class="toc">${toc || '<li style="color:var(--muted)">暂无内容</li>'}</ul>
    </aside>
    <main class="main">
      <div class="toolbar">
        <input id="search" class="search" type="search" placeholder="搜索名称…" />
        <select id="tag-filter" class="tag-filter">
          <option value="">全部标签</option>
          ${tagOptions}
        </select>
      </div>
      <section class="hero">
        <h2>${escapeHtml(title)}</h2>
        <p>由调试结果生成的参考文档。支持搜索、标签筛选、折叠展开与一键复制示例。</p>
        <div class="stats">
          <span class="stat">${toolCount} tools</span>
          <span class="stat">${resourceCount} resources</span>
          <span class="stat">${promptCount} prompts</span>
        </div>
      </section>
      <div id="empty-filter" class="empty-filter">没有匹配的条目</div>
      ${cards}
      <div class="footer">Generated by MCP Doc</div>
    </main>
  </div>
  <script>${DOC_JS}</script>
</body>
</html>`;
}

/** 导出可交互 HTML。 */
export function exportDocHtml(payload) {
  const html = buildDocHtml({ ...payload, interactive: true });
  downloadTextFile(
    docExportFilename(payload.serverName, 'html'),
    html,
    'text/html;charset=utf-8'
  );
}
