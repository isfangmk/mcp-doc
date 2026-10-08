# -*- coding: utf-8 -*-
"""MCP Doc HTTP API：服务器 CRUD、Tools / Resources / Prompts 调试与文档导出。"""
from __future__ import annotations

import json
import logging
import re
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Literal
from urllib.parse import unquote

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, model_validator

from . import storage
from .client import (
    call_tool_async,
    close_all_sessions,
    close_server_session,
    get_prompt_async,
    list_prompts_async,
    list_resources_async,
    list_tools_async,
    probe_connection_async,
    read_resource_async,
)

logger = logging.getLogger("mcp_doc")

storage.init_db()


@asynccontextmanager
async def _lifespan(_app: FastAPI):
    """应用退出时关闭全部 MCP 复用会话。"""
    yield
    await close_all_sessions()


web_app = FastAPI(
    title="MCP Doc",
    description="连接 MCP 服务，调试 Tools / Resources / Prompts，沉淀文档",
    lifespan=_lifespan,
)
web_app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

STATIC_DIR = Path(__file__).resolve().parent.parent / "frontend" / "dist"


class ServerBody(BaseModel):
    """新增/更新服务器请求体，支持 http 与 stdio。"""

    name: str = Field(..., min_length=1)
    transport: Literal["http", "stdio"] = "http"
    url: str | None = None
    headers: dict[str, str] | None = None
    command: str | None = None
    args: list[str] | None = None
    env: dict[str, str] | None = None
    cwd: str | None = None

    @model_validator(mode="after")
    def _check_transport_fields(self) -> ServerBody:
        """http 必须有 url，stdio 必须有 command。"""
        if self.transport == "http":
            if not (self.url or "").strip():
                raise ValueError("HTTP 传输需填写 url")
        elif not (self.command or "").strip():
            raise ValueError("STDIO 传输需填写 command")
        return self


class ToolInvokeBody(BaseModel):
    arguments: dict[str, Any] | None = None


class SaveResultBody(BaseModel):
    result: str
    arguments: dict[str, Any] | None = None
    is_error: bool | None = None


class ResourceReadBody(BaseModel):
    uri: str = Field(..., min_length=1)


class ResourceSaveBody(BaseModel):
    uri: str = Field(..., min_length=1)
    result: str
    arguments: dict[str, Any] | None = None
    mime_type: str | None = None


class PromptGetBody(BaseModel):
    arguments: dict[str, str] | None = None


class PromptSaveBody(BaseModel):
    result: str
    arguments: dict[str, Any] | None = None


def _require_server(server_id: str) -> dict[str, Any]:
    """取服务器配置，不存在则 404。"""
    server = storage.get_server(server_id)
    if not server:
        raise HTTPException(status_code=404, detail="服务器不存在")
    return server


def _serialize_invoke_result(payload: dict[str, Any]) -> str:
    """将工具调用结果序列化为前端展示用的文本。"""
    structured = payload.get("structuredContent")
    if structured is not None:
        return json.dumps(structured, ensure_ascii=False, indent=2)
    content = (payload.get("content") or "").strip()
    if not content:
        return "(无文本输出)"
    try:
        return json.dumps(json.loads(content), ensure_ascii=False, indent=2)
    except (json.JSONDecodeError, TypeError):
        return content


def _record_history(
    server_id: str,
    kind: str,
    name: str,
    arguments: dict[str, Any] | None,
    result_text: str,
    is_error: bool,
    error_message: str = "",
    latency_ms: int | None = None,
) -> None:
    """写入追加式调用历史；失败仅打日志，不影响主流程。"""
    try:
        storage.append_call_history(
            server_id,
            kind,
            name,
            arguments,
            result_text,
            is_error,
            error_message,
            latency_ms,
        )
    except Exception:
        logger.exception("写入调用历史失败: %s/%s/%s", server_id, kind, name)


def _uri_matches_template(uri: str, template: str) -> bool:
    """判断具体 URI 是否匹配含 {var} 的资源模板。"""
    pattern = re.escape(template)
    pattern = re.sub(r"\\\{[^}]+\\\}", r"[^/]+", pattern)
    return re.fullmatch(pattern, uri) is not None


