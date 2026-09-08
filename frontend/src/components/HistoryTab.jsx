import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  clearHistory,
  getPrompt,
  invokeTool,
  listHistory,
  readResource,
  savePromptResult,
  saveResourceResult,
  saveToolResult,
} from '../api';
import { useToast } from '../ToastContext';

const KIND_LABEL = { tool: '工具', resource: '资源', prompt: '提示词' };

/** 将参数对象压成一行摘要，便于时间线条目预览。 */
function argsSummary(args) {
  if (!args || typeof args !== 'object') return '';
  const entries = Object.entries(args);
  if (!entries.length) return '无参数';
  return entries
    .slice(0, 4)
    .map(([k, v]) => {
      const raw = typeof v === 'string' ? v : JSON.stringify(v);
      const short = raw.length > 40 ? `${raw.slice(0, 40)}…` : raw;
      return `${k}=${short}`;
    })
    .join(', ');
}

/** 本地时间短格式。 */
function formatAt(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('zh-CN', { hour12: false });
  } catch {
    return iso;
  }
}

/** 调用历史 Tab：追加时间线，支持筛选、重放、保存到文档。 */
export function HistoryTab({ serverId, serverName, active }) {
  const showMessage = useToast();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    if (!serverId) return;
    setLoading(true);
    try {
      const data = await listHistory(serverId);
      setEntries(data.entries || []);
    } catch (err) {
      showMessage(err.message, 'error');
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [serverId, showMessage]);

  useEffect(() => {
    if (active && serverId) load();
  }, [active, serverId, load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((e) => {
      if (filter === 'error' && !e.is_error) return false;
      if (filter !== 'all' && filter !== 'error' && e.kind !== filter) return false;
      if (!q) return true;
      const blob = `${e.name} ${argsSummary(e.arguments)} ${e.result} ${e.error_message}`.toLowerCase();
      return blob.includes(q);
    });
  }, [entries, filter, query]);

  const handleClear = async () => {
    if (!serverId) return;
    if (!window.confirm('确定清空该服务器的全部调用历史？')) return;
    try {
      const res = await clearHistory(serverId);
      setEntries([]);
      setOpenId(null);
      showMessage(res.message || '已清空', 'success');
    } catch (err) {
      showMessage(err.message, 'error');
    }
  };

  const handleReplay = async (entry) => {
    if (!serverId || busyId) return;
    setBusyId(entry.id);
    try {
      if (entry.kind === 'tool') {
        await invokeTool(serverId, entry.name, entry.arguments || {});
      } else if (entry.kind === 'resource') {
        const uri = (entry.arguments && entry.arguments.uri) || entry.name;
        await readResource(serverId, uri);
      } else if (entry.kind === 'prompt') {
        await getPrompt(serverId, entry.name, entry.arguments || {});
      }
      showMessage('已重放', 'success');
      await load();
    } catch (err) {
      showMessage(err.message, 'error');
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const handleSave = async (entry) => {
    if (!serverId || entry.is_error || !entry.result) {
      showMessage('错误或空结果不能保存', 'info');
      return;
    }
    setBusyId(entry.id);
    try {
      let res;
      if (entry.kind === 'tool') {
        res = await saveToolResult(serverId, entry.name, {
          result: entry.result,
          arguments: entry.arguments || {},
        });
      } else if (entry.kind === 'resource') {
        const uri = (entry.arguments && entry.arguments.uri) || entry.name;
        res = await saveResourceResult(serverId, {
          uri,
          result: entry.result,
          arguments: entry.arguments || { uri },
        });
      } else {
        res = await savePromptResult(serverId, entry.name, {
          result: entry.result,
          arguments: entry.arguments || {},
        });
      }
      showMessage(res.message || '已保存', 'success');
    } catch (err) {
      showMessage(err.message, 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleCopy = async (entry) => {
    const text = entry.is_error ? entry.error_message || entry.result : entry.result;
    if (!text) {
      showMessage('无可复制内容', 'info');
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      showMessage('已复制到剪贴板', 'success');
    } catch (err) {
      showMessage(err.message || '复制失败', 'error');
    }
  };

  if (!serverId) {
    return <p className="empty">请先选择左侧服务器。</p>;
  }

  if (loading && !entries.length) {
    return <p className="loading">正在读取调用历史…</p>;
  }

  return (
    <div className="history-tab">
      <div className="tools-header">
        <h2>
          调用历史
          {serverName ? ` · ${serverName}` : ''}
        </h2>
      </div>

      <div className="history-toolbar">
        <input
          className="param-input history-search"
          type="search"
          placeholder="按名称 / 内容搜索…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="history-chips">
          {[
            ['all', '全部'],
            ['tool', '工具'],
            ['resource', '资源'],
            ['prompt', '提示词'],
            ['error', '仅错误'],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`history-chip ${filter === id ? 'active' : ''}`}
              onClick={() => setFilter(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="history-meta">
        <span>
          共 {filtered.length} 条
          {entries.length !== filtered.length ? `（筛选自 ${entries.length}）` : ''}
        </span>
        <div className="history-meta-actions">
          <button type="button" className="secondary" onClick={() => setOpenId(null)}>
            全部折叠
          </button>
          <button type="button" className="secondary" onClick={load} disabled={loading}>
            刷新
          </button>
          <button type="button" className="secondary" onClick={handleClear}>
            清空
          </button>
        </div>
      </div>

      {!filtered.length ? (
        <p className="empty">暂无调用记录。在工具 / 资源 / 提示词中执行后会出现在这里。</p>
      ) : (
        <div className="history-timeline">
          {filtered.map((e) => {
            const open = openId === e.id;
            const resultText = e.is_error
              ? e.error_message || e.result || '调用失败'
              : e.result || '（无输出）';
            return (
              <div key={e.id} className={`history-entry ${e.is_error ? 'err' : 'ok'}`}>
                <div className="history-dot" aria-hidden="true" />
                <div className={`history-card ${open ? 'open' : ''}`}>
                  <button
                    type="button"
                    className="history-card-head"
                    onClick={() => setOpenId(open ? null : e.id)}
                  >
                    <span className={`history-kind kind-${e.kind}`}>
                      {KIND_LABEL[e.kind] || e.kind}
                    </span>
                    <span className="history-main">
                      <span className="history-title-row">
                        <span className="history-name">{e.name}</span>
                        <span className={`history-status ${e.is_error ? 'err' : 'ok'}`}>
                          {e.is_error ? '失败' : '成功'}
                        </span>
                      </span>
                      <span className="history-sub">{argsSummary(e.arguments)}</span>
                    </span>
                    <span className="history-stats">
                      <span className="history-latency">
                        {e.latency_ms != null ? `${e.latency_ms} ms` : '—'}
                      </span>
                      <span>{formatAt(e.created_at)}</span>
                    </span>
                  </button>
                  {open && (
                    <div className="history-card-body">
                      <div className="history-grid">
                        <div>
                          <p className="history-block-label">参数</p>
                          <pre className="history-pre">
                            {JSON.stringify(e.arguments || {}, null, 2)}
                          </pre>
                        </div>
                        <div>
                          <p className="history-block-label">{e.is_error ? '错误' : '结果'}</p>
                          <pre className={`history-pre ${e.is_error ? 'err' : ''}`}>
                            {resultText}
                          </pre>
                        </div>
                      </div>
                      <div className="history-actions">
                        <button
                          type="button"
                          className="primary"
                          disabled={busyId === e.id}
                          onClick={() => handleReplay(e)}
                        >
                          {busyId === e.id ? '处理中…' : '重放'}
                        </button>
                        <button
                          type="button"
                          className="secondary"
                          disabled={busyId === e.id || e.is_error}
                          onClick={() => handleSave(e)}
                        >
                          保存到文档
                        </button>
                        <button
                          type="button"
                          className="secondary"
                          onClick={() => handleCopy(e)}
                        >
                          复制结果
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
