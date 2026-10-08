import React from 'react';

const REPO_URL = 'https://github.com/isfangmk/mcp-doc';

export function PageHeader() {
  return (
    <header className="page-header">
      <div className="page-header-row">
        <h1>MCP Doc</h1>
        <a
          className="oss-link"
          href={REPO_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open Source · GitHub
        </a>
      </div>
      <p className="subtitle">连接 MCP 服务，调试 Tools / Resources / Prompts，沉淀文档</p>
    </header>
  );
}