def _enrich_resource_saved_arguments(
    by_uri: dict[str, dict[str, Any]],
    templates: list[dict[str, Any]],
) -> dict[str, dict[str, Any]]:
    """
    将按 URI 存储的 arguments 同时映射到匹配的 uriTemplate，
    以便前端模板表单回填 filled URI。
    """
    out = dict(by_uri)
    for tpl in templates:
        key = tpl.get("uriTemplate") or ""
        if not key or key in out:
            continue
        for uri, args in by_uri.items():
            if _uri_matches_template(uri, key):
                out[key] = args if args else {"uri": uri}
                break
    return out


# ---------- Servers ----------


@web_app.get("/mcp-doc/api/servers")
def api_list_servers():
    """列出已配置的 MCP 服务器。"""
    return storage.list_servers()


@web_app.post("/mcp-doc/api/servers")
def api_add_server(body: ServerBody):
    """新增 MCP 服务器。"""
    server = storage.add_server(
        name=body.name,
        transport=body.transport,
        url=body.url or "",
        headers=body.headers,
        command=body.command or "",
        args=body.args,
        env=body.env,
        cwd=body.cwd or "",
    )
    return {"message": "新增成功", "server": server}


@web_app.put("/mcp-doc/api/servers/{server_id}")
async def api_update_server(server_id: str, body: ServerBody):
    """更新 MCP 服务器。"""
    ok = storage.update_server(
        server_id,
        name=body.name,
        transport=body.transport,
        url=body.url or "",
        headers=body.headers,
        command=body.command or "",
        args=body.args,
        env=body.env,
        cwd=body.cwd or "",
    )
    if not ok:
        raise HTTPException(status_code=404, detail="服务器不存在")
    await close_server_session(server_id)
    return {"message": "已更新", "server": storage.get_server(server_id)}


@web_app.delete("/mcp-doc/api/servers/{server_id}")
async def api_delete_server(server_id: str):
    """删除 MCP 服务器及其调试结果。"""
    if not storage.delete_server(server_id):
        raise HTTPException(status_code=404, detail="服务器不存在")
    await close_server_session(server_id)
    return {"message": "已删除"}


@web_app.get("/mcp-doc/api/servers/{server_id}/health")
async def api_server_health(server_id: str):
    """探测 MCP 连通性与延迟。"""
    server = _require_server(server_id)
    return await probe_connection_async(server)


# ---------- Tools ----------


@web_app.get("/mcp-doc/api/servers/{server_id}/tools")
async def api_list_tools(server_id: str):
    """拉取工具列表，并附带文档保存标记与上次运行回填数据。"""
    server = _require_server(server_id)
    try:
        tools = await list_tools_async(server)
    except Exception as exc:
        logger.exception("列出工具失败: %s", server_id)
        raise HTTPException(status_code=502, detail=f"连接 MCP 失败: {exc}") from exc
    saved_tools, saved_arguments = storage.list_saved_summaries(server_id)
    return {
        "server_id": server_id,
        "tools": tools,
        "saved_tools": saved_tools,
        "saved_arguments": saved_arguments,
        "last_runs": storage.list_last_runs(server_id),
    }


@web_app.post("/mcp-doc/api/servers/{server_id}/tools/{tool_name}/invoke")
async def api_invoke_tool(server_id: str, tool_name: str, body: ToolInvokeBody):
    """调用工具，并记录本次参数与结果供再次打开时回填。"""
    server = _require_server(server_id)
    started = time.perf_counter()
    try:
        payload = await call_tool_async(server, tool_name, body.arguments)
    except Exception as exc:
        latency_ms = int((time.perf_counter() - started) * 1000)
        _record_history(
            server_id,
            "tool",
            tool_name,
            body.arguments,
            "",
            True,
            str(exc),
            latency_ms,
        )
        logger.exception("调用工具失败: %s/%s", server_id, tool_name)
        raise HTTPException(status_code=502, detail=f"调用失败: {exc}") from exc

    latency_ms = int((time.perf_counter() - started) * 1000)
    text = _serialize_invoke_result(payload)
    is_error = bool(payload.get("isError"))
    storage.upsert_last_run(server_id, tool_name, body.arguments, text, is_error)
    _record_history(
        server_id,
        "tool",
        tool_name,
        body.arguments,
        text,
        is_error,
        "" if not is_error else text,
        latency_ms,
    )
    return {**payload, "latency_ms": latency_ms}


