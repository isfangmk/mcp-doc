# -*- coding: utf-8 -*-
"""
STDIO 传输入口：复用 server.py 中的 FastMCP 实例，无 HTTP Bearer 鉴权。
供 MCP Doc 以 command=python args=[本文件绝对路径] 方式联调。
"""
from __future__ import annotations

import sys
from pathlib import Path

# 直接 python path/to/stdio_main.py 时，把项目根加入 sys.path
_ROOT = Path(__file__).resolve().parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from demo_server.server import mcp  # noqa: E402

if __name__ == "__main__":
    # 与 HTTP 入口共享同一套 tools / resources / prompts
    mcp.run(transport="stdio")
