import React, { useState, useEffect } from 'react';
import {
  listResources,
  readResource,
  saveResourceResult,
  clearResourceSavedData,
} from '../api';
import { formatJsonString } from '../utils';
import { useToast } from '../ToastContext';

/** 单个资源 / 模板调试块。 */
function ResourceBlock({
  item,
  kind,
  index,
  isActive,
  onToggle,
  serverId,
  savedUris,
  setSavedUris,
  uriValue,
  setUriValue,
  lastResults,
  setLastResults,
}) {
  const showMessage = useToast();
  const key = kind === 'template' ? `tpl:${item.uriTemplate}` : `res:${item.uri}`;
  const displayName = item.name || item.uri || item.uriTemplate || 'resource';
  const hasSaved = savedUris.includes(uriValue) && !!uriValue;
  const last = lastResults[key];
  const [loading, setLoading] = useState(false);
  const [saveDisabled, setSaveDisabled] = useState(!last || !!last.error);

  useEffect(() => {
    setSaveDisabled(!last || !!last.error);
  }, [last]);

  const handleRead = async () => {
    const uri = (uriValue || '').trim();
    if (!uri) {
      showMessage(kind === 'template' ? '请先填写完整 URI' : 'URI 为空', 'info');
      return;
    }
    setLoading(true);
    try {
      const res = await readResource(serverId, uri);
      const text = res.text
        ? formatJsonString(res.text)
        : JSON.stringify(res.contents || [], null, 2);
      setLastResults((prev) => ({
        ...prev,
        [key]: { uri, text, mimeType: res.mimeType || '', contents: res.contents, error: false },
      }));
      setSaveDisabled(false);
    } catch (err) {
      setLastResults((prev) => ({
        ...prev,
        [key]: { uri, text: err.message, mimeType: '', error: true },
      }));
      setSaveDisabled(true);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!last || last.error) return;
    try {
      const res = await saveResourceResult(serverId, {
        uri: last.uri,
        result: last.text,
        arguments: kind === 'template' ? { uri: last.uri } : {},
        mime_type: last.mimeType || undefined,
      });
      if (!savedUris.includes(last.uri)) {
        setSavedUris((prev) => [...prev, last.uri]);
      }
      showMessage(res.message || '已保存', 'success');
    } catch (err) {
      showMessage(err.message, 'error');
    }
  };

  const handleClear = async () => {
    const uri = (uriValue || last?.uri || '').trim();
    if (!uri) {
      showMessage('没有可清除的 URI', 'info');
      return;
    }
    if (!window.confirm('确定清除该资源已保存的数据？')) return;
    try {
      const res = await clearResourceSavedData(serverId, uri);
      setSavedUris((prev) => prev.filter((u) => u !== uri));
      setLastResults((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      setSaveDisabled(true);
      showMessage(res.message || '已清除', 'success');
    } catch (err) {
      showMessage(err.message, 'error');
    }
  };

  return (
    <div className={`tool-block ${isActive ? 'expanded' : ''}`}>
      <div
        className={`tool-list-item ${isActive ? 'active' : ''}`}
        onClick={onToggle}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && onToggle()}
      >
        <span className="tool-num">{index + 1}.</span>
        <div className="tool-head">
          <div className="name-row">
            <span className="name">
              {displayName}
              {kind === 'template' && <span className="kind-badge">模板</span>}
              {hasSaved && <span className="saved-badge">已保存</span>}
            </span>
            {item.title && <span className="tool-title">{item.title}</span>}
          </div>
          <span className="desc">{item.description || item.uri || item.uriTemplate || '-'}</span>
          {item.mimeType && (
            <div className="tool-tags">
              <span className="tool-tag">{item.mimeType}</span>
            </div>
          )}
        </div>
      </div>
      <div className={`tool-detail ${isActive ? 'visible' : ''}`}>
        <div className="form-group">
          <label className="param-label">URI{kind === 'template' ? '（需填完整）' : ''}</label>
          <input
            type="text"
            className="param-input"
            value={uriValue}
            onChange={(e) => setUriValue(e.target.value)}
            placeholder={kind === 'template' ? item.uriTemplate : item.uri}
          />
        </div>
        <div className="row tool-actions-row">
          <button type="button" className="primary" onClick={handleRead} disabled={loading}>
            {loading ? '读取中…' : '读取'}
          </button>
          <button type="button" className="secondary" onClick={handleSave} disabled={saveDisabled}>
            保存结果
          </button>
          <button type="button" className="secondary btn-clear-tool" onClick={handleClear}>
            清除
          </button>
        </div>
        {last && (
          <div className={`result-panel ${last.error ? 'error' : ''}`}>
            <div className="result-toolbar">
              <span className="result-label">
                {last.mimeType ? `内容 · ${last.mimeType}` : '内容'}
              </span>
            </div>
            <pre className="result-box result-area">{last.text}</pre>
          </div>
        )}
      </div>
    </div>
  );
}

export function ResourcesTab({ serverId, serverName }) {
  const [resources, setResources] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [savedUris, setSavedUris] = useState([]);
  const [uriByKey, setUriByKey] = useState({});
  const [lastResults, setLastResults] = useState({});
  const [activeKey, setActiveKey] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!serverId) return;
    setLoading(true);
    setError(null);
    setActiveKey(null);
    listResources(serverId)
      .then((data) => {
        const resList = data.resources || [];
        const tplList = data.templates || [];
        setResources(resList);
        setTemplates(tplList);
        setSavedUris(data.saved_uris || []);
        const uris = {};
        resList.forEach((r) => {
          uris[`res:${r.uri}`] = r.uri;
        });
        tplList.forEach((t) => {
          const saved = data.saved_arguments?.[t.uriTemplate];
          uris[`tpl:${t.uriTemplate}`] = saved?.uri || '';
        });
        setUriByKey(uris);
        setLastResults({});
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [serverId]);

  if (!serverId) return <p className="empty">请先选择左侧服务器。</p>;
  if (loading) return <p className="loading">正在读取资源列表…</p>;
  if (error) {
    return (
      <p className="empty" style={{ color: 'var(--danger)' }}>
        {error}
      </p>
    );
  }
  if (!resources.length && !templates.length) {
    return (
      <>
        <h2 className="doc-title">MCP 资源 · {serverName || ''}</h2>
        <p className="empty">该服务器未暴露任何资源。</p>
      </>
    );
  }

  let index = 0;
  return (
    <div className="main-content">
      <h2 className="doc-title">MCP 资源 · {serverName || ''}</h2>
      <div className="tool-list">
        {resources.map((r) => {
          const key = `res:${r.uri}`;
          const i = index++;
          return (
            <ResourceBlock
              key={key}
              item={r}
              kind="resource"
              index={i}
              isActive={activeKey === key}
              onToggle={() => setActiveKey((prev) => (prev === key ? null : key))}
              serverId={serverId}
              savedUris={savedUris}
              setSavedUris={setSavedUris}
              uriValue={uriByKey[key] || ''}
              setUriValue={(v) => setUriByKey((prev) => ({ ...prev, [key]: v }))}
              lastResults={lastResults}
              setLastResults={setLastResults}
            />
          );
        })}
        {templates.map((t) => {
          const key = `tpl:${t.uriTemplate}`;
          const i = index++;
          return (
            <ResourceBlock
              key={key}
              item={t}
              kind="template"
              index={i}
              isActive={activeKey === key}
              onToggle={() => setActiveKey((prev) => (prev === key ? null : key))}
              serverId={serverId}
              savedUris={savedUris}
              setSavedUris={setSavedUris}
              uriValue={uriByKey[key] || ''}
              setUriValue={(v) => setUriByKey((prev) => ({ ...prev, [key]: v }))}
              lastResults={lastResults}
              setLastResults={setLastResults}
            />
          );
        })}
      </div>
    </div>
  );
}
