#!/bin/bash
# Hermes Dashboard v2.1.0 — 离线安装脚本
# 用法: chmod +x install.sh && ./install.sh

set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GREEN}[INFO]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

INSTALL_DIR="/root/hermes-dashboard"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# ── 环境检查 ──
info "检查环境..."
command -v node    >/dev/null 2>&1 || error "需要 Node.js >= 18"
command -v npm     >/dev/null 2>&1 || error "需要 npm"
command -v python3 >/dev/null 2>&1 || error "需要 Python >= 3.9"
command -v nginx   >/dev/null 2>&1 || error "需要 Nginx"
command -v pm2     >/dev/null 2>&1 || { info "安装 PM2..."; npm install -g pm2; }

NODE_VER=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
[ "$NODE_VER" -ge 18 ] || error "Node.js >= 18 需要，当前: $(node -v)"

if [ ! -x "$HOME/.local/bin/hermes" ] && [ ! -x "/usr/local/bin/hermes" ]; then
    error "Hermes Agent 未安装，请先安装"
fi

# ── 解压源码 ──
if [ -d "$SCRIPT_DIR/server" ] && [ -f "$SCRIPT_DIR/package.json" ]; then
    SRC_DIR="$SCRIPT_DIR"
elif [ -f "$SCRIPT_DIR/hermes-dashboard-v2.1.0-src-20260520.tar.gz" ]; then
    info "解压源码包..."
    tar -xzf "$SCRIPT_DIR/hermes-dashboard-v2.1.0-src-20260520.tar.gz" -C /root/
    SRC_DIR="/root/hermes-dashboard"
else
    error "找不到源码，请将脚本放在源码目录或源码包同目录"
fi

cd "$SRC_DIR"
info "源码路径: $SRC_DIR"

# ── Python 依赖 (离线) ──
WHEEL_DIR="$SRC_DIR/offline-deps/python"
if [ -d "$WHEEL_DIR" ] && ls "$WHEEL_DIR"/*.whl >/dev/null 2>&1; then
    info "离线安装 Python 依赖..."
    pip3 install --no-index --find-links="$WHEEL_DIR" fastapi uvicorn httpx bcrypt pyjwt pyyaml
else
    info "在线安装 Python 依赖..."
    pip3 install -r requirements.txt
fi
python3 -c "import fastapi, uvicorn, httpx, jwt, bcrypt, yaml; print('Python OK')" || error "Python 依赖安装失败"

# ── Node 依赖 ──
if [ -d "$SRC_DIR/node_modules" ] && [ -f "$SRC_DIR/node_modules/.package-lock.json" ]; then
    info "使用内置 node_modules (离线模式)"
else
    info "安装 Node 依赖..."
    npm install 2>&1 | tail -3
fi

# ── 构建前端 ──
if [ -d "$SRC_DIR/.next" ] && [ -f "$SRC_DIR/.next/BUILD_ID" ]; then
    info "使用内置 .next 构建产物 (离线模式)"
else
    info "构建前端..."
    npm run build 2>&1 | tail -5
fi

# ── PM2 配置 ──
info "配置 PM2..."
API_KEY="your-api-key"
if [ -f "$HOME/.hermes/.env" ]; then
    KEY=$(grep API_SERVER_KEY "$HOME/.hermes/.env" 2>/dev/null | cut -d'=' -f2- | tr -d '"' | tr -d "'" || echo "")
    [ -n "$KEY" ] && API_KEY="$KEY"
fi
sed -i "s/\"API_SERVER_KEY\": \".*\"/\"API_SERVER_KEY\": \"$API_KEY\"/" ecosystem.config.json 2>/dev/null || true

read -p "输入域名 (如 app.example.com，回车跳过): " DOMAIN
[ -n "$DOMAIN" ] && sed -i "s|\"NEXT_PUBLIC_API_URL\": \".*\"|\"NEXT_PUBLIC_API_URL\": \"https://$DOMAIN\"|" ecosystem.config.json

# ── 启动 ──
pm2 start ecosystem.config.json 2>/dev/null || pm2 restart all
pm2 save
info "服务已启动"

# ── Nginx 提示 ──
if [ -f "$SRC_DIR/nginx-example.conf" ]; then
    info ""
    info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    info "Nginx 配置模板: $SRC_DIR/nginx-example.conf"
    info "请替换 your-domain.com 和 SSL 证书路径后执行:"
    info "  cp $SRC_DIR/nginx-example.conf /etc/nginx/conf.d/hermes-dashboard.conf"
    info "  nginx -t && nginx -s reload"
    info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
fi

info ""
info "部署完成！"
info "登录: admin / hermes2026"
info "URL:  https://${DOMAIN:-你的IP}/login"
warn "请登录后立即修改密码！"
echo ""
pm2 status