@web_app.post("/mcp-doc/api/servers/{server_id}/tools/{tool_name}/save")
def api_save_result(server_id: str, tool_name: str, body: SaveResultBody):
    """保存工具调试结果（同工具仅保留最新一份）。"""
    _require_server(server_id)
    if body.is_error:
        raise HTTPException(status_code=400, detail="错误结果不能保存")
    storage.save_tool_result(server_id, tool_name, body.arguments, body.result)
    return {"message": "已保存"}


@web_app.delete("/mcp-doc/api/servers/{server_id}/tools/{tool_name}/saved_data")
def api_clear_tool_saved(server_id: str, tool_name: str):
    """清除单个工具的已保存数据。"""
    _require_server(server_id)
    storage.clear_tool_saved(server_id, tool_name)
    return {"message": "已清除"}


# ---------- Resources ----------


@web_app.get("/mcp-doc/api/servers/{server_id}/resources")
async def api_list_resources(server_id: str):
    """拉取资源与模板列表，并附带已保存 URI / 参数。"""
    server = _require_server(server_id)
    try:
        listed = await list_resources_async(server)
    except Exception as exc:
        logger.exception("列出资源失败: %s", server_id)
        raise HTTPException(status_code=502, detail=f"连接 MCP 失败: {exc}") from exc

    by_uri = storage.list_resource_saved_arguments(server_id)
    templates = listed.get("templates") or []
    return {
        "server_id": server_id,
        "resources": listed.get("resources") or [],
        "templates": templates,
        "saved_uris": storage.list_saved_resource_uris(server_id),
        "saved_arguments": _enrich_resource_saved_arguments(by_uri, templates),
    }


@web_app.post("/mcp-doc/api/servers/{server_id}/resources/read")
async def api_read_resource(server_id: str, body: ResourceReadBody):
    """按 URI 读取资源内容。"""
    server = _require_server(server_id)
    started = time.perf_counter()
    try:
        payload = await read_resource_async(server, body.uri)
    except Exception as exc:
        latency_ms = int((time.perf_counter() - started) * 1000)
        _record_history(
            server_id,
            "resource",
            body.uri,
            {"uri": body.uri},
            "",
            True,
            str(exc),
            latency_ms,
        )
        logger.exception("读取资源失败: %s %s", server_id, body.uri)
        raise HTTPException(status_code=502, detail=f"读取失败: {exc}") from exc

    latency_ms = int((time.perf_counter() - started) * 1000)
    text = payload.get("text") or json.dumps(
        payload.get("contents") or [], ensure_ascii=False, indent=2
    )
    _record_history(
        server_id,
        "resource",
        body.uri,
        {"uri": body.uri},
        text,
        False,
        "",
        latency_ms,
    )
    return {**payload, "latency_ms": latency_ms}


@web_app.post("/mcp-doc/api/servers/{server_id}/resources/save")
def api_save_resource(server_id: str, body: ResourceSaveBody):
    """保存资源读取结果。"""
    _require_server(server_id)
    if not (body.result and body.result.strip()):
        raise HTTPException(status_code=400, detail="结果为空，无法保存")
    storage.save_resource_result(
        server_id,
        body.uri,
        body.result,
        body.arguments,
        body.mime_type or "",
    )
    return {"message": "已保存"}


@web_app.delete("/mcp-doc/api/servers/{server_id}/resources/{uri:path}/saved_data")
def api_clear_resource_saved(server_id: str, uri: str):
    """清除单个资源 URI 的已保存数据（uri 经 path 编码）。"""
    _require_server(server_id)
    decoded = unquote(uri)
    storage.clear_resource_saved(server_id, decoded)
    return {"message": "已清除"}


