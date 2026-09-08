# MCP Doc

MCP 服务器管理、工具调试与文档生成。

技术栈：FastAPI + React/Vite + SQLite。

## 界面预览

### 工具调试

![工具调试](docs/screenshots/01-overview.png)

### 资源

![资源](docs/screenshots/02-resources.png)

### 提示词

![提示词](docs/screenshots/03-prompts.png)

### 文档与导出

![文档](docs/screenshots/04-docs.png)

## 本地开发

### 后端

```bash
pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple
python -m backend.run
```

后端默认监听 **8765**，路径前缀 **/mcp-doc**：页面 `/mcp-doc/`，接口 `/mcp-doc/api`。

### 前端（可选，热更新）

```bash
cd frontend
npm install --registry=https://registry.npmmirror.com
npm run dev
```

开发服务器默认 **5173**，访问 `http://127.0.0.1:5173/mcp-doc/`，`/mcp-doc/api` 代理到后端 8765。

仅跑后端时需先构建前端：

```bash
cd frontend && npm run build
```

## Docker 部署

```bash
docker build -t mcp-doc .
docker run -d \
  --name mcp-doc \
  -p 8765:8765 \
  -v /path/to/data:/app/data \
  mcp-doc
```

| 变量 | 说明 | 默认 |
|------|------|------|
| `MCP_DOC_PORT` | 服务端口 | `8765` |
| `MCP_DOC_RELOAD` | 开发热重载 | 关闭 |

访问：`http://<主机>:8765/mcp-doc/`

## 能力

- MCP 服务器 CRUD：HTTP（URL + Headers）与 STDIO（command / args / env / cwd）
- 连接探测：延迟与失败原因
- 工具：标签筛选、schema 调试、annotations（read-only / destructive 等）
- 资源：列表 / 模板、按 URI 读取、保存到文档
- 提示词：列表、填参预览 messages、保存到文档
- 文档页与 Markdown / HTML / PDF 导出（工具 + 资源 + 提示词）
- 调用历史：追加时间线（参数 / 结果 / 耗时 / 错误），支持筛选、重放、保存到文档

## 联调服务（可选）

```bash
# HTTP + Bearer
python demo_server/server.py

# STDIO（无 HTTP 鉴权）
python demo_server/stdio_main.py
```

HTTP 默认 `http://127.0.0.1:8766/mcp`，Header：`Authorization: Bearer demo-token`（可用 `DEMO_MCP_TOKEN` 覆盖）。

STDIO 服务器配置示例：command=`python`，args=`["demo_server/stdio_main.py"]`，cwd 为项目根目录。

## 目录

- `backend/` — API 与 MCP 客户端
- `frontend/` — 管理界面
- `demo_server/` — 联调 MCP
- `docs/screenshots/` — README 界面截图
- `data/` — SQLite
