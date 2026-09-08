const API = '/mcp-doc/api';

function getBackendErrorMessage(text) {
  try {
    const j = JSON.parse(text);
    const d = j.detail;
    if (typeof d === 'string') return d;
    if (Array.isArray(d) && d.length)
      return d.map((x) => x.msg || '').filter(Boolean).join('；') || text;
  } catch (_) {}
  return text;
}

export async function fetchJson(url, options = {}) {
  const r = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(getBackendErrorMessage(t));
  }
  return r.json();
}

export async function listServers() {
  return fetchJson(API + '/servers');
}

export async function addServer(body) {
  return fetchJson(API + '/servers', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function updateServer(id, body) {
  return fetchJson(API + '/servers/' + id, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export async function deleteServer(id) {
  return fetchJson(API + '/servers/' + id, { method: 'DELETE' });
}

/** 探测服务器连通性与延迟。 */
export async function getServerHealth(serverId) {
  return fetchJson(API + '/servers/' + serverId + '/health');
}

export async function listTools(serverId) {
  return fetchJson(API + '/servers/' + serverId + '/tools');
}

export async function invokeTool(serverId, toolName, args) {
  return fetchJson(
    API + '/servers/' + serverId + '/tools/' + encodeURIComponent(toolName) + '/invoke',
    {
      method: 'POST',
      body: JSON.stringify({ arguments: args || {} }),
    }
  );
}

export async function saveToolResult(serverId, toolName, payload) {
  return fetchJson(
    API + '/servers/' + serverId + '/tools/' + encodeURIComponent(toolName) + '/save',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  );
}

export async function clearSavedData(serverId) {
  return fetchJson(API + '/servers/' + serverId + '/saved_data', {
    method: 'DELETE',
  });
}

export async function clearToolSavedData(serverId, toolName) {
  return fetchJson(
    API + '/servers/' + serverId + '/tools/' + encodeURIComponent(toolName) + '/saved_data',
    { method: 'DELETE' }
  );
}

export async function listResources(serverId) {
  return fetchJson(API + '/servers/' + serverId + '/resources');
}

export async function readResource(serverId, uri) {
  return fetchJson(API + '/servers/' + serverId + '/resources/read', {
    method: 'POST',
    body: JSON.stringify({ uri }),
  });
}

export async function saveResourceResult(serverId, payload) {
  return fetchJson(API + '/servers/' + serverId + '/resources/save', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function clearResourceSavedData(serverId, uri) {
  return fetchJson(
    API + '/servers/' + serverId + '/resources/' + encodeURIComponent(uri) + '/saved_data',
    { method: 'DELETE' }
  );
}

export async function listPrompts(serverId) {
  return fetchJson(API + '/servers/' + serverId + '/prompts');
}

export async function getPrompt(serverId, name, args) {
  return fetchJson(
    API + '/servers/' + serverId + '/prompts/' + encodeURIComponent(name) + '/get',
    {
      method: 'POST',
      body: JSON.stringify({ arguments: args || {} }),
    }
  );
}

export async function savePromptResult(serverId, name, payload) {
  return fetchJson(
    API + '/servers/' + serverId + '/prompts/' + encodeURIComponent(name) + '/save',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    }
  );
}

export async function clearPromptSavedData(serverId, name) {
  return fetchJson(
    API + '/servers/' + serverId + '/prompts/' + encodeURIComponent(name) + '/saved_data',
    { method: 'DELETE' }
  );
}

export async function getDoc(serverId) {
  return fetchJson(API + '/servers/' + serverId + '/doc');
}

/** 拉取服务器调用历史（新→旧）。 */
export async function listHistory(serverId, limit = 200) {
  const q = limit ? `?limit=${encodeURIComponent(limit)}` : '';
  return fetchJson(API + '/servers/' + serverId + '/history' + q);
}

/** 清空服务器调用历史。 */
export async function clearHistory(serverId) {
  return fetchJson(API + '/servers/' + serverId + '/history', {
    method: 'DELETE',
  });
}