# ---------- Prompts ----------


@web_app.get("/mcp-doc/api/servers/{server_id}/prompts")
async def api_list_prompts(server_id: str):
    """拉取 Prompt 列表，并附带已保存标记、参数与上次运行。"""
    server = _require_server(server_id)
    try:
        prompts = await list_prompts_async(server)
    except Exception as exc:
        logger.exception("列出 Prompt 失败: %s", server_id)
        raise HTTPException(status_code=502, detail=f"连接 MCP 失败: {exc}") from exc
    return {
        "server_id": server_id,
        "prompts": prompts,
        "saved_prompts": storage.list_saved_prompt_names(server_id),
        "saved_arguments": storage.list_prompt_saved_arguments(server_id),
        "last_runs": storage.list_prompt_last_runs(server_id),
    }


@web_app.post("/mcp-doc/api/servers/{server_id}/prompts/{name}/get")
async def api_get_prompt(server_id: str, name: str, body: PromptGetBody):
    """按参数生成 Prompt，并记录上次运行。"""
    server = _require_server(server_id)
    started = time.perf_counter()
    try:
        payload = await get_prompt_async(server, name, body.arguments)
    except Exception as exc:
        latency_ms = int((time.perf_counter() - started) * 1000)
        _record_history(
            server_id,
            "prompt",
            name,
            body.arguments,
            "",
            True,
            str(exc),
            latency_ms,
        )
        logger.exception("Get Prompt 失败: %s/%s", server_id, name)
        raise HTTPException(status_code=502, detail=f"Get Prompt 失败: {exc}") from exc

    latency_ms = int((time.perf_counter() - started) * 1000)
    text = payload.get("text") or ""
    storage.upsert_prompt_last_run(server_id, name, body.arguments, text, False)
    _record_history(
        server_id,
        "prompt",
        name,
        body.arguments,
        text,
        False,
        "",
        latency_ms,
    )
    return {**payload, "latency_ms": latency_ms}


@web_app.post("/mcp-doc/api/servers/{server_id}/prompts/{name}/save")
def api_save_prompt(server_id: str, name: str, body: PromptSaveBody):
    """保存 Prompt 生成结果。"""
    _require_server(server_id)
    if not (body.result and body.result.strip()):
        raise HTTPException(status_code=400, detail="结果为空，无法保存")
    storage.save_prompt_result(server_id, name, body.result, body.arguments)
    return {"message": "已保存"}


@web_app.delete("/mcp-doc/api/servers/{server_id}/prompts/{name}/saved_data")
def api_clear_prompt_saved(server_id: str, name: str):
    """清除单个 Prompt 的已保存数据。"""
    _require_server(server_id)
    storage.clear_prompt_saved(server_id, name)
    return {"message": "已清除"}


# ---------- History ----------


@web_app.get("/mcp-doc/api/servers/{server_id}/history")
def api_list_history(server_id: str, limit: int = 200):
    """列出追加式调用历史（新→旧）。"""
    _require_server(server_id)
    return {
        "server_id": server_id,
        "entries": storage.list_call_history(server_id, limit),
    }


@web_app.delete("/mcp-doc/api/servers/{server_id}/history")
def api_clear_history(server_id: str):
    """清空该服务器的全部调用历史。"""
    _require_server(server_id)
    deleted = storage.clear_call_history(server_id)
    return {"message": "已清空历史", "deleted": deleted}


@web_app.delete("/mcp-doc/api/servers/{server_id}/saved_data")
def api_clear_server_saved(server_id: str):
    """清除服务器下全部已保存数据（Tools / Resources / Prompts）。"""
    _require_server(server_id)
    storage.clear_server_saved(server_id)
    return {"message": "已清除"}


# ---------- Doc ----------


