import React, { useState, useEffect, useMemo, useRef } from 'react';
import { getDoc } from '../api';
import { DocItem } from './DocItem';
import { useToast } from '../ToastContext';
import { exportDocMarkdown } from '../exportMarkdown';
import { exportDocHtml } from '../exportHtml';

const DEBOUNCE_MS = 1000;

const EXPORT_OPTIONS = [
  { id: 'md', label: 'Markdown', hint: '目录、参数表与请求/响应示例' },
  { id: 'html', label: '交互 HTML', hint: '离线打开，支持搜索、筛选与复制' },
  { id: 'pdf', label: 'PDF', hint: '浅色排版，直接下载多页 PDF' },
];

/** 按关键字与标签过滤文档条目。 */
function filterSection(list, searchKeyword, filterTag, nameKey = 'name') {
  return (list || []).filter((item) => {
    const name = item[nameKey] || item.name || item.uri || '';
    const matchName =
      !searchKeyword || name.toLowerCase().includes(searchKeyword.toLowerCase());
    const matchTag = !filterTag || (item.tags && item.tags.includes(filterTag));
    return matchName && matchTag;
  });
}

/** 文档页：切到该 Tab 或更换服务器时重新拉取已保存结果。 */
export function DocTab({ serverId, active }) {
  const showMessage = useToast();
  const exportRef = useRef(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [filterTag, setFilterTag] = useState('');
  const [searchInputValue, setSearchInputValue] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);

  useEffect(() => {
    if (!serverId) {
      setData(null);
      setError(null);
      return;
    }
    if (!active) return;

    let cancelled = false;
    setLoading(true);
    setError(null);
    getDoc(serverId)
      .then((res) => {
        if (cancelled) return;
        setData(res);
        setSearchKeyword('');
        setFilterTag('');
        setSearchInputValue('');
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [serverId, active]);

  useEffect(() => {
    const t = setTimeout(() => setSearchKeyword(searchInputValue.trim()), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [searchInputValue]);

  useEffect(() => {
    if (!active) setExportOpen(false);
  }, [active]);

  useEffect(() => {
    if (!exportOpen) return;
    const onPointerDown = (e) => {
      if (!exportRef.current?.contains(e.target)) setExportOpen(false);
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setExportOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [exportOpen]);

  const tools = data?.tools || [];
  const resources = data?.resources || [];
  const prompts = data?.prompts || [];

  const filteredTools = useMemo(
    () => filterSection(tools, searchKeyword, filterTag),
    [tools, searchKeyword, filterTag]
  );
  const filteredResources = useMemo(
    () => filterSection(resources, searchKeyword, filterTag, 'uri'),
    [resources, searchKeyword, filterTag]
  );
  const filteredPrompts = useMemo(
    () => filterSection(prompts, searchKeyword, filterTag),
    [prompts, searchKeyword, filterTag]
  );

  const allTags = useMemo(() => {
    const tags = [];
    tools.forEach((item) => {
      if (item.tags?.length) tags.push(...item.tags);
    });
    return [...new Set(tags)].sort();
  }, [tools]);

  const totalCount =
    filteredTools.length + filteredResources.length + filteredPrompts.length;
  const hasAnyDoc = tools.length + resources.length + prompts.length > 0;

  const handleExport = async (format) => {
    if (!totalCount) {
      showMessage('没有可导出的文档', 'info');
      return;
    }
    const payload = {
      serverName: data?.server_name || '',
      tools: filteredTools,
      resources: filteredResources,
      prompts: filteredPrompts,
    };
    setExportOpen(false);
    setExporting(true);
    try {
      if (format === 'md') {
        exportDocMarkdown(payload);
        showMessage('已导出 Markdown', 'success');
      } else if (format === 'html') {
        exportDocHtml(payload);
        showMessage('已导出交互 HTML', 'success');
      } else if (format === 'pdf') {
        const { exportDocPdf } = await import('../exportPdf');
        await exportDocPdf(payload);
        showMessage('已导出 PDF', 'success');
      }
    } catch (err) {
      showMessage(err.message || '导出失败', 'error');
    } finally {
      setExporting(false);
    }
  };

  if (!serverId) {
    return (
      <div className="doc-content">
        <p className="empty">请先选择左侧服务器，再点击「文档」从已保存结果生成 MCP 文档。</p>
      </div>
    );
  }
  if (loading) {
    return (
      <div className="doc-content">
        <p className="loading">正在生成文档…</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="doc-content">
        <p className="empty" style={{ color: 'var(--danger)' }}>
          {error}
        </p>
      </div>
    );
  }
  if (!hasAnyDoc) {
    return (
      <div className="doc-content">
        <p className="empty">暂无已保存内容，请先在工具 / 资源 / 提示词中运行并保存结果。</p>
      </div>
    );
  }

  return (
    <div className="doc-content">
      <div className="doc-title-row">
        <h2 className="doc-title">MCP 文档 · {data.server_name || ''}</h2>
        <div className={`doc-export-menu${exportOpen ? ' open' : ''}`} ref={exportRef}>
          <button
            type="button"
            className="primary doc-export-trigger"
            onClick={() => setExportOpen((v) => !v)}
            disabled={!totalCount || exporting}
            aria-haspopup="menu"
            aria-expanded={exportOpen}
          >
            {exporting ? '导出中…' : '导出'}
            <span className="doc-export-caret" aria-hidden="true">
              ▾
            </span>
          </button>
          {exportOpen && (
            <div className="doc-export-dropdown" role="menu">
              {EXPORT_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className="doc-export-option"
                  role="menuitem"
                  onClick={() => handleExport(opt.id)}
                >
                  <span className="doc-export-option-label">{opt.label}</span>
                  <span className="doc-export-option-hint">{opt.hint}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="tool-filters">
        <input
          type="text"
          className="search-input"
          placeholder="按名称搜索"
          value={searchInputValue}
          onChange={(e) => setSearchInputValue(e.target.value)}
          onKeyDown={(e) =>
            e.key === 'Enter' && setSearchKeyword(searchInputValue.trim())
          }
        />
        <select
          className="tag-select"
          value={filterTag}
          onChange={(e) => setFilterTag(e.target.value)}
        >
          <option value="">标签</option>
          {allTags.map((tag) => (
            <option key={tag} value={tag}>
              {tag}
            </option>
          ))}
        </select>
      </div>
      <div className="doc-list">
        {totalCount === 0 ? (
          <p className="empty">无匹配文档</p>
        ) : (
          <>
            {filteredTools.length > 0 && (
              <section className="doc-section">
                <h3 className="doc-section-title">工具</h3>
                {filteredTools.map((item) => (
                  <DocItem key={`tool:${item.name}`} item={item} kind="tool" />
                ))}
              </section>
            )}
            {filteredResources.length > 0 && (
              <section className="doc-section">
                <h3 className="doc-section-title">资源</h3>
                {filteredResources.map((item) => (
                  <DocItem
                    key={`resource:${item.uri || item.name}`}
                    item={item}
                    kind="resource"
                  />
                ))}
              </section>
            )}
            {filteredPrompts.length > 0 && (
              <section className="doc-section">
                <h3 className="doc-section-title">提示词</h3>
                {filteredPrompts.map((item) => (
                  <DocItem key={`prompt:${item.name}`} item={item} kind="prompt" />
                ))}
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
