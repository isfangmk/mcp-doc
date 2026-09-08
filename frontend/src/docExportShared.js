import { formatJsonString, parseDocParams } from './utils';

/** 生成目录 / HTML id 用的 slug。 */
export function toolSlug(name) {
  return String(name || 'tool')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w\u4e00-\u9fff-]/g, '');
}

/** 规范化单类文档条目。 */
function normalizeSection(items, kind) {
  return (items || []).map((item) => {
    const resultRaw = (item.result || '').trim();
    const name =
      kind === 'resource'
        ? item.uri || item.name || 'resource'
        : item.name || 'unnamed';
    return {
      kind,
      name,
      title: item.title || '',
      description: item.description || '',
      mimeType: item.mimeType || '',
      tags: Array.isArray(item.tags) ? item.tags : [],
      params: kind === 'resource' ? [] : parseDocParams(item),
      argsJson: JSON.stringify(item.arguments || {}, null, 2),
      resultJson: resultRaw ? formatJsonString(resultRaw) : '',
      slug: toolSlug(`${kind}-${name}`),
    };
  });
}

/** 将工具 / 资源 / 提示词统一为导出条目列表。 */
export function normalizeDocPayload({ tools, resources, prompts }) {
  return [
    ...normalizeSection(tools, 'tool'),
    ...normalizeSection(resources, 'resource'),
    ...normalizeSection(prompts, 'prompt'),
  ];
}

/** 触发浏览器下载。 */
export function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** 下载纯文本文件。 */
export function downloadTextFile(filename, content, mime = 'text/plain;charset=utf-8') {
  downloadBlob(filename, new Blob([content], { type: mime }));
}

/** 由服务器名生成导出文件名。 */
export function docExportFilename(serverName, ext = 'md') {
  const base = String(serverName || 'mcp-doc')
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .slice(0, 80);
  return `${base || 'mcp-doc'}.${ext}`;
}

/** HTML 文本转义。 */
export function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
