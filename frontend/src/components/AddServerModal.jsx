import React, { useState, useEffect } from 'react';
import { useToast } from '../ToastContext';
import { addServer, updateServer } from '../api';

const EMPTY_FORM = {
  name: '',
  transport: 'http',
  url: '',
  headers: '',
  command: '',
  args: '',
  env: '',
  cwd: '',
};

/** 将服务器对象填入表单字段。 */
function serverToForm(server) {
  return {
    name: server.name || '',
    transport: server.transport === 'stdio' ? 'stdio' : 'http',
    url: server.url || '',
    headers:
      server.headers && Object.keys(server.headers).length
        ? JSON.stringify(server.headers, null, 2)
        : '',
    command: server.command || '',
    args:
      Array.isArray(server.args) && server.args.length
        ? JSON.stringify(server.args, null, 2)
        : '',
    env:
      server.env && Object.keys(server.env).length
        ? JSON.stringify(server.env, null, 2)
        : '',
    cwd: server.cwd || '',
  };
}

/** 解析 JSON 对象文本；空串返回空对象。 */
function parseJsonObject(raw, label) {
  const text = (raw || '').trim();
  if (!text) return {};
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error(`${label} 不是合法 JSON`);
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} 必须是 JSON 对象`);
  }
  return value;
}

/** 解析 JSON 数组文本；空串返回空数组。 */
function parseJsonArray(raw, label) {
  const text = (raw || '').trim();
  if (!text) return [];
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error(`${label} 不是合法 JSON`);
  }
  if (!Array.isArray(value)) {
    throw new Error(`${label} 必须是 JSON 数组`);
  }
  return value;
}

/** 新增 / 编辑 MCP 服务器弹窗，支持 http 与 stdio 两种传输。 */
export function AddServerModal({ open, editingServer, onClose, onSaved }) {
  const showMessage = useToast();
  const [form, setForm] = useState(EMPTY_FORM);
  const isEdit = !!editingServer;

  useEffect(() => {
    if (!open) return;
    setForm(editingServer ? serverToForm(editingServer) : { ...EMPTY_FORM });
  }, [open, editingServer]);

  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async () => {
    const nameTrim = form.name.trim();
    if (!nameTrim) {
      showMessage('请填写名称', 'info');
      return;
    }

    let headers = {};
    let args = [];
    let env = {};
    try {
      headers = parseJsonObject(form.headers, '请求头');
      args = parseJsonArray(form.args, '参数');
      env = parseJsonObject(form.env, '环境变量');
    } catch (err) {
      showMessage(err.message, 'error');
      return;
    }

    const transport = form.transport === 'stdio' ? 'stdio' : 'http';
    const body = {
      name: nameTrim,
      transport,
      url: form.url.trim(),
      headers,
      command: form.command.trim(),
      args,
      env,
      cwd: form.cwd.trim(),
    };

    if (transport === 'http') {
      if (!body.url) {
        showMessage('HTTP 传输需填写 URL', 'info');
        return;
      }
    } else if (!body.command) {
      showMessage('STDIO 传输需填写 command', 'info');
      return;
    }

    try {
      if (isEdit) {
        await updateServer(editingServer.id, body);
        showMessage('已更新', 'success');
      } else {
        await addServer(body);
        showMessage('新增成功', 'success');
      }
      onSaved();
      onClose();
    } catch (err) {
      showMessage(err.message, 'error');
    }
  };

  if (!open) return null;

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <h3>{isEdit ? '编辑 MCP 服务器' : '新增 MCP 服务器'}</h3>
        <div className="form-group">
          <label>名称</label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setField('name', e.target.value)}
            placeholder="服务器名称"
          />
        </div>
        <div className="form-group">
          <label>传输方式</label>
          <select
            className="transport-select"
            value={form.transport}
            onChange={(e) => setField('transport', e.target.value)}
          >
            <option value="http">HTTP</option>
            <option value="stdio">STDIO</option>
          </select>
        </div>
        {form.transport === 'http' ? (
          <>
            <div className="form-group">
              <label>URL</label>
              <input
                type="text"
                value={form.url}
                onChange={(e) => setField('url', e.target.value)}
                placeholder="https://example.com/mcp"
              />
            </div>
            <div className="form-group">
              <label>请求头 Headers</label>
              <textarea
                value={form.headers}
                onChange={(e) => setField('headers', e.target.value)}
                placeholder='{"Authorization":"Bearer <token>"}'
                rows={4}
              />
            </div>
          </>
        ) : (
          <>
            <div className="form-group">
              <label>启动命令</label>
              <input
                type="text"
                value={form.command}
                onChange={(e) => setField('command', e.target.value)}
                placeholder="python"
              />
            </div>
            <div className="form-group">
              <label>参数（JSON 数组）</label>
              <textarea
                value={form.args}
                onChange={(e) => setField('args', e.target.value)}
                placeholder='["demo_server/stdio_main.py"]'
                rows={3}
              />
            </div>
            <div className="form-group">
              <label>环境变量（JSON 对象）</label>
              <textarea
                value={form.env}
                onChange={(e) => setField('env', e.target.value)}
                placeholder='{"API_KEY":"xxx"}'
                rows={3}
              />
            </div>
            <div className="form-group">
              <label>工作目录</label>
              <input
                type="text"
                value={form.cwd}
                onChange={(e) => setField('cwd', e.target.value)}
                placeholder="/path/to/workdir"
              />
            </div>
          </>
        )}
        <div className="row">
          <button type="button" className="secondary" onClick={onClose}>
            取消
          </button>
          <button type="button" className="primary" onClick={handleSubmit}>
            确定
          </button>
        </div>
      </div>
    </div>
  );
}
