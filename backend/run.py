# -*- coding: utf-8 -*-
"""启动 MCP Doc（uvicorn）。"""
from __future__ import annotations

import os
import sys
from pathlib import Path

import uvicorn

# 支持 python backend/run.py 以脚本方式直接运行：把项目根目录加入 sys.path
_PROJECT_ROOT = str(Path(__file__).resolve().parent.parent)
if _PROJECT_ROOT not in sys.path:
    sys.path.insert(0, _PROJECT_ROOT)

from backend.logging_config import setup_logging  # noqa: E402

logger = setup_logging()


def main() -> None:
    """读取端口与热重载环境变量后启动服务。"""
    port = int(os.environ.get("MCP_DOC_PORT", "8765"))
    reload_flag = os.environ.get("MCP_DOC_RELOAD", "").lower() in {"1", "true", "yes"}
    logger.info(
        "MCP Doc 后端启动: http://127.0.0.1:%d/mcp-doc/ (reload=%s)", port, reload_flag
    )
    uvicorn.run(
        "backend.app:web_app",
        host="0.0.0.0",
        port=port,
        reload=reload_flag,
    )


if __name__ == "__main__":
    main()
