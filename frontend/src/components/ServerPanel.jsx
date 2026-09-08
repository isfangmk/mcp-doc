import React from 'react';
import { IconEdit, IconDelete, IconCopy } from './Icons';
import { AddServerModal } from './AddServerModal';
import { useToast } from '../ToastContext';
import { addServer, deleteServer, getServerHealth } from '../api';

/** 展示服务器连接摘要：HTTP 显示 URL，STDIO 显示 command + args。 */
function serverEndpointText(server) {
  if ((server.transport || 'http') === 'stdio') {
    const args = Array.isArray(server.args) ? server.args.join(' ') : '';
    return [server.command, args].filter(Boolean).join(' ').trim() || '(未配置 command)';
  }
  return server.url || '';
}

export function ServerPanel({
  servers,
  currentServerId,
  onSelectServer,
  onServersChange,
}) {
  const showMessage = useToast();
  const [modalOpen, setModalOpen] = React.useState(false);
  const [editingServer, setEditingServer] = React.useState(null);
  // 按 server id 缓存健康检查结果
  const [healthById, setHealthById] = React.useState({});

  const checkHealth = React.useCallback(async (serverId) => {
    setHealthById((prev) => ({
      ...prev,
      [serverId]: { ...(prev[serverId] || {}), loading: true },
    }));
    try {
      const res = await getServerHealth(serverId);
      setHealthById((prev) => ({
        ...prev,
        [serverId]: {
          ok: !!res.ok,
          latency_ms: res.latency_ms,
          error: res.error || null,
          loading: false,
        },
      }));
    } catch (err) {
      setHealthById((prev) => ({
        ...prev,
        [serverId]: {
          ok: false,
          latency_ms: null,
          error: err.message,
          loading: false,
        },
      }));
    }
  }, []);

  const handleAdd = () => {
    setEditingServer(null);
    setModalOpen(true);
  };

  const handleEdit = (e, server) => {
    e.stopPropagation();
    setEditingServer(server);
    setModalOpen(true);
  };

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    try {
      const res = await deleteServer(id);
      if (currentServerId === id) onSelectServer(null);
      setHealthById((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      await onServersChange();
      showMessage(res.message, 'success');
    } catch (err) {
      showMessage(err.message, 'error');
    }
  };

  const handleCopy = async (e, server) => {
    e.stopPropagation();
    try {
      const res = await addServer({
        name: `${(server.name || '').trim()} (副本)`,
        transport: server.transport || 'http',
        url: server.url || '',
        headers: server.headers || {},
        command: server.command || '',
        args: Array.isArray(server.args) ? server.args : [],
        env: server.env || {},
        cwd: server.cwd || '',
      });
      await onServersChange();
      showMessage(res.message, 'success');
    } catch (err) {
      showMessage(err.message, 'error');
    }
  };

  const handleItemClick = (server) => {
    onSelectServer(server.id);
    checkHealth(server.id);
  };

  const handleRefreshHealth = (e, serverId) => {
    e.stopPropagation();
    checkHealth(serverId);
  };

  return (
    <div className="panel">
      <h2>MCP 服务器</h2>
      <ul className="server-list">
        {!servers.length && <li className="empty">暂无服务器</li>}
        {servers.map((s) => {
          const transport = s.transport === 'stdio' ? 'stdio' : 'http';
          const health = healthById[s.id];
          return (
            <li
              key={s.id}
              className={`server-item ${s.id === currentServerId ? 'active' : ''}`}
              onClick={() => handleItemClick(s)}
            >
              <div className="server-item-info">
                <div className="server-name">
                  {s.name}
                  <span className={`transport-badge transport-${transport}`}>
                    {transport.toUpperCase()}
                  </span>
                  {transport === 'http' &&
                    s.headers &&
                    Object.keys(s.headers).length > 0 && (
                  <span className="saved-badge" title="已配置 Headers">
                    鉴权
                  </span>
                    )}
                  {health?.loading && (
                    <span className="health-chip loading" title="检测中">
                      …
                    </span>
                  )}
                  {health && !health.loading && health.ok && (
                    <span
                      className="health-chip ok"
                      title="连接正常，点击刷新"
                      onClick={(e) => handleRefreshHealth(e, s.id)}
                    >
                      {health.latency_ms != null ? `${health.latency_ms}ms` : '正常'}
                    </span>
                  )}
                  {health && !health.loading && !health.ok && (
                    <span
                      className="health-chip err"
                      title={health.error || '连接失败'}
                      onClick={(e) => handleRefreshHealth(e, s.id)}
                    >
                      错误
                    </span>
                  )}
                </div>
              </div>
              <div className="server-item-actions">
                <button
                  type="button"
                  className="btn-edit"
                  title="编辑"
                  onClick={(e) => handleEdit(e, s)}
                >
                  <IconEdit />
                </button>
                <button
                  type="button"
                  className="btn-del"
                  title="删除"
                  onClick={(e) => handleDelete(e, s.id)}
                >
                  <IconDelete />
                </button>
                <button
                  type="button"
                  className="btn-copy"
                  title="复制"
                  onClick={(e) => handleCopy(e, s)}
                >
                  <IconCopy />
                </button>
              </div>
              <div className="server-url">{serverEndpointText(s)}</div>
            </li>
          );
        })}
      </ul>
      <button type="button" className="primary btn-add-server" onClick={handleAdd}>
        + 新增服务器
      </button>
      <AddServerModal
        open={modalOpen}
        editingServer={editingServer}
        onClose={() => setModalOpen(false)}
        onSaved={onServersChange}
      />
    </div>
  );
}
