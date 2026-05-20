#!/bin/bash
# Hermes Dashboard v2.1 — 安装脚本
# 用法: chmod +x install.sh && ./install.sh

set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GREEN}[INFO]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

echo ""
echo "  ╔══════════════════════════════════════╗"
echo "  ║   Hermes Dashboard v2.1  安装       ║"
echo "  ╚══════════════════════════════════════╝"
echo ""

# ── 环境检查 ──
info "检查运行环境..."
FAIL=0

# Python: 找 >= 3.9 的版本
PYTHON_BIN=""
for py in python3.13 python3.12 python3.11 python3.10 python3.9 python3; do
    ver=$($py -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>/dev/null || echo "0")
    maj=$(echo "$ver" | cut -d. -f1); min=$(echo "$ver" | cut -d. -f2)
    if [ "$maj" -eq 3 ] && [ "$min" -ge 9 ]; then
        PYTHON_BIN="$py"; PY_VER="$ver"; break
    fi
done
if [ -z "$PYTHON_BIN" ]; then
    warn "Python >= 3.9 未找到 (当前: $(python3 --version 2>&1 || echo 无))"
    warn "  CentOS: yum install -y python3.11"
    warn "  Ubuntu: apt install -y python3.11"
    FAIL=1
else
    info "  Python: $PY_VER ($PYTHON_BIN)"
fi

command -v node  >/dev/null 2>&1 || { warn "需要 Node.js >= 18"; FAIL=1; }
command -v nginx >/dev/null 2>&1 || { warn "需要 Nginx"; FAIL=1; }

# Node version
NV=$(node -v 2>/dev/null | grep -oP '\d+' | head -1)
[ -n "$NV" ] && [ "$NV" -ge 18 ] || { warn "Node.js >= 18 需要，当前: $(node -v 2>&1)"; FAIL=1; }

# Hermes
HERMES_OK=0
for p in "$HOME/.local/bin/hermes" "/usr/local/bin/hermes" "/usr/bin/hermes"; do
    [ -x "$p" ] && { HERMES_OK=1; info "  Hermes: $p"; break; }
done
[ "$HERMES_OK" -eq 0 ] && { warn "Hermes Agent 未安装"; FAIL=1; }

# PM2
command -v pm2 >/dev/null 2>&1 || { info "安装 PM2..."; npm install -g pm2 2>&1 | tail -1; }
info "  PM2: $(pm2 --version 2>&1)"

[ "$FAIL" -eq 1 ] && { echo ""; error "环境不满足，请安装缺失组件后重试"; }
info "环境检查通过 ✓"
echo ""

# ── 定位源码 ──
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -d "$SCRIPT_DIR/server" ] && [ -f "$SCRIPT_DIR/package.json" ]; then
    SRC_DIR="$SCRIPT_DIR"
else
    ARCHIVE=$(ls "$SCRIPT_DIR"/hermes-dashboard-*.tar.gz 2>/dev/null | head -1)
    [ -n "$ARCHIVE" ] || error "找不到源码"
    info "解压: $ARCHIVE"
    tar -xzf "$ARCHIVE" -C /root/
    SRC_DIR="/root/hermes-dashboard"
fi
cd "$SRC_DIR"
VENV_DIR="$SRC_DIR/.venv"
info "源码: $SRC_DIR"

# ── 创建虚拟环境 ──
if [ ! -f "$VENV_DIR/bin/python" ]; then
    info "创建 Python 虚拟环境..."
    $PYTHON_BIN -m venv "$VENV_DIR"
fi
PIP="$VENV_DIR/bin/pip"
PY="$VENV_DIR/bin/python"
info "  venv: $VENV_DIR"
echo ""

