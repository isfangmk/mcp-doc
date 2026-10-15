# 阶段一：构建前端
FROM node:20-alpine AS frontend-builder
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --registry=https://registry.npmmirror.com
COPY frontend/ ./
RUN npm run build

# 阶段二：后端运行时 + 前端静态资源（使用 uv 管理依赖）
FROM python:3.12-slim
WORKDIR /app

# 安装 uv：从阿里云 PyPI 安装二进制（国内源），不再依赖 ghcr 镜像
RUN pip install --no-cache-dir uv==0.9.6 \
    -i https://mirrors.aliyun.com/pypi/simple/ \
    --trusted-host mirrors.aliyun.com

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/app/.venv \
    UV_PYTHON_INSTALL_MIRROR=https://mirrors.nju.edu.cn/github-release/astral-sh/python-build-standalone \
    PATH="/app/.venv/bin:$PATH" \
    PYTHONPATH=/app \
    MCP_DOC_PORT=8765

# 先只拷贝依赖清单，命中 Docker 层缓存
COPY pyproject.toml uv.lock .python-version ./
RUN uv sync --frozen --no-dev

COPY backend ./backend
COPY --from=frontend-builder /build/dist ./frontend/dist

VOLUME ["/app/data"]
EXPOSE 8765

CMD ["uv", "run", "--no-sync", "python", "-m", "backend.run"]
