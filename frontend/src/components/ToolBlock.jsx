import React, { useState, useRef, useEffect } from 'react';
import {
  parseParams,
  parseInputValue,
  serializeInvokeResult,
  filterEmptyOptionalParams,
  defaultValueForParam,
} from '../utils';
import { invokeTool, saveToolResult, clearToolSavedData } from '../api';
import { useToast } from '../ToastContext';
import { ParamField } from './ParamField';
import { ToolTag } from './ToolTag';

/** 单个工具的展开调试块。 */
export function ToolBlock({
  tool,
  index,
  isActive,
  onToggle,
  serverId,
  savedToolNames,
  formValuesByTool,
  setFormValuesByTool,
  lastResultsByTool,
  setLastResultsByTool,
  setSavedToolNames,
}) {
  const showMessage = useToast();
  const [result, setResult] = useState(null);
  const [resultError, setResultError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saveDisabled, setSaveDisabled] = useState(true);
  const jsonRef = useRef(null);
  const params = parseParams(tool);
  const formValues = formValuesByTool[tool.name] ?? {};

  /** 将表单值规整为可调用的 arguments。 */
  const buildArguments = () => {
    const raw = formValuesByTool[tool.name] ?? {};
    const coerced = {};
    params.forEach((p) => {
      if (!(p.name in raw)) return;
      let value = raw[p.name];
      if ((p.type === 'object' || p.type === 'array') && typeof value === 'string') {
        value = JSON.parse(value);
      }
      coerced[p.name] = value;
    });
    return filterEmptyOptionalParams(coerced, params);
  };

  const handleParamChange = (paramName, value) => {
    const paramDef = params.find((p) => p.name === paramName);
    setFormValuesByTool((prev) => {
      const current = { ...(prev[tool.name] ?? {}) };
      if (paramDef?.type === 'object' || paramDef?.type === 'array') {
        current[paramName] = value;
      } else {
        current[paramName] = parseInputValue(value, paramDef?.type, paramDef);
      }
      return { ...prev, [tool.name]: current };
    });
  };

  const handleJsonBlur = () => {
    const el = jsonRef.current;
    if (!el) return;
    try {
      const raw = JSON.parse(el.value.trim());
      const args = raw.params?.arguments ?? raw.arguments ?? {};
      const next = { ...(formValuesByTool[tool.name] ?? {}) };
      params.forEach((p) => {
        if (!(p.name in args)) return;
        const v = args[p.name];
        if (p.type === 'object' || p.type === 'array') {
          next[p.name] = v;
        } else {
          next[p.name] = parseInputValue(
            v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v),
            p.type,
            p
          );
        }
      });
      setFormValuesByTool((prev) => ({ ...prev, [tool.name]: next }));
    } catch (err) {
      showMessage(`JSON 无效: ${err.message}`, 'error');
    }
  };

  useEffect(() => {
    if (!jsonRef.current || !isActive) return;
    try {
      const filteredArgs = buildArguments();
      jsonRef.current.value = JSON.stringify(
        { method: 'tools/call', params: { name: tool.name, arguments: filteredArgs } },
        null,
        2
      );
    } catch {
      // 左侧 object/array 文本未构成合法 JSON 时，不覆盖右侧编辑器
    }
  }, [isActive, tool.name, formValuesByTool, params]);

  // 展开工具时回填上次运行结果；折叠时保留内存态即可
  useEffect(() => {
    if (!isActive) return;
    const last = lastResultsByTool[tool.name];
    if (!last) {
      setResult(null);
      setResultError(false);
      setSaveDisabled(true);
      return;
    }
    setResult(serializeInvokeResult(last));
    setResultError(!!last.isError);
    setSaveDisabled(!!last.isError);
  }, [isActive, tool.name, lastResultsByTool]);

  const handleRun = async () => {
    if (!serverId) return;
    setLoading(true);
    setResult(null);
    setResultError(false);
    try {
      const args = buildArguments();
      const res = await invokeTool(serverId, tool.name, args);
      setLastResultsByTool((prev) => ({ ...prev, [tool.name]: res }));
      setResult(serializeInvokeResult(res));
      setResultError(!!res.isError);
      setSaveDisabled(!!res.isError);
    } catch (err) {
      setResult(err.message);
      setResultError(true);
      setSaveDisabled(true);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!serverId) return;
    const lastRes = lastResultsByTool[tool.name];
    const text = lastRes ? serializeInvokeResult(lastRes) : '';
    const isError = !!(lastRes && lastRes.isError);
    try {
      const args = buildArguments();
      const res = await saveToolResult(serverId, tool.name, {
        result: text,
        arguments: args,
        is_error: isError,
      });
      if (!savedToolNames.includes(tool.name)) {
        setSavedToolNames((prev) => [...prev, tool.name]);
      }
      showMessage(res.message, 'success');
    } catch (err) {
      showMessage(err.message, 'error');
    }
  };

  const handleClearSaved = async () => {
    if (!serverId) return;
    if (!window.confirm('确定清除该工具已保存的数据？')) return;
    try {
      const res = await clearToolSavedData(serverId, tool.name);
      setSavedToolNames((prev) => prev.filter((n) => n !== tool.name));
      const defaults = {};
      params.forEach((p) => {
        defaults[p.name] = defaultValueForParam(p);
      });
      setFormValuesByTool((prev) => ({ ...prev, [tool.name]: defaults }));
      setLastResultsByTool((prev) => {
        const next = { ...prev };
        delete next[tool.name];
        return next;
      });
      setResult(null);
      setResultError(false);
      setSaveDisabled(true);
      showMessage(res.message, 'success');
    } catch (err) {
      showMessage(err.message, 'error');
    }
  };

  /** 将运行结果原文写入系统剪贴板。 */
  const handleCopyResult = async () => {
    if (result == null) return;
    try {
      await navigator.clipboard.writeText(result);
      showMessage('已复制到剪贴板', 'success');
    } catch (err) {
      showMessage(err.message || '复制失败', 'error');
    }
  };

  const hasSaved = savedToolNames.includes(tool.name);
  const ann = tool.annotations || {};
  const annotationBadges = [
    ann.readOnlyHint && { key: 'readOnly', label: '只读', className: 'anno-readonly' },
    ann.destructiveHint && { key: 'destructive', label: '破坏性', className: 'anno-destructive' },
    ann.idempotentHint && { key: 'idempotent', label: '幂等', className: 'anno-idempotent' },
    ann.openWorldHint && { key: 'openWorld', label: '开放世界', className: 'anno-openworld' },
  ].filter(Boolean);

  return (
    <div className={`tool-block ${isActive ? 'expanded' : ''}`} data-tool={tool.name}>
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
              {tool.name}
              {hasSaved && <span className="saved-badge">已保存</span>}
            </span>
            {tool.title && <span className="tool-title">{tool.title}</span>}
          </div>
          <span className="desc">{tool.description || '-'}</span>
          {(annotationBadges.length > 0 || tool.tags?.length > 0) && (
            <div className="tool-tags">
              {annotationBadges.map((b) => (
                <span key={b.key} className={`anno-badge ${b.className}`}>
                  {b.label}
                </span>
              ))}
              {tool.tags?.map((tag) => (
                <ToolTag key={tag} tag={tag} />
              ))}
            </div>
          )}
        </div>
      </div>
      <div className={`tool-detail ${isActive ? 'visible' : ''}`}>
        <div className="tool-detail-desc" style={{ marginBottom: 12 }}>
          {tool.description || '-'}
        </div>
        <div className="tool-params-row">
          <div className="param-form">
            {params.length === 0 ? (
              <p className="empty">无参数</p>
            ) : (
              params.map((p) => (
                <ParamField
                  key={p.name}
                  param={p}
                  value={formValues[p.name]}
                  onChange={(v) => handleParamChange(p.name, v)}
                />
              ))
            )}
          </div>
          <textarea
            ref={jsonRef}
            className="json-preview json-preview-editable"
            rows={14}
            placeholder="编辑 arguments 后失焦同步到左侧"
            onBlur={handleJsonBlur}
            defaultValue=""
          />
        </div>
        <div className="row tool-actions-row">
          <button type="button" className="primary btn-invoke" onClick={handleRun} disabled={loading}>
            {loading ? '请求中…' : '运行'}
          </button>
          <button type="button" className="secondary btn-save" onClick={handleSave} disabled={saveDisabled}>
            保存结果
          </button>
          <button type="button" className="secondary btn-clear-tool" onClick={handleClearSaved}>
            清除
          </button>
        </div>
        {result != null && (
          <div className={`result-panel ${resultError ? 'error' : ''}`}>
            <div className="result-toolbar">
              <span className="result-label">运行结果</span>
              <button
                type="button"
                className="secondary btn-copy-result"
                onClick={handleCopyResult}
              >
                复制
              </button>
            </div>
            <pre className="result-box result-area">{result}</pre>
          </div>
        )}
      </div>
    </div>
  );
}
