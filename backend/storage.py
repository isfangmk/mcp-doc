# -*- coding: utf-8 -*-
"""SQLite 持久化：MCP 服务器配置与 Tools / Resources / Prompts 调试结果。"""
from __future__ import annotations

import json
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# 数据目录固定在项目根下，便于 Docker 挂载
DATA_DIR = Path(__file__).resolve().parent.parent / "data"
DB_PATH = DATA_DIR / "mcp_doc.db"


def _now_iso() -> str:
    """返回 UTC ISO 时间戳，统一写入库内时间字段。"""
    return datetime.now(timezone.utc).isoformat()


def _connect() -> sqlite3.Connection:
    """打开 SQLite，并启用外键约束。"""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def _table_columns(conn: sqlite3.Connection, table: str) -> set[str]:
    """读取表已有列名，用于增量升级。"""
    rows = conn.execute(f"PRAGMA table_info({table})").fetchall()
    return {r[1] for r in rows}


def _ensure_column(conn: sqlite3.Connection, table: str, column: str, typedef: str) -> None:
    """若列不存在则 ALTER TABLE 追加，避免破坏已有数据。"""
    if column not in _table_columns(conn, table):
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {typedef}")


def init_db() -> None:
    """创建/升级服务器表与 Tools、Resources、Prompts 相关结果表。"""
    with _connect() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS servers (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                url TEXT NOT NULL DEFAULT '',
                headers_json TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS tool_results (
                id TEXT PRIMARY KEY,
                server_id TEXT NOT NULL,
                tool_name TEXT NOT NULL,
                arguments_json TEXT NOT NULL DEFAULT '{}',
                result_text TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS tool_last_runs (
                server_id TEXT NOT NULL,
                tool_name TEXT NOT NULL,
                arguments_json TEXT NOT NULL DEFAULT '{}',
                result_text TEXT NOT NULL,
                is_error INTEGER NOT NULL DEFAULT 0,
                updated_at TEXT NOT NULL,
                PRIMARY KEY (server_id, tool_name),
                FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS resource_results (
                id TEXT PRIMARY KEY,
                server_id TEXT NOT NULL,
                uri TEXT NOT NULL,
                arguments_json TEXT NOT NULL DEFAULT '{}',
                result_text TEXT NOT NULL,
                mime_type TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS prompt_results (
                id TEXT PRIMARY KEY,
                server_id TEXT NOT NULL,
                prompt_name TEXT NOT NULL,
                arguments_json TEXT NOT NULL DEFAULT '{}',
                result_text TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS prompt_last_runs (
                server_id TEXT NOT NULL,
                prompt_name TEXT NOT NULL,
                arguments_json TEXT NOT NULL DEFAULT '{}',
                result_text TEXT NOT NULL,
                is_error INTEGER NOT NULL DEFAULT 0,
                updated_at TEXT NOT NULL,
                PRIMARY KEY (server_id, prompt_name),
                FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
            );
            """
        )
        # 存量库升级：补齐 HTTP / STDIO 双传输字段
        _ensure_column(conn, "servers", "transport", "TEXT NOT NULL DEFAULT 'http'")
        _ensure_column(conn, "servers", "command", "TEXT NOT NULL DEFAULT ''")
        _ensure_column(conn, "servers", "args_json", "TEXT NOT NULL DEFAULT '[]'")
        _ensure_column(conn, "servers", "env_json", "TEXT NOT NULL DEFAULT '{}'")
        _ensure_column(conn, "servers", "cwd", "TEXT NOT NULL DEFAULT ''")


def _row_to_server(row: sqlite3.Row) -> dict[str, Any]:
    """将服务器行转为前端使用的完整字段结构。"""
    keys = row.keys()
    return {
        "id": row["id"],
        "name": row["name"],
        "transport": row["transport"] if "transport" in keys else "http",
        "url": row["url"] or "",
        "headers": json.loads(row["headers_json"] or "{}"),
        "command": row["command"] if "command" in keys else "",
        "args": json.loads(row["args_json"] if "args_json" in keys else "[]"),
        "env": json.loads(row["env_json"] if "env_json" in keys else "{}"),
        "cwd": row["cwd"] if "cwd" in keys else "",
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def list_servers() -> list[dict[str, Any]]:
    """返回全部已配置的 MCP 服务器。"""
    with _connect() as conn:
        rows = conn.execute(
            "SELECT * FROM servers ORDER BY created_at ASC"
        ).fetchall()
    return [_row_to_server(r) for r in rows]


def get_server(server_id: str) -> dict[str, Any] | None:
    """按 id 取单个服务器，不存在则返回 None。"""
    with _connect() as conn:
        row = conn.execute(
            "SELECT * FROM servers WHERE id = ?",
            (server_id,),
        ).fetchone()
    return _row_to_server(row) if row else None


def add_server(
    name: str,
    transport: str,
    url: str = "",
    headers: dict[str, str] | None = None,
    command: str = "",
    args: list[str] | None = None,
    env: dict[str, str] | None = None,
    cwd: str = "",
) -> dict[str, Any]:
    """新增服务器配置并返回完整记录。"""
    server_id = uuid.uuid4().hex
    now = _now_iso()
    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO servers (
                id, name, transport, url, headers_json,
                command, args_json, env_json, cwd,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                server_id,
                name.strip(),
                transport,
                (url or "").strip(),
                json.dumps(headers or {}, ensure_ascii=False),
                (command or "").strip(),
                json.dumps(args or [], ensure_ascii=False),
                json.dumps(env or {}, ensure_ascii=False),
                (cwd or "").strip(),
                now,
                now,
            ),
        )
    server = get_server(server_id)
    assert server is not None
    return server


def update_server(
    server_id: str,
    name: str,
    transport: str,
    url: str = "",
    headers: dict[str, str] | None = None,
    command: str = "",
    args: list[str] | None = None,
    env: dict[str, str] | None = None,
    cwd: str = "",
) -> bool:
    """更新服务器全部传输字段；找不到记录时返回 False。"""
    if get_server(server_id) is None:
        return False
    with _connect() as conn:
        conn.execute(
            """
            UPDATE servers SET
                name = ?, transport = ?, url = ?, headers_json = ?,
                command = ?, args_json = ?, env_json = ?, cwd = ?,
                updated_at = ?
            WHERE id = ?
            """,
            (
                name.strip(),
                transport,
                (url or "").strip(),
                json.dumps(headers or {}, ensure_ascii=False),
                (command or "").strip(),
                json.dumps(args or [], ensure_ascii=False),
                json.dumps(env or {}, ensure_ascii=False),
                (cwd or "").strip(),
                _now_iso(),
                server_id,
            ),
        )
    return True


def delete_server(server_id: str) -> bool:
    """删除服务器及其关联调试结果（外键 CASCADE）。"""
    with _connect() as conn:
        cur = conn.execute("DELETE FROM servers WHERE id = ?", (server_id,))
        return cur.rowcount > 0


# ---------- Tools ----------


def save_tool_result(
    server_id: str,
    tool_name: str,
    arguments: dict[str, Any] | None,
    result_text: str,
) -> dict[str, Any]:
    """保存一次成功的工具调试输出（同工具仅保留最新一份）。"""
    result_id = uuid.uuid4().hex
    now = _now_iso()
    args_json = json.dumps(arguments or {}, ensure_ascii=False)
    with _connect() as conn:
        # 只覆盖文档保存，保留 last_runs 供表单回填
        conn.execute(
            "DELETE FROM tool_results WHERE server_id = ? AND tool_name = ?",
            (server_id, tool_name),
        )
        conn.execute(
            "INSERT INTO tool_results "
            "(id, server_id, tool_name, arguments_json, result_text, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (result_id, server_id, tool_name, args_json, result_text, now),
        )
    return {
        "id": result_id,
        "server_id": server_id,
        "tool_name": tool_name,
        "arguments": arguments or {},
        "result": result_text,
        "created_at": now,
    }


def list_saved_summaries(server_id: str) -> tuple[list[str], dict[str, dict[str, Any]]]:
    """
    返回该服务器已保存工具名列表，以及各工具最近一次保存的 arguments。
    用于工具页展示「已保存」标记与表单回填。
    """
    with _connect() as conn:
        rows = conn.execute(
            "SELECT tool_name, arguments_json, created_at FROM tool_results "
            "WHERE server_id = ? ORDER BY created_at DESC",
            (server_id,),
        ).fetchall()
    names: list[str] = []
    args_map: dict[str, dict[str, Any]] = {}
    for row in rows:
        name = row["tool_name"]
        if name in args_map:
            continue
        names.append(name)
        args_map[name] = json.loads(row["arguments_json"] or "{}")
    return names, args_map


def list_saved_results(server_id: str) -> list[dict[str, Any]]:
    """列出服务器下每个工具最近一次保存记录（用于文档页）。"""
    with _connect() as conn:
        rows = conn.execute(
            "SELECT id, server_id, tool_name, arguments_json, result_text, created_at "
            "FROM tool_results WHERE server_id = ? ORDER BY created_at DESC",
            (server_id,),
        ).fetchall()
    seen: set[str] = set()
    out: list[dict[str, Any]] = []
    for row in rows:
        name = row["tool_name"]
        if name in seen:
            continue
        seen.add(name)
        out.append(_row_to_tool_result(row))
    return out


def clear_tool_saved(server_id: str, tool_name: str) -> int:
    """清除某工具的文档保存与上次运行记录。"""
    with _connect() as conn:
        cur = conn.execute(
            "DELETE FROM tool_results WHERE server_id = ? AND tool_name = ?",
            (server_id, tool_name),
        )
        deleted = cur.rowcount
        conn.execute(
            "DELETE FROM tool_last_runs WHERE server_id = ? AND tool_name = ?",
            (server_id, tool_name),
        )
        return deleted


def upsert_last_run(
    server_id: str,
    tool_name: str,
    arguments: dict[str, Any] | None,
    result_text: str,
    is_error: bool,
) -> None:
    """写入或覆盖某工具最近一次运行的参数与结果。"""
    now = _now_iso()
    args_json = json.dumps(arguments or {}, ensure_ascii=False)
    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO tool_last_runs
                (server_id, tool_name, arguments_json, result_text, is_error, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(server_id, tool_name) DO UPDATE SET
                arguments_json = excluded.arguments_json,
                result_text = excluded.result_text,
                is_error = excluded.is_error,
                updated_at = excluded.updated_at
            """,
            (server_id, tool_name, args_json, result_text, 1 if is_error else 0, now),
        )


def list_last_runs(server_id: str) -> dict[str, dict[str, Any]]:
    """返回该服务器各工具最近一次运行记录，键为工具名。"""
    with _connect() as conn:
        rows = conn.execute(
            "SELECT tool_name, arguments_json, result_text, is_error, updated_at "
            "FROM tool_last_runs WHERE server_id = ?",
            (server_id,),
        ).fetchall()
    out: dict[str, dict[str, Any]] = {}
    for row in rows:
        out[row["tool_name"]] = {
            "arguments": json.loads(row["arguments_json"] or "{}"),
            "result": row["result_text"],
            "is_error": bool(row["is_error"]),
            "updated_at": row["updated_at"],
        }
    return out


def _row_to_tool_result(row: sqlite3.Row) -> dict[str, Any]:
    """将 tool_results 行转为字典。"""
    return {
        "id": row["id"],
        "server_id": row["server_id"],
        "tool_name": row["tool_name"],
        "arguments": json.loads(row["arguments_json"] or "{}"),
        "result": row["result_text"],
        "created_at": row["created_at"],
    }


# ---------- Resources ----------


def save_resource_result(
    server_id: str,
    uri: str,
    result_text: str,
    arguments: dict[str, Any] | None = None,
    mime_type: str = "",
) -> dict[str, Any]:
    """保存资源读取结果（同 URI 仅保留最新一份）。"""
    result_id = uuid.uuid4().hex
    now = _now_iso()
    args_json = json.dumps(arguments or {}, ensure_ascii=False)
    with _connect() as conn:
        conn.execute(
            "DELETE FROM resource_results WHERE server_id = ? AND uri = ?",
            (server_id, uri),
        )
        conn.execute(
            "INSERT INTO resource_results "
            "(id, server_id, uri, arguments_json, result_text, mime_type, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (result_id, server_id, uri, args_json, result_text, mime_type or "", now),
        )
    return {
        "id": result_id,
        "server_id": server_id,
        "uri": uri,
        "arguments": arguments or {},
        "result": result_text,
        "mime_type": mime_type or "",
        "created_at": now,
    }


def list_saved_resource_uris(server_id: str) -> list[str]:
    """列出已保存过结果的资源 URI。"""
    with _connect() as conn:
        rows = conn.execute(
            "SELECT uri, created_at FROM resource_results "
            "WHERE server_id = ? ORDER BY created_at DESC",
            (server_id,),
        ).fetchall()
    seen: set[str] = set()
    out: list[str] = []
    for row in rows:
        uri = row["uri"]
        if uri in seen:
            continue
        seen.add(uri)
        out.append(uri)
    return out


def list_resource_saved_arguments(server_id: str) -> dict[str, dict[str, Any]]:
    """返回各已保存资源最近一次 arguments，键为 URI。"""
    with _connect() as conn:
        rows = conn.execute(
            "SELECT uri, arguments_json, created_at FROM resource_results "
            "WHERE server_id = ? ORDER BY created_at DESC",
            (server_id,),
        ).fetchall()
    out: dict[str, dict[str, Any]] = {}
    for row in rows:
        uri = row["uri"]
        if uri in out:
            continue
        out[uri] = json.loads(row["arguments_json"] or "{}")
    return out


def list_saved_resource_results(server_id: str) -> list[dict[str, Any]]:
    """列出每个 URI 最近一次保存记录（用于文档页）。"""
    with _connect() as conn:
        rows = conn.execute(
            "SELECT id, server_id, uri, arguments_json, result_text, mime_type, created_at "
            "FROM resource_results WHERE server_id = ? ORDER BY created_at DESC",
            (server_id,),
        ).fetchall()
    seen: set[str] = set()
    out: list[dict[str, Any]] = []
    for row in rows:
        uri = row["uri"]
        if uri in seen:
            continue
        seen.add(uri)
        out.append(
            {
                "id": row["id"],
                "server_id": row["server_id"],
                "uri": uri,
                "arguments": json.loads(row["arguments_json"] or "{}"),
                "result": row["result_text"],
                "mime_type": row["mime_type"] or "",
                "created_at": row["created_at"],
            }
        )
    return out


def clear_resource_saved(server_id: str, uri: str) -> int:
    """清除某 URI 的文档保存。"""
    with _connect() as conn:
        cur = conn.execute(
            "DELETE FROM resource_results WHERE server_id = ? AND uri = ?",
            (server_id, uri),
        )
        return cur.rowcount


# ---------- Prompts ----------


def save_prompt_result(
    server_id: str,
    prompt_name: str,
    result_text: str,
    arguments: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """保存 Prompt 生成结果（同名仅保留最新一份）。"""
    result_id = uuid.uuid4().hex
    now = _now_iso()
    args_json = json.dumps(arguments or {}, ensure_ascii=False)
    with _connect() as conn:
        conn.execute(
            "DELETE FROM prompt_results WHERE server_id = ? AND prompt_name = ?",
            (server_id, prompt_name),
        )
        conn.execute(
            "INSERT INTO prompt_results "
            "(id, server_id, prompt_name, arguments_json, result_text, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (result_id, server_id, prompt_name, args_json, result_text, now),
        )
    return {
        "id": result_id,
        "server_id": server_id,
        "prompt_name": prompt_name,
        "arguments": arguments or {},
        "result": result_text,
        "created_at": now,
    }


def list_saved_prompt_names(server_id: str) -> list[str]:
    """列出已保存过结果的 Prompt 名称。"""
    with _connect() as conn:
        rows = conn.execute(
            "SELECT prompt_name, created_at FROM prompt_results "
            "WHERE server_id = ? ORDER BY created_at DESC",
            (server_id,),
        ).fetchall()
    seen: set[str] = set()
    out: list[str] = []
    for row in rows:
        name = row["prompt_name"]
        if name in seen:
            continue
        seen.add(name)
        out.append(name)
    return out


def list_prompt_saved_arguments(server_id: str) -> dict[str, dict[str, Any]]:
    """返回各已保存 Prompt 最近一次 arguments。"""
    with _connect() as conn:
        rows = conn.execute(
            "SELECT prompt_name, arguments_json, created_at FROM prompt_results "
            "WHERE server_id = ? ORDER BY created_at DESC",
            (server_id,),
        ).fetchall()
    out: dict[str, dict[str, Any]] = {}
    for row in rows:
        name = row["prompt_name"]
        if name in out:
            continue
        out[name] = json.loads(row["arguments_json"] or "{}")
    return out


def list_saved_prompt_results(server_id: str) -> list[dict[str, Any]]:
    """列出每个 Prompt 最近一次保存记录（用于文档页）。"""
    with _connect() as conn:
        rows = conn.execute(
            "SELECT id, server_id, prompt_name, arguments_json, result_text, created_at "
            "FROM prompt_results WHERE server_id = ? ORDER BY created_at DESC",
            (server_id,),
        ).fetchall()
    seen: set[str] = set()
    out: list[dict[str, Any]] = []
    for row in rows:
        name = row["prompt_name"]
        if name in seen:
            continue
        seen.add(name)
        out.append(
            {
                "id": row["id"],
                "server_id": row["server_id"],
                "prompt_name": name,
                "arguments": json.loads(row["arguments_json"] or "{}"),
                "result": row["result_text"],
                "created_at": row["created_at"],
            }
        )
    return out


def clear_prompt_saved(server_id: str, prompt_name: str) -> int:
    """清除某 Prompt 的文档保存与上次运行记录。"""
    with _connect() as conn:
        cur = conn.execute(
            "DELETE FROM prompt_results WHERE server_id = ? AND prompt_name = ?",
            (server_id, prompt_name),
        )
        deleted = cur.rowcount
        conn.execute(
            "DELETE FROM prompt_last_runs WHERE server_id = ? AND prompt_name = ?",
            (server_id, prompt_name),
        )
        return deleted


def upsert_prompt_last_run(
    server_id: str,
    prompt_name: str,
    arguments: dict[str, Any] | None,
    result_text: str,
    is_error: bool,
) -> None:
    """写入或覆盖某 Prompt 最近一次 Get 的参数与结果。"""
    now = _now_iso()
    args_json = json.dumps(arguments or {}, ensure_ascii=False)
    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO prompt_last_runs
                (server_id, prompt_name, arguments_json, result_text, is_error, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(server_id, prompt_name) DO UPDATE SET
                arguments_json = excluded.arguments_json,
                result_text = excluded.result_text,
                is_error = excluded.is_error,
                updated_at = excluded.updated_at
            """,
            (server_id, prompt_name, args_json, result_text, 1 if is_error else 0, now),
        )


def list_prompt_last_runs(server_id: str) -> dict[str, dict[str, Any]]:
    """返回该服务器各 Prompt 最近一次运行记录。"""
    with _connect() as conn:
        rows = conn.execute(
            "SELECT prompt_name, arguments_json, result_text, is_error, updated_at "
            "FROM prompt_last_runs WHERE server_id = ?",
            (server_id,),
        ).fetchall()
    out: dict[str, dict[str, Any]] = {}
    for row in rows:
        out[row["prompt_name"]] = {
            "arguments": json.loads(row["arguments_json"] or "{}"),
            "result": row["result_text"],
            "is_error": bool(row["is_error"]),
            "updated_at": row["updated_at"],
        }
    return out


def clear_server_saved(server_id: str) -> int:
    """清除某服务器下 Tools / Resources / Prompts 全部保存与上次运行记录。"""
    with _connect() as conn:
        total = 0
        for table in (
            "tool_results",
            "tool_last_runs",
            "resource_results",
            "prompt_results",
            "prompt_last_runs",
        ):
            cur = conn.execute(f"DELETE FROM {table} WHERE server_id = ?", (server_id,))
            total += cur.rowcount
        return total
