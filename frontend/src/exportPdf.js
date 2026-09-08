import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import {
  normalizeDocPayload,
  escapeHtml,
  docExportFilename,
} from './docExportShared';

/** PDF 导出专用浅色版式，便于阅读与分页截图。 */
const PDF_CSS = `
  * { box-sizing: border-box; }
  .pdf-root {
    width: 794px;
    padding: 36px 40px 48px;
    background: #ffffff;
    color: #1f2328;
    font-family: "Segoe UI", "PingFang SC", "Noto Sans SC", system-ui, sans-serif;
    line-height: 1.55;
  }
  .pdf-header {
    padding-bottom: 18px;
    margin-bottom: 22px;
    border-bottom: 2px solid #0969da;
  }
  .pdf-kicker {
    margin: 0 0 6px;
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #656d76;
  }
  .pdf-title {
    margin: 0 0 8px;
    font-size: 26px;
    letter-spacing: -0.02em;
    color: #1f2328;
  }
  .pdf-meta {
    margin: 0;
    font-size: 12px;
    color: #656d76;
  }
  .pdf-toc {
    margin: 0 0 28px;
    padding: 16px 18px;
    background: #f6f8fa;
    border: 1px solid #d0d7de;
    border-radius: 10px;
  }
  .pdf-toc h2 {
    margin: 0 0 10px;
    font-size: 13px;
    color: #656d76;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .pdf-toc ol {
    margin: 0;
    padding-left: 18px;
  }
  .pdf-toc li {
    margin: 4px 0;
    font-size: 13px;
  }
  .pdf-toc code {
    font-family: "SF Mono", ui-monospace, Menlo, monospace;
    font-size: 12px;
  }
  .pdf-card {
    margin: 0 0 18px;
    padding: 16px 18px 18px;
    border: 1px solid #d0d7de;
    border-radius: 12px;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .pdf-card h3 {
    margin: 0 0 4px;
    font-family: "SF Mono", ui-monospace, Menlo, monospace;
    font-size: 16px;
  }
  .pdf-card .sub {
    margin: 0 0 6px;
    color: #656d76;
    font-size: 13px;
  }
  .pdf-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: 8px 0 12px;
  }
  .pdf-tag {
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 999px;
    background: #ddf4ff;
    color: #0969da;
    border: 1px solid #b6e3ff;
  }
  .pdf-label {
    margin: 14px 0 6px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: #656d76;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
    border: 1px solid #d0d7de;
    border-radius: 8px;
    overflow: hidden;
  }
  th, td {
    padding: 8px 10px;
    border-bottom: 1px solid #d0d7de;
    text-align: left;
    vertical-align: top;
  }
  th {
    background: #f6f8fa;
    color: #656d76;
    font-weight: 600;
  }
  tr:last-child td { border-bottom: 0; }
  code {
    font-family: "SF Mono", ui-monospace, Menlo, monospace;
    font-size: 11.5px;
  }
  pre {
    margin: 0;
    padding: 12px;
    background: #f6f8fa;
    border: 1px solid #d0d7de;
    border-radius: 8px;
    font-family: "SF Mono", ui-monospace, Menlo, monospace;
    font-size: 11px;
    white-space: pre-wrap;
    word-break: break-word;
  }
  .pdf-footer {
    margin-top: 28px;
    padding-top: 12px;
    border-top: 1px solid #d0d7de;
    text-align: center;
    color: #656d76;
    font-size: 11px;
  }
`.trim();

