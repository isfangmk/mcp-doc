import React from 'react';
import { formatJsonString, parseDocParams } from '../utils';
import { ToolTag } from './ToolTag';

const ANNO_LABELS = [
  ['readOnlyHint', '只读', 'anno-readonly'],
  ['destructiveHint', '破坏性', 'anno-destructive'],
  ['idempotentHint', '幂等', 'anno-idempotent'],
  ['openWorldHint', '开放世界', 'anno-openworld'],
];

/** 文档页条目：工具 / 资源 / 提示词。 */
export function DocItem({ item, kind = 'tool' }) {
  const params = kind === 'resource' ? [] : parseDocParams(item);
  const argsStr = JSON.stringify(item.arguments || {}, null, 2);
  const resultStr = (item.result || '').trim() ? formatJsonString(item.result) : '(无)';
  const ann = item.annotations || {};
  const heading =
    kind === 'resource' ? item.uri || item.name || '' : item.name || '';

  return (
    <div className="doc-item">
      <h3>{heading}</h3>
      {item.title && <div className="doc-item-title">{item.title}</div>}
      <div className="doc-item-desc">{item.description || '-'}</div>
      {kind === 'resource' && item.mimeType && (
        <div className="doc-item-tags">
          <span className="tool-tag">{item.mimeType}</span>
        </div>
      )}
      {(item.tags?.length > 0 || (kind === 'tool' && ANNO_LABELS.some(([k]) => ann[k]))) && (
        <div className="doc-item-tags">
          {kind === 'tool' &&
            ANNO_LABELS.filter(([k]) => ann[k]).map(([k, label, cls]) => (
              <span key={k} className={`anno-badge ${cls}`}>
                {label}
              </span>
            ))}
          {item.tags?.map((tag) => (
            <ToolTag key={tag} tag={tag} />
          ))}
        </div>
      )}
      <div className="doc-item-section">
        <div className="doc-item-section-title">
          {kind === 'resource' ? 'URI / 参数' : '请求参数'}
        </div>
        {kind === 'resource' && item.uri && (
          <pre style={{ marginBottom: 12 }}>{item.uri}</pre>
        )}
        {params.length > 0 && (
          <table className="doc-params-table">
            <thead>
              <tr>
                <th>参数名</th>
                <th>类型</th>
                <th>必填</th>
                <th>说明</th>
              </tr>
            </thead>
            <tbody>
              {params.map((p) => (
                <tr key={p.name}>
                  <td>
                    <code>{p.name}</code>
                  </td>
                  <td>{p.type}</td>
                  <td>{p.required ? '是' : '否'}</td>
                  <td>{p.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="doc-item-section-title">请求示例</div>
        <pre>{argsStr}</pre>
      </div>
      <div className="doc-item-section">
        <div className="doc-item-section-title">响应结果</div>
        <div className="doc-result">{resultStr}</div>
      </div>
    </div>
  );
}
