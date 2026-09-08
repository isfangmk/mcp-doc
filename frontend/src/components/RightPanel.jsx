import React from 'react';
import { ToolsTab } from './ToolsTab';
import { ResourcesTab } from './ResourcesTab';
import { PromptsTab } from './PromptsTab';
import { DocTab } from './DocTab';

const TABS = [
  { id: 'tools', label: '工具' },
  { id: 'resources', label: '资源' },
  { id: 'prompts', label: '提示词' },
  { id: 'doc', label: '文档' },
];

export function RightPanel({ rightView, setRightView, serverId, serverName }) {
  return (
    <div className="panel">
      <div className="right-tabs">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`right-tab ${rightView === tab.id ? 'active' : ''}`}
            onClick={() => setRightView(tab.id)}
            data-tab={tab.id}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className={`right-panel-content ${rightView === 'tools' ? 'visible' : ''}`}>
        <ToolsTab serverId={serverId} serverName={serverName} />
      </div>
      <div className={`right-panel-content ${rightView === 'resources' ? 'visible' : ''}`}>
        <ResourcesTab serverId={serverId} serverName={serverName} />
      </div>
      <div className={`right-panel-content ${rightView === 'prompts' ? 'visible' : ''}`}>
        <PromptsTab serverId={serverId} serverName={serverName} />
      </div>
      <div className={`right-panel-content ${rightView === 'doc' ? 'visible' : ''}`}>
        <DocTab serverId={serverId} active={rightView === 'doc'} />
      </div>
    </div>
  );
}
