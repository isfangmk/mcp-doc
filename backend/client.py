# -*- coding: utf-8 -*-
"""MCP 客户端：HTTP / STDIO 双传输，覆盖 Tools / Resources / Prompts。"""
from __future__ import annotations

import json
import time
from contextlib import asynccontextmanager
from typing import Any, AsyncIterator
from urllib.parse import unquote

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
from mcp.client.streamable_http import streamable_http_client


def _pick_non_null_type(values: list[Any]) -> str | None:
    """从 JSON Schema 联合 type 列表中取非 null 类型。"""
    for value in values:
        if value and value != "null":
            return str(value)
    return None


def _resolve_schema_type(schema: dict[str, Any]) -> str | None:
    """解析 schema.type（string 或含 null 的列表）。"""
    type_value = schema.get("type")
    if isinstance(type_value, list):
        return _pick_non_null_type(type_value)
    if isinstance(type_value, str) and type_value != "null":
        return type_value
    return None


def _normalize_property_schema(schema: dict[str, Any]) -> None:
    """将参数 schema 规范为前端可渲染的顶层 type。"""
    if "$ref" in schema:
        schema["type"] = "object"
        return

    type_value = schema.get("type")
    if isinstance(type_value, list):
        picked = _pick_non_null_type(type_value)
        if picked:
            schema["type"] = picked
        return

    if _resolve_schema_type(schema):
        props = schema.get("properties")
        if isinstance(props, dict):
            for child in props.values():
                if isinstance(child, dict):
                    _normalize_property_schema(child)
        items = schema.get("items")
        if isinstance(items, dict):
            _normalize_property_schema(items)
        return

    for union_key in ("anyOf", "oneOf"):
        union_items = schema.get(union_key)
        if not isinstance(union_items, list):
            continue
        for item in union_items:
            if not isinstance(item, dict):
                continue
            _normalize_property_schema(item)
            item_type = _resolve_schema_type(item)
            if not item_type:
                continue
            schema["type"] = item_type
            if item_type == "array" and "items" in item:
                schema["items"] = item["items"]
            if item_type == "object" and "properties" in item:
                schema["properties"] = item["properties"]
            if "enum" in item:
                schema["enum"] = item["enum"]
            return


def _extract_tags(meta: Any) -> list[str]:
    """从 tool.meta.fastmcp.tags 读取标签。"""
    if meta is None:
        return []
    if hasattr(meta, "model_dump"):
        meta = meta.model_dump()
    nested = meta.get("fastmcp") if isinstance(meta, dict) else None
    tags = nested.get("tags") if isinstance(nested, dict) else None
    if not isinstance(tags, list):
        return []
    return [str(t) for t in tags]


def _annotations_to_dict(annotations: Any) -> dict[str, Any]:
    """提取工具 annotations（只读/破坏性等提示）。"""
    if annotations is None:
        return {}
    data = annotations.model_dump() if hasattr(annotations, "model_dump") else dict(annotations)
    return {
        "title": data.get("title"),
        "readOnlyHint": data.get("readOnlyHint"),
        "destructiveHint": data.get("destructiveHint"),
        "idempotentHint": data.get("idempotentHint"),
        "openWorldHint": data.get("openWorldHint"),
    }


def _schema_to_dict(schema: Any) -> dict[str, Any]:
    """将 pydantic/dict schema 转为可 JSON 化的 dict，并规范化属性类型。"""
    if schema is None:
        return {"type": "object", "properties": {}}
    if hasattr(schema, "model_dump"):
        schema = schema.model_dump()
    schema = json.loads(json.dumps(schema))
    properties = schema.get("properties") or {}
    for prop in properties.values():
        if isinstance(prop, dict):
            _normalize_property_schema(prop)
    return schema


def _tool_to_dict(tool: Any) -> dict[str, Any]:
    """将 MCP Tool 转为 API 响应结构。"""
    schema = _schema_to_dict(tool.inputSchema)
    annotations = _annotations_to_dict(tool.annotations)
    title = ""
    if annotations.get("title"):
        title = str(annotations["title"])
    elif tool.title:
        title = str(tool.title)

    return {
        "name": tool.name,
        "title": title,
        "description": tool.description or "",
        "tags": _extract_tags(tool.meta),
        "annotations": annotations,
        "inputSchema": schema,
    }


def _content_blocks_to_text(blocks: Any) -> str:
    """将 MCP content blocks 拼成可读文本。"""
    parts: list[str] = []
    for block in blocks or []:
        if getattr(block, "type", None) == "text" or hasattr(block, "text"):
            parts.append(block.text)
        elif hasattr(block, "model_dump"):
            parts.append(json.dumps(block.model_dump(), ensure_ascii=False, indent=2))
        else:
            parts.append(str(block))
    return "\n\n".join(parts)


def _result_to_payload(result: Any) -> dict[str, Any]:
    """将 CallToolResult 转为前端使用的结果结构。"""
    structured = result.structuredContent
    if hasattr(structured, "model_dump"):
        structured = structured.model_dump()
    return {
        "content": _content_blocks_to_text(result.content),
        "structuredContent": structured,
        "isError": bool(result.isError),
    }