/** 生成挂载到页面外的 PDF 内容节点。 */
function buildPdfMountNode({ serverName, tools, resources, prompts }) {
  const list = normalizeDocPayload({ tools, resources, prompts });
  const title = serverName ? `MCP 文档 · ${serverName}` : 'MCP 文档';
  const generatedAt = new Date().toLocaleString('zh-CN', { hour12: false });
  const toolCount = (tools || []).length;
  const resourceCount = (resources || []).length;
  const promptCount = (prompts || []).length;

  // 目录用 <ol> 自动编号，条目内不再手写序号，避免出现「1. 1.」
  const toc = list
    .map((item) => {
      const kind =
        item.kind === 'resource' ? '资源' : item.kind === 'prompt' ? '提示词' : '工具';
      return `<li>[${kind}] <code>${escapeHtml(item.name)}</code></li>`;
    })
    .join('');

  const cards = list
    .map((item) => {
      const tags = item.tags.map((t) => `<span class="pdf-tag">${escapeHtml(t)}</span>`).join('');
      const mime = item.mimeType
        ? `<span class="pdf-tag">${escapeHtml(item.mimeType)}</span>`
        : '';
      const rows =
        item.params.length === 0
          ? `<tr><td colspan="4" style="color:#656d76">无参数</td></tr>`
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
      return `
        <section class="pdf-card">
          <h3>${escapeHtml(item.name)}</h3>
          ${item.title ? `<p class="sub">${escapeHtml(item.title)}</p>` : ''}
          ${item.description ? `<p class="sub">${escapeHtml(item.description)}</p>` : ''}
          ${tags || mime ? `<div class="pdf-tags">${mime}${tags}</div>` : ''}
          <div class="pdf-label">参数</div>
          <table>
            <thead><tr><th>参数</th><th>类型</th><th>必填</th><th>说明</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
          <div class="pdf-label">请求示例</div>
          <pre>${escapeHtml(item.argsJson)}</pre>
          <div class="pdf-label">响应示例</div>
          <pre>${escapeHtml(item.resultJson || '无响应内容')}</pre>
        </section>`;
    })
    .join('');

  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-10000px;top:0;pointer-events:none;opacity:0;';
  host.innerHTML = `
    <style>${PDF_CSS}</style>
    <div class="pdf-root">
      <header class="pdf-header">
        <p class="pdf-kicker">MCP Doc</p>
        <h1 class="pdf-title">${escapeHtml(title)}</h1>
        <p class="pdf-meta">工具 ${toolCount} · 资源 ${resourceCount} · 提示词 ${promptCount} · 导出于 ${escapeHtml(generatedAt)}</p>
      </header>
      <nav class="pdf-toc">
        <h2>目录</h2>
        <ol>${toc}</ol>
      </nav>
      ${cards}
      <div class="pdf-footer">Generated by MCP Doc</div>
    </div>
  `;
  return host;
}

/**
 * 将离屏 DOM 截为多页 PDF 并触发下载。
 * 使用 A4 宽度等比切分画布，避免内容被压扁。
 */
async function renderElementToPdf(element, filename) {
  const canvas = await html2canvas(element, {
    scale: 2,
    backgroundColor: '#ffffff',
    useCORS: true,
    logging: false,
  });

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 8;
  const usableWidth = pageWidth - margin * 2;
  const usableHeight = pageHeight - margin * 2;

  const imgWidth = usableWidth;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;
  const pageCanvasHeight = (usableHeight * canvas.width) / imgWidth;

  let renderedHeight = 0;
  let pageIndex = 0;

  while (renderedHeight < canvas.height) {
    const sliceHeight = Math.min(pageCanvasHeight, canvas.height - renderedHeight);
    const pageCanvas = document.createElement('canvas');
    pageCanvas.width = canvas.width;
    pageCanvas.height = sliceHeight;
    const ctx = pageCanvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
    ctx.drawImage(
      canvas,
      0,
      renderedHeight,
      canvas.width,
      sliceHeight,
      0,
      0,
      canvas.width,
      sliceHeight
    );

    const pageData = pageCanvas.toDataURL('image/jpeg', 0.92);
    const sliceImgHeight = (sliceHeight * imgWidth) / canvas.width;
    if (pageIndex > 0) pdf.addPage();
    pdf.addImage(pageData, 'JPEG', margin, margin, imgWidth, sliceImgHeight);

    renderedHeight += sliceHeight;
    pageIndex += 1;
  }

  pdf.save(filename);
}

/** 导出 PDF 文件到本地下载。 */
export async function exportDocPdf(payload) {
  const host = buildPdfMountNode(payload);
  document.body.appendChild(host);
  try {
    const root = host.querySelector('.pdf-root');
    await renderElementToPdf(root, docExportFilename(payload.serverName, 'pdf'));
  } finally {
    host.remove();
  }
}
