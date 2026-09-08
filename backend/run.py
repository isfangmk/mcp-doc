# -*- coding: utf-8 -*-
"""启动 MCP Doc（uvicorn）。"""
from __future__ import annotations

import os

import uvicorn


def main() -> None:
    """读取端口与热重载环境变量后启动服务。"""
    port = int(os.environ.get("MCP_DOC_PORT", "8765"))
    reload_flag = os.environ.get("MCP_DOC_RELOAD", "").lower() in {"1", "true", "yes"}
    uvicorn.run(
        "backend.app:web_app",
        host="0.0.0.0",
        port=port,
        reload=reload_flag,
    )


if __name__ == "__main__":
    main()
