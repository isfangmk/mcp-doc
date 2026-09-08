# -*- coding: utf-8 -*-
"""
联调用 FastMCP 服务（Streamable HTTP）。
默认：http://127.0.0.1:8766/mcp
鉴权：Authorization: Bearer <DEMO_MCP_TOKEN>

STDIO 入口见同目录 stdio_main.py（无 HTTP 鉴权）。
"""
from __future__ import annotations

import os
from enum import Enum
from typing import Any, Literal

from fastmcp import FastMCP
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

DEMO_TOKEN = os.environ.get("DEMO_MCP_TOKEN", "demo-token")

# 共享 FastMCP 实例：HTTP 与 STDIO 入口共用同一套 tools / resources / prompts
mcp = FastMCP(name="demo-mcp-doc")


class Priority(str, Enum):
    """任务优先级。"""

    low = "low"
    medium = "medium"
    high = "high"


class BearerAuthMiddleware(BaseHTTPMiddleware):
    """校验 /mcp 请求的 Bearer Token。"""

    async def dispatch(self, request: Request, call_next):
        path = request.url.path.rstrip("/")
        if path.endswith("/mcp"):
            auth = request.headers.get("authorization") or ""
            if auth != f"Bearer {DEMO_TOKEN}":
                return JSONResponse({"detail": "Unauthorized"}, status_code=401)
        return await call_next(request)


@mcp.tool(tags={"basic", "连通性"}, annotations={"readOnlyHint": True})
def echo(message: str) -> str:
    """原样返回 message（只读提示）。"""
    return message


@mcp.tool(tags={"basic", "计算"})
def add(a: float, b: float) -> float:
    """返回两数之和。"""
    return a + b


@mcp.tool(tags={"basic", "问候"})
def greet(name: str, title: str = "朋友") -> str:
    """按称呼生成问候语。"""
    return f"你好，{title}{name}！"


@mcp.tool(tags={"复杂类型", "枚举"})
def set_priority(task_id: str, priority: Priority, notify: bool = False) -> dict[str, Any]:
    """设置任务优先级（枚举 + 布尔参数）。"""
    return {
        "task_id": task_id,
        "priority": priority.value if isinstance(priority, Priority) else priority,
        "notify": notify,
    }


@mcp.tool(tags={"复杂类型", "对象数组"})
def create_order(
    order_id: str,
    customer: dict[str, Any],
    items: list[dict[str, Any]],
    status: Literal["draft", "paid", "shipped"] = "draft",
) -> dict[str, Any]:
    """创建订单（object / array / Literal 参数）。"""
    total_qty = sum(int(item.get("qty") or 0) for item in items or [])
    return {
        "order_id": order_id,
        "customer": customer,
        "items": items,
        "status": status,
        "total_qty": total_qty,
    }


@mcp.tool(tags={"basic", "危险操作"}, annotations={"destructiveHint": True})
def delete_demo(item_id: str, confirm: bool = False) -> dict[str, Any]:
    """演示破坏性工具：仅当 confirm=true 时标记删除。"""
    if not confirm:
        return {"item_id": item_id, "deleted": False, "message": "未确认，未执行删除"}
    return {"item_id": item_id, "deleted": True, "message": "已删除（演示）"}


@mcp.resource("demo://about", mime_type="text/plain")
def about_resource() -> str:
    """静态资源：演示服务说明。"""
    return "demo-mcp-doc：用于 MCP Doc 联调的示例服务器。"


@mcp.resource("demo://items/{item_id}", mime_type="application/json")
def item_resource(item_id: str) -> str:
    """资源模板：按 item_id 返回 JSON 文本。"""
    import json

    return json.dumps(
        {"item_id": item_id, "name": f"示例物品-{item_id}", "stock": 42},
        ensure_ascii=False,
    )


@mcp.prompt
def summarize(topic: str, style: str = "简洁") -> str:
    """按主题与风格生成摘要提示词。"""
    return f"请用{style}风格总结以下主题，并列出 3 个要点：{topic}"


@mcp.prompt
def translate(text: str, target_lang: str = "zh-CN") -> str:
    """将文本翻译为目标语言的提示词。"""
    return f"请将下面内容翻译成 {target_lang}，保持原意：\n{text}"


http_app = mcp.http_app(path="/mcp")
http_app.add_middleware(BearerAuthMiddleware)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(http_app, host="127.0.0.1", port=8766)