def _resource_to_dict(resource: Any) -> dict[str, Any]:
    """将 Resource 转为 API 结构。"""
    return {
        "uri": str(resource.uri),
        "name": resource.name or "",
        "title": getattr(resource, "title", None) or "",
        "description": resource.description or "",
        "mimeType": resource.mimeType or "",
    }


def _template_to_dict(template: Any) -> dict[str, Any]:
    """将 ResourceTemplate 转为 API 结构。"""
    return {
        "uriTemplate": str(template.uriTemplate),
        "name": template.name or "",
        "title": getattr(template, "title", None) or "",
        "description": template.description or "",
        "mimeType": template.mimeType or "",
    }


def _prompt_to_dict(prompt: Any) -> dict[str, Any]:
    """将 Prompt 转为 API 结构。"""
    arguments = []
    for arg in prompt.arguments or []:
        arguments.append(
            {
                "name": arg.name,
                "description": arg.description or "",
                "required": bool(arg.required),
            }
        )
    return {
        "name": prompt.name,
        "title": getattr(prompt, "title", None) or "",
        "description": prompt.description or "",
        "arguments": arguments,
    }


def _read_resource_payload(result: Any) -> dict[str, Any]:
    """将 ReadResourceResult 转为可读结构。"""
    contents: list[dict[str, Any]] = []
    for item in result.contents or []:
        if hasattr(item, "model_dump"):
            data = item.model_dump()
        else:
            data = {
                "uri": str(getattr(item, "uri", "")),
                "mimeType": getattr(item, "mimeType", None),
                "text": getattr(item, "text", None),
                "blob": getattr(item, "blob", None),
            }
        contents.append(data)
    text_parts = [c.get("text") for c in contents if c.get("text")]
    return {
        "contents": contents,
        "text": "\n\n".join(text_parts),
        "mimeType": next((c.get("mimeType") for c in contents if c.get("mimeType")), ""),
    }


def _get_prompt_payload(result: Any) -> dict[str, Any]:
    """将 GetPromptResult 转为可读结构。"""
    messages = []
    for msg in result.messages or []:
        if hasattr(msg, "model_dump"):
            messages.append(msg.model_dump())
        else:
            messages.append({"role": getattr(msg, "role", ""), "content": str(msg)})
    return {
        "description": result.description or "",
        "messages": messages,
        "text": json.dumps(messages, ensure_ascii=False, indent=2),
    }


@asynccontextmanager
async def open_session(server: dict[str, Any]) -> AsyncIterator[ClientSession]:
    """按服务器 transport 打开已 initialize 的 ClientSession。"""
    transport = server.get("transport") or "http"
    if transport == "stdio":
        params = StdioServerParameters(
            command=server["command"],
            args=server.get("args") or [],
            env=server.get("env") or None,
            cwd=server.get("cwd") or None,
        )
        async with stdio_client(params) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()
                yield session
        return

    url = server.get("url") or ""
    headers = server.get("headers") or {}
    async with streamable_http_client(url, headers=headers) as (read, write, _):
        async with ClientSession(read, write) as session:
            await session.initialize()
            yield session


async def probe_connection_async(server: dict[str, Any]) -> dict[str, Any]:
    """探测连接：返回是否成功、延迟毫秒与错误信息。"""
    started = time.perf_counter()
    try:
        async with open_session(server) as session:
            await session.send_ping()
        latency_ms = int((time.perf_counter() - started) * 1000)
        return {"ok": True, "latency_ms": latency_ms, "error": None}
    except Exception as exc:
        latency_ms = int((time.perf_counter() - started) * 1000)
        return {"ok": False, "latency_ms": latency_ms, "error": str(exc)}


async def list_tools_async(server: dict[str, Any]) -> list[dict[str, Any]]:
    """连接 MCP 并返回工具列表。"""
    async with open_session(server) as session:
        listed = await session.list_tools()
        return [_tool_to_dict(t) for t in listed.tools]


async def call_tool_async(
    server: dict[str, Any],
    tool_name: str,
    arguments: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """调用指定工具。"""
    async with open_session(server) as session:
        result = await session.call_tool(tool_name, arguments or {})
        return _result_to_payload(result)


async def list_resources_async(server: dict[str, Any]) -> dict[str, Any]:
    """列出静态资源与资源模板。"""
    async with open_session(server) as session:
        resources = await session.list_resources()
        templates = await session.list_resource_templates()
        return {
            "resources": [_resource_to_dict(r) for r in resources.resources],
            "templates": [_template_to_dict(t) for t in templates.resourceTemplates],
        }


async def read_resource_async(server: dict[str, Any], uri: str) -> dict[str, Any]:
    """按 URI 读取资源内容。"""
    async with open_session(server) as session:
        result = await session.read_resource(unquote(uri))
        return _read_resource_payload(result)


async def list_prompts_async(server: dict[str, Any]) -> list[dict[str, Any]]:
    """列出 Prompt 模板。"""
    async with open_session(server) as session:
        listed = await session.list_prompts()
        return [_prompt_to_dict(p) for p in listed.prompts]


async def get_prompt_async(
    server: dict[str, Any],
    name: str,
    arguments: dict[str, str] | None = None,
) -> dict[str, Any]:
    """按参数生成 Prompt messages。"""
    async with open_session(server) as session:
        result = await session.get_prompt(name, arguments or {})
        return _get_prompt_payload(result)
