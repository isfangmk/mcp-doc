# 阶段一：构建前端
FROM node:20-alpine AS frontend-builder
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --registry=https://registry.npmmirror.com
COPY frontend/ ./
RUN npm run build

# 阶段二：后端运行时 + 前端静态资源
FROM python:3.12-slim
WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt \
    -i https://pypi.tuna.tsinghua.edu.cn/simple \
    --trusted-host pypi.tuna.tsinghua.edu.cn

COPY backend ./backend
COPY --from=frontend-builder /build/dist ./frontend/dist

ENV PYTHONPATH=/app
ENV MCP_DOC_PORT=8765

VOLUME ["/app/data"]
EXPOSE 8765

CMD ["python", "-m", "backend.run"]
