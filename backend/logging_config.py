# -*- coding: utf-8 -*-
"""业务日志配置：mcp_doc 日志器统一输出到 stdout。

级别默认 INFO，可用环境变量 MCP_DOC_LOG_LEVEL 覆盖
（DEBUG / INFO / WARNING / ERROR / CRITICAL）。
"""
from __future__ import annotations

import logging
import os
import sys

LOGGER_NAME = "mcp_doc"


def setup_logging() -> logging.Logger:
    """初始化 mcp_doc 日志器（幂等），返回该日志器。"""
    logger = logging.getLogger(LOGGER_NAME)
    level = getattr(
        logging,
        os.environ.get("MCP_DOC_LOG_LEVEL", "INFO").upper(),
        logging.INFO,
    )
    logger.setLevel(level)
    # 不向 root 传播，避免与 uvicorn 等第三方日志器输出重复
    logger.propagate = False
    if not any(isinstance(h, logging.StreamHandler) for h in logger.handlers):
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(
            logging.Formatter(
                fmt="%(asctime)s %(levelname)s [%(name)s] %(message)s",
                datefmt="%Y-%m-%d %H:%M:%S",
            )
        )
        logger.addHandler(handler)
    return logger