# ── Python 依赖 ──
WHEEL_DIR="$SRC_DIR/offline-deps/python"
info "安装 Python 依赖..."
set +e
if [ -d "$WHEEL_DIR" ] && ls "$WHEEL_DIR"/*.whl >/dev/null 2>&1; then
    info "  尝试离线安装..."
    OUT=$($PIP install --no-index --find-links="$WHEEL_DIR" fastapi uvicorn httpx bcrypt pyjwt pyyaml 2>&1)
    if [ $? -ne 0 ]; then
        warn "  离线失败，在线安装..."
        $PIP install fastapi uvicorn httpx bcrypt pyjwt pyyaml 2>&1 | tail -3
    fi
else
    $PIP install fastapi uvicorn httpx bcrypt pyjwt pyyaml 2>&1 | tail -3
fi
set -e
$PY -c "import fastapi, uvicorn, httpx, jwt, bcrypt, yaml; print('  Python 依赖 OK')" || error "Python 依赖安装失败"
echo ""

# ── Node 依赖 ──
if [ -d "$SRC_DIR/node_modules" ]; then
    info "使用内置 node_modules (离线模式)"
else
    info "安装 Node 依赖..."
    npm install 2>&1 | tail -3
fi
echo ""

# ── 构建前端 ──
if [ -d "$SRC_DIR/.next" ] && [ -f "$SRC_DIR/.next/BUILD_ID" ]; then
    info "使用内置 .next 构建产物 (离线模式)"
else
    info "构建前端..."
    npm run build 2>&1 | tail -5
fi
echo ""

# ── PM2 配置 ──
info "配置 PM2..."
API_KEY="hk-$(date +%s | md5sum | head -c 16)"
if [ -f "$HOME/.hermes/.env" ]; then
    KEY=$(grep API_SERVER_KEY "$HOME/.hermes/.env" 2>/dev/null | cut -d'=' -f2- | tr -d '"' | tr -d "'" || echo "")
    [ -n "$KEY" ] && API_KEY="$KEY"
fi
sed -i "s|\"API_SERVER_KEY\": \".*\"|\"API_SERVER_KEY\": \"$API_KEY\"|" ecosystem.config.json 2>/dev/null || true
# Use venv Python
ESC_VENV=$(echo "$VENV_DIR/bin/python" | sed 's|/|\\/|g')
sed -i "s|\"interpreter\": \"[^\"]*\"|\"interpreter\": \"$ESC_VENV\"|" ecosystem.config.json 2>/dev/null || true

read -p "访问地址 (如 app.example.com 或 192.168.1.1:8080，回车跳过): " DOMAIN
DOMAIN=$(echo "$DOMAIN" | sed 's|^https\?://||; s|/.*$||')
if [ -n "$DOMAIN" ]; then
    if echo "$DOMAIN" | grep -q ":"; then SCHEME="http"; else SCHEME="https"; fi
    sed -i "s|\"NEXT_PUBLIC_API_URL\": \".*\"|\"NEXT_PUBLIC_API_URL\": \"$SCHEME://$DOMAIN\"|" ecosystem.config.json
fi

# ── 启动 ──
info "启动服务..."
pm2 start ecosystem.config.json 2>/dev/null || pm2 restart all
pm2 save
echo ""

# ── Nginx 提示 ──
if [ -f "$SRC_DIR/nginx-example.conf" ]; then
    [ -n "$DOMAIN" ] && sed -i "s|your-domain.com|$DOMAIN|g" "$SRC_DIR/nginx-example.conf"
    info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    info "Nginx 模板: $SRC_DIR/nginx-example.conf"
    info "如需 SSL: cp nginx-example.conf /etc/nginx/conf.d/hermes-dashboard.conf"
    info "如 443 占用, 直连: http://$(hostname -I 2>/dev/null | awk '{print $1}')"
    info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
fi

echo ""
info "部署完成！"
info "  登录: admin / hermes2026"
[ -n "$DOMAIN" ] && info "  URL:  $SCHEME://$DOMAIN/login"
warn "  请登录后立即修改密码！"
echo ""
pm2 status
