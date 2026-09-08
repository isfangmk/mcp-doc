import React, { useState, useEffect } from 'react';
import {
  listPrompts,
  getPrompt,
  savePromptResult,
  clearPromptSavedData,
} from '../api';
import { formatJsonString } from '../utils';
import { useToast } from '../ToastContext';

/** 单个提示词调试块：参数表单与获取 / 保存 / 清除。 */
function PromptBlock({
  prompt,
  index,
  isActive,
  onToggle,
  serverId,
  savedPrompts,
  setSavedPrompts,
  formValues,
  setFormValues,
  lastResults,
  setLastResults,
}) {
  const showMessage = useToast();
  const argsSchema = prompt.arguments || [];
  const hasSaved = savedPrompts.includes(prompt.name);
  const last = lastResults[prompt.name];
  const [loading, setLoading] = useState(false);
  const [saveDisabled, setSaveDisabled] = useState(!last || !!last.error);

  useEffect(() => {
    setSaveDisabled(!last || !!last.error);
  }, [last]);

  const handleArgChange = (name, value) => {
    setFormValues((prev) => ({
      ...prev,
      [prompt.name]: { ...(prev[prompt.name] || {}), [name]: value },
    }));
  };

  const handleGet = async () => {
    setLoading(true);
    const started = performance.now();
    try {
      const args = formValues[prompt.name] || {};
      // Prompt 参数约定为 string→string
      const stringArgs = {};
      Object.entries(args).forEach(([k, v]) => {
        if (v == null || v === '') return;
        stringArgs[k] = String(v);
      });
      const res = await getPrompt(serverId, prompt.name, stringArgs);
      const text = res.text || JSON.stringify(res.messages || [], null, 2);
      const latencyMs =
        typeof res.latency_ms === 'number'
          ? res.latency_ms
          : Math.round(performance.now() - started);
      setLastResults((prev) => ({
        ...prev,
        [prompt.name]: {
          text: formatJsonString(text),
          messages: res.messages,
          description: res.description || '',
          arguments: stringArgs,
          error: false,
          latency_ms: latencyMs,
        },
      }));
      setSaveDisabled(false);
    } catch (err) {
      setLastResults((prev) => ({
        ...prev,
        [prompt.name]: {
          text: err.message,
          error: true,
          latency_ms: Math.round(performance.now() - started),
        },
      }));
      setSaveDisabled(true);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!last || last.error) return;
    try {
      const res = await savePromptResult(serverId, prompt.name, {
        result: last.text,
        arguments: last.arguments || formValues[prompt.name] || {},
      });
      if (!savedPrompts.includes(prompt.name)) {
        setSavedPrompts((prev) => [...prev, prompt.name]);
      }
      showMessage(res.message || '已保存', 'success');
    } catch (err) {
      showMessage(err.message, 'error');
    }
  };

  const handleClear = async () => {
    if (!window.confirm('确定清除该提示词已保存的数据？')) return;
    try {
      const res = await clearPromptSavedData(serverId, prompt.name);
      setSavedPrompts((prev) => prev.filter((n) => n !== prompt.name));
      const defaults = {};
      argsSchema.forEach((a) => {
        defaults[a.name] = '';
      });
      setFormValues((prev) => ({ ...prev, [prompt.name]: defaults }));
      setLastResults((prev) => {
        const next = { ...prev };
        delete next[prompt.name];
        return next;
      });
      setSaveDisabled(true);
      showMessage(res.message || '已清除', 'success');
    } catch (err) {
      showMessage(err.message, 'error');
    }
  };

  const values = formValues[prompt.name] || {};

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
              {prompt.name}
              {hasSaved && <span className="saved-badge">已保存</span>}
            </span>
            {prompt.title && <span className="tool-title">{prompt.title}</span>}
          </div>
          <span className="desc">{prompt.description || '-'}</span>
        </div>
      </div>
      <div className={`tool-detail ${isActive ? 'visible' : ''}`}>
        <div className="param-form">
          {argsSchema.length === 0 ? (
            <p className="empty">无参数</p>
          ) : (
            argsSchema.map((a) => (
              <div key={a.name} className="form-group">
                <label className="param-label">
                  {a.name}
                  {a.required && <span className="required">*</span>}: string
                </label>
                <input
                  type="text"
                  className="param-input"
                  value={values[a.name] ?? ''}
                  onChange={(e) => handleArgChange(a.name, e.target.value)}
                  placeholder={a.name}
                />
                {a.description && (
                  <div className="param-hint">{a.description}</div>
                )}
              </div>
            ))
          )}
        </div>
        <div className="row tool-actions-row">
          <button type="button" className="primary" onClick={handleGet} disabled={loading}>
            {loading ? '请求中…' : '获取提示词'}
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
                消息预览
                {last.latency_ms != null && (
                  <span className="result-latency">耗时 {last.latency_ms} ms</span>
                )}
              </span>
            </div>
            <pre className="result-box result-area">{last.text}</pre>
          </div>
        )}
      </div>
    </div>
  );
}

export function PromptsTab({ serverId, serverName }) {
  const [prompts, setPrompts] = useState([]);
  const [savedPrompts, setSavedPrompts] = useState([]);
  const [formValues, setFormValues] = useState({});
  const [lastResults, setLastResults] = useState({});
  const [activeName, setActiveName] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!serverId) return;
    setLoading(true);
    setError(null);
    setActiveName(null);
    listPrompts(serverId)
      .then((data) => {
        const list = data.prompts || [];
        setPrompts(list);
        setSavedPrompts(data.saved_prompts || []);
        const defaults = {};
        const lastMap = {};
        list.forEach((p) => {
          const def = {};
          (p.arguments || []).forEach((a) => {
            def[a.name] = '';
          });
          const saved = data.saved_arguments?.[p.name] || {};
          const lastRun = data.last_runs?.[p.name];
          defaults[p.name] = { ...def, ...saved, ...(lastRun?.arguments || {}) };
          if (lastRun?.result) {
            lastMap[p.name] = {
              text: formatJsonString(lastRun.result),
              arguments: lastRun.arguments || {},
              error: false,
            };
          }
        });
        setFormValues(defaults);
        setLastResults(lastMap);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [serverId]);

  if (!serverId) return <p className="empty">请先选择左侧服务器。</p>;
  if (loading) return <p className="loading">正在读取提示词列表…</p>;
  if (error) {
    return (
      <p className="empty" style={{ color: 'var(--danger)' }}>
        {error}
      </p>
    );
  }
  if (!prompts.length) {
    return (
      <>
        <h2 className="doc-title">MCP 提示词 · {serverName || ''}</h2>
        <p className="empty">该服务器未暴露任何提示词。</p>
      </>
    );
  }

  return (
    <div className="main-content">
      <h2 className="doc-title">MCP 提示词 · {serverName || ''}</h2>
      <div className="tool-list">
        {prompts.map((p, index) => (
          <PromptBlock
            key={p.name}
            prompt={p}
            index={index}
            isActive={p.name === activeName}
            onToggle={() => setActiveName((prev) => (prev === p.name ? null : p.name))}
            serverId={serverId}
            savedPrompts={savedPrompts}
            setSavedPrompts={setSavedPrompts}
            formValues={formValues}
            setFormValues={setFormValues}
            lastResults={lastResults}
            setLastResults={setLastResults}
          />
        ))}
      </div>
    </div>
  );
}
