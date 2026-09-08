import React, { useState, useEffect, useCallback } from 'react';
import { PageHeader } from './components/PageHeader';
import { ServerPanel } from './components/ServerPanel';
import { RightPanel } from './components/RightPanel';
import { ToastProvider } from './ToastContext';
import { listServers } from './api';

/** 顶栏 + 左侧服务器 + 右侧工具/文档。 */
function AppContent() {
  const [servers, setServers] = useState([]);
  const [currentServerId, setCurrentServerId] = useState(null);
  const [rightView, setRightView] = useState('tools');

  const loadServers = useCallback(async () => {
    setServers(await listServers());
  }, []);

  useEffect(() => {
    loadServers();
  }, [loadServers]);

  const currentServer = servers.find((s) => s.id === currentServerId);
  const serverName = currentServer ? currentServer.name : '';

  return (
    <>
      <PageHeader />
      <div className="layout">
        <ServerPanel
          servers={servers}
          currentServerId={currentServerId}
          onSelectServer={setCurrentServerId}
          onServersChange={loadServers}
        />
        <RightPanel
          rightView={rightView}
          setRightView={setRightView}
          serverId={currentServerId}
          serverName={serverName}
        />
      </div>
    </>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  );
}