@web_app.get("/mcp-doc/api/servers/{server_id}/doc")
async def api_get_doc(server_id: str):
    """合并实时 schema 与已保存参数/结果，生成 Tools / Resources / Prompts 文档。"""
    server = _require_server(server_id)
    saved_tools = storage.list_saved_results(server_id)
    saved_resources = storage.list_saved_resource_results(server_id)
    saved_prompts = storage.list_saved_prompt_results(server_id)

    if not saved_tools and not saved_resources and not saved_prompts:
        return {
            "server_name": server["name"],
            "tools": [],
            "resources": [],
            "prompts": [],
        }

    # 仅在有对应保存项时才拉取 live 列表，减少无谓连接
    tool_map: dict[str, dict[str, Any]] = {}
    resource_map: dict[str, dict[str, Any]] = {}
    prompt_map: dict[str, dict[str, Any]] = {}

    try:
        if saved_tools:
            tools = await list_tools_async(server)
            tool_map = {t["name"]: t for t in tools}
        if saved_resources:
            listed = await list_resources_async(server)
            for r in listed.get("resources") or []:
                resource_map[r["uri"]] = r
            for t in listed.get("templates") or []:
                resource_map[t["uriTemplate"]] = t
        if saved_prompts:
            prompts = await list_prompts_async(server)
            prompt_map = {p["name"]: p for p in prompts}
    except Exception as exc:
        logger.exception("生成文档时拉取 MCP 失败: %s", server_id)
        raise HTTPException(status_code=502, detail=f"连接 MCP 失败: {exc}") from exc

    doc_tools: list[dict[str, Any]] = []
    for saved in saved_tools:
        name = saved["tool_name"]
        live = tool_map.get(name)
        if live is None:
            raise HTTPException(
                status_code=409,
                detail=f"已保存工具 {name} 在当前服务器中不存在，请重新调试并保存",
            )
        doc_tools.append(
            {
                "name": name,
                "title": live.get("title") or "",
                "description": live.get("description") or "",
                "tags": live.get("tags") or [],
                "annotations": live.get("annotations") or {},
                "inputSchema": live.get("inputSchema") or {},
                "arguments": saved["arguments"],
                "result": saved["result"],
            }
        )

    doc_resources: list[dict[str, Any]] = []
    for saved in saved_resources:
        uri = saved["uri"]
        live = resource_map.get(uri)
        # 已保存的是具体 URI，也可能只匹配模板
        if live is None:
            for key, meta in resource_map.items():
                if "uriTemplate" in meta and _uri_matches_template(uri, key):
                    live = meta
                    break
        if live is None:
            raise HTTPException(
                status_code=409,
                detail=f"已保存资源 {uri} 在当前服务器中不存在，请重新调试并保存",
            )
        doc_resources.append(
            {
                "uri": uri,
                "name": live.get("name") or "",
                "title": live.get("title") or "",
                "description": live.get("description") or "",
                "mimeType": live.get("mimeType") or saved.get("mime_type") or "",
                "arguments": saved["arguments"],
                "result": saved["result"],
            }
        )

    doc_prompts: list[dict[str, Any]] = []
    for saved in saved_prompts:
        name = saved["prompt_name"]
        live = prompt_map.get(name)
        if live is None:
            raise HTTPException(
                status_code=409,
                detail=f"已保存提示词 {name} 在当前服务器中不存在，请重新调试并保存",
            )
        doc_prompts.append(
            {
                "name": name,
                "title": live.get("title") or "",
                "description": live.get("description") or "",
                "arguments_schema": live.get("arguments") or [],
                "arguments": saved["arguments"],
                "result": saved["result"],
            }
        )

    return {
        "server_name": server["name"],
        "tools": doc_tools,
        "resources": doc_resources,
        "prompts": doc_prompts,
    }


# ---------- Frontend ----------


@web_app.get("/mcp-doc")
@web_app.get("/mcp-doc/")
async def spa_index():
    """托管前端入口页。"""
    index = STATIC_DIR / "index.html"
    if not index.is_file():
        raise HTTPException(status_code=503, detail="前端未构建，请先执行 frontend npm run build")
    return FileResponse(index)


if STATIC_DIR.is_dir() and (STATIC_DIR / "assets").is_dir():
    web_app.mount(
        "/mcp-doc/assets",
        StaticFiles(directory=STATIC_DIR / "assets"),
        name="assets",
    )
