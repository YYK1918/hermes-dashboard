# ── 构建阶段：编译前端 ──
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# ── 运行阶段：Alpine 最小镜像 ──
FROM node:22-alpine
WORKDIR /app

# Python 3 + venv
RUN apk add --no-cache python3 py3-pip && python3 -m venv /app/.venv

# 前端构建产物
COPY --from=builder /app/.next/ ./.next/
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/next.config.ts ./

# 后端源码 + Python 依赖
COPY server/ ./server/
COPY requirements.txt ./
RUN /app/.venv/bin/pip install --no-cache-dir fastapi uvicorn httpx bcrypt pyjwt pyyaml

# PM2 进程管理
RUN npm install -g pm2

# 配置
COPY ecosystem.config.json ./

EXPOSE 3000 8643

CMD ["pm2-runtime", "start", "ecosystem.config.json"]
