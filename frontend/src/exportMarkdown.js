import { formatJsonString, parseDocParams } from './utils';
import { toolSlug, downloadTextFile, docExportFilename } from './docExportShared';

/** Markdown 表格单元格转义，避免 | 打断列。 */
function cell(value) {
  return String(value ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\n/g, '<br>')
    .trim();
}

/** 渲染通用请求/响应章节。 */
function renderArgsAndResult(item) {
  const argsStr = JSON.stringify(item.arguments || {}, null, 2);
  const resultRaw = (item.result || '').trim();
  const resultStr = resultRaw ? formatJsonString(resultRaw) : '';
  const lines = [];

  lines.push('### 请求示例');
  lines.push('');
  lines.push('```json');
  lines.push(argsStr);
  lines.push('```');
  lines.push('');

  lines.push('### 响应示例');
  lines.push('');
  if (resultStr) {
    const looksJson = resultStr.trim().startsWith('{') || resultStr.trim().startsWith('[');
    lines.push(looksJson ? '```json' : '```');
    lines.push(resultStr);
    lines.push('```');
  } else {
    lines.push('_无响应内容_');
  }
  lines.push('');
  return lines;
}

/** 将单个工具渲染为 Markdown 章节。 */
function renderToolSection(item) {
  const name = item.name || 'unnamed';
  const params = parseDocParams(item);
  const tags = Array.isArray(item.tags) ? item.tags : [];
  const lines = [];
  lines.push(`## \`${name}\``);
  lines.push('');

  if (item.title) {
    lines.push(`**${item.title}**`);
    lines.push('');
  }
  if (item.description) {
    lines.push(`> ${item.description.replace(/\n/g, '\n> ')}`);
    lines.push('');
  }
  if (tags.length) {
    lines.push(tags.map((t) => `\`${t}\``).join(' · '));
    lines.push('');
  }

  lines.push('### 参数');
  lines.push('');
  if (params.length === 0) {
    lines.push('_无参数_');
    lines.push('');
  } else {
    lines.push('| 参数 | 类型 | 必填 | 说明 |');
    lines.push('| --- | --- | :---: | --- |');
    params.forEach((p) => {
      lines.push(
        `| \`${cell(p.name)}\` | ${cell(p.type)} | ${p.required ? '是' : '否'} | ${cell(p.description) || '—'} |`
      );
    });
    lines.push('');
  }

  lines.push(...renderArgsAndResult(item));
  return lines.join('\n');
}

/** 将单个资源渲染为 Markdown 章节。 */
function renderResourceSection(item) {
  const heading = item.uri || item.name || 'resource';
  const lines = [];
  lines.push(`## \`${heading}\``);
  lines.push('');
  if (item.title) {
    lines.push(`**${item.title}**`);
    lines.push('');
  }
  if (item.description) {
    lines.push(`> ${item.description.replace(/\n/g, '\n> ')}`);
    lines.push('');
  }
  if (item.mimeType) {
    lines.push(`MIME: \`${item.mimeType}\``);
    lines.push('');
  }
  lines.push(...renderArgsAndResult(item));
  return lines.join('\n');
}

/** 将单个提示词渲染为 Markdown 章节。 */
function renderPromptSection(item) {
  const name = item.name || 'unnamed';
  const params = parseDocParams(item);
  const lines = [];
  lines.push(`## \`${name}\``);
  lines.push('');
  if (item.title) {
    lines.push(`**${item.title}**`);
    lines.push('');
  }
  if (item.description) {
    lines.push(`> ${item.description.replace(/\n/g, '\n> ')}`);
    lines.push('');
  }

  lines.push('### 参数');
  lines.push('');
  if (params.length === 0) {
    lines.push('_无参数_');
    lines.push('');
  } else {
    lines.push('| 参数 | 类型 | 必填 | 说明 |');
    lines.push('| --- | --- | :---: | --- |');
    params.forEach((p) => {
      lines.push(
        `| \`${cell(p.name)}\` | ${cell(p.type)} | ${p.required ? '是' : '否'} | ${cell(p.description) || '—'} |`
      );
    });
    lines.push('');
  }

  lines.push(...renderArgsAndResult(item));
  return lines.join('\n');
}

/**
 * 生成 MCP 文档 Markdown（工具 + 资源 + 提示词）。
 */
export function buildDocMarkdown({ serverName, tools, resources, prompts }) {
  const toolList = Array.isArray(tools) ? tools : [];
  const resourceList = Array.isArray(resources) ? resources : [];
  const promptList = Array.isArray(prompts) ? prompts : [];
  const total = toolList.length + resourceList.length + promptList.length;
  const title = serverName ? `MCP 文档 · ${serverName}` : 'MCP 文档';
  const generatedAt = new Date().toLocaleString('zh-CN', { hour12: false });

  const lines = [];
  lines.push(`# ${title}`);
  lines.push('');
  lines.push(
    `> **MCP 参考文档** · 工具 ${toolList.length} · 资源 ${resourceList.length} · 提示词 ${promptList.length} · 导出于 ${generatedAt}`
  );
  lines.push('>');
  lines.push('> 由调试结果自动生成，包含参数定义、请求与响应示例。');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## 目录');
  lines.push('');

  if (total === 0) {
    lines.push('_暂无内容_');
    lines.push('');
    return lines.join('\n');
  }

  if (toolList.length) {
    lines.push('### 工具');
    lines.push('');
    toolList.forEach((item, index) => {
      const name = item.name || 'unnamed';
      const slug = toolSlug(name);
      lines.push(`${index + 1}. [\`${name}\`](#${slug})`);
    });
    lines.push('');
  }
  if (resourceList.length) {
    lines.push('### 资源');
    lines.push('');
    resourceList.forEach((item, index) => {
      const name = item.uri || item.name || 'resource';
      const slug = toolSlug(name);
      lines.push(`${index + 1}. [\`${name}\`](#${slug})`);
    });
    lines.push('');
  }
  if (promptList.length) {
    lines.push('### 提示词');
    lines.push('');
    promptList.forEach((item, index) => {
      const name = item.name || 'unnamed';
      const slug = toolSlug(name);
      lines.push(`${index + 1}. [\`${name}\`](#${slug})`);
    });
    lines.push('');
  }

  lines.push('---');
  lines.push('');

  const sections = [];
  if (toolList.length) {
    sections.push('# 工具\n\n' + toolList.map(renderToolSection).join('\n---\n\n'));
  }
  if (resourceList.length) {
    sections.push('# 资源\n\n' + resourceList.map(renderResourceSection).join('\n---\n\n'));
  }
  if (promptList.length) {
    sections.push('# 提示词\n\n' + promptList.map(renderPromptSection).join('\n---\n\n'));
  }
  lines.push(sections.join('\n\n---\n\n'));
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('_Generated by MCP Doc_');
  lines.push('');
  return lines.join('\n');
}

/** 导出 Markdown 文件。 */
export function exportDocMarkdown(payload) {
  const markdown = buildDocMarkdown(payload);
  downloadTextFile(
    docExportFilename(payload.serverName, 'md'),
    markdown,
    'text/markdown;charset=utf-8'
  );
}
