# ── 构建阶段：编译前端 ──
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# ── 运行阶段：最小化镜像 ──
FROM node:22-alpine
WORKDIR /app

# 安装 Python 3 + pip（最小依赖）
RUN apk add --no-cache python3 py3-pip && python3 -m venv /app/.venv

# 复制前端构建产物
COPY --from=builder /app/.next/ ./.next/
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/next.config.ts ./

# 复制后端源码
COPY server/ ./server/
COPY requirements.txt ./
COPY ecosystem.config.json ./
COPY install.sh ./

# 安装 Python 依赖
RUN /app/.venv/bin/pip install --no-cache-dir fastapi uvicorn httpx bcrypt pyjwt pyyaml

# 安装 PM2（轻量进程管理）
RUN npm install -g pm2

EXPOSE 3000 8643

CMD ["pm2-runtime", "start", "ecosystem.config.json"]
