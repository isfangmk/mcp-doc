import React, { useState, useEffect, useMemo } from 'react';
import { listTools } from '../api';
import { parseParams, defaultValueForParam } from '../utils';
import { ToolBlock } from './ToolBlock';

const DEBOUNCE_MS = 1000;

/** 用上次运行参数覆盖 schema 默认值，仅保留当前仍存在的字段。 */
function buildFormValues(tools, lastRuns) {
  const defaults = {};
  tools.forEach((t) => {
    const params = parseParams(t);
    const currentParamNames = new Set(params.map((p) => p.name));
    const def = {};
    params.forEach((p) => {
      def[p.name] = defaultValueForParam(p);
    });
    const lastArgs = lastRuns[t.name]?.arguments || {};
    const cleaned = {};
    Object.entries(lastArgs).forEach(([k, v]) => {
      if (currentParamNames.has(k)) cleaned[k] = v;
    });
    defaults[t.name] = { ...def, ...cleaned };
  });
  return defaults;
}

/** 将上次运行结果转为 ToolBlock 使用的结果结构。 */
function buildLastResults(lastRuns) {
  const map = {};
  Object.entries(lastRuns).forEach(([name, run]) => {
    map[name] = {
      content: run.result || '',
      isError: !!run.is_error,
    };
  });
  return map;
}

export function ToolsTab({ serverId, serverName }) {
  const [tools, setTools] = useState([]);
  const [savedToolNames, setSavedToolNames] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [currentToolName, setCurrentToolName] = useState(null);
  const [formValuesByTool, setFormValuesByTool] = useState({});
  const [lastResultsByTool, setLastResultsByTool] = useState({});
  const [searchKeyword, setSearchKeyword] = useState('');
  const [filterTag, setFilterTag] = useState('');
  const [searchInputValue, setSearchInputValue] = useState('');

  useEffect(() => {
    if (!serverId) return;
    setLoading(true);
    setError(null);
    setCurrentToolName(null);
    listTools(serverId)
      .then((data) => {
        const toolList = data.tools || [];
        const lastRuns = data.last_runs || {};
        setTools(toolList);
        setSavedToolNames(data.saved_tools || []);
        setSearchKeyword('');
        setFilterTag('');
        setSearchInputValue('');
        setFormValuesByTool(buildFormValues(toolList, lastRuns));
        setLastResultsByTool(buildLastResults(lastRuns));
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [serverId]);

  const filteredTools = useMemo(() => {
    return tools.filter((t) => {
      const matchName =
        !searchKeyword ||
        (t.name && t.name.toLowerCase().includes(searchKeyword.toLowerCase()));
      const matchTag = !filterTag || (t.tags && t.tags.includes(filterTag));
      return matchName && matchTag;
    });
  }, [tools, searchKeyword, filterTag]);

  const allTags = useMemo(() => {
    const tags = [];
    tools.forEach((t) => {
      if (t.tags && t.tags.length) tags.push(...t.tags);
    });
    return [...new Set(tags)].sort();
  }, [tools]);

  useEffect(() => {
    const t = setTimeout(() => setSearchKeyword(searchInputValue.trim()), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [searchInputValue]);

  if (!serverId) {
    return <p className="empty">请先选择左侧服务器。</p>;
  }
  if (loading) {
    return <p className="loading">正在读取工具列表…</p>;
  }
  if (error) {
    return (
      <p className="empty" style={{ color: 'var(--danger)' }}>
        {error}
      </p>
    );
  }
  if (!tools.length) {
    return (
      <>
        <h2 className="doc-title">MCP 工具 · {serverName || ''}</h2>
        <p className="empty">该服务器未暴露任何工具。</p>
      </>
    );
  }

  return (
    <div className="main-content">
      <h2 className="doc-title">MCP 工具 · {serverName || ''}</h2>
      <div className="tool-filters">
        <input
          type="text"
          className="search-input"
          placeholder="按工具名搜索"
          value={searchInputValue}
          onChange={(e) => setSearchInputValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && setSearchKeyword(searchInputValue.trim())}
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
      <div className="tool-list">
        {filteredTools.length === 0 ? (
          <p className="empty">无匹配工具</p>
        ) : (
          filteredTools.map((t, index) => (
            <ToolBlock
              key={t.name}
              tool={t}
              index={index}
              isActive={t.name === currentToolName}
              onToggle={() =>
                setCurrentToolName((prev) => (prev === t.name ? null : t.name))
              }
              serverId={serverId}
              savedToolNames={savedToolNames}
              formValuesByTool={formValuesByTool}
              setFormValuesByTool={setFormValuesByTool}
              lastResultsByTool={lastResultsByTool}
              setLastResultsByTool={setLastResultsByTool}
              setSavedToolNames={setSavedToolNames}
            />
          ))
        )}
      </div>
    </div>
  );
}
