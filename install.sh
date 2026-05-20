#!/bin/bash
# Hermes Dashboard v2.1 — 离线安装脚本
# 用法: chmod +x install.sh && ./install.sh

set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GREEN}[INFO]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

echo ""
echo "  ╔══════════════════════════════════════╗"
echo "  ║   Hermes Dashboard v2.1  离线安装   ║"
echo "  ╚══════════════════════════════════════╝"
echo ""

# ── 环境检查 ──
info "检查运行环境..."

FAIL=0
check_cmd() {
    command -v "$1" >/dev/null 2>&1 || { warn "缺少 $1 ($2)"; FAIL=1; }
}
check_ver() {
    local v; v=$("$1" "$3" 2>/dev/null | grep -oP '[\d]+(\.[\d]+)?' | head -1)
    [ -n "$v" ] || { warn "无法检测 $1 版本"; return; }
    local maj; maj=$(echo "$v" | cut -d. -f1)
    [ "$maj" -ge "$2" ] || { warn "$1 版本 $v < 需要 >= $2 (安装: $4)"; FAIL=1; }
}

# Python 版本检查（支持 python3.9+ 多版本共存）
PYTHON_BIN=""
for py in python3.13 python3.12 python3.11 python3.10 python3.9 python3; do
    if command -v "$py" >/dev/null 2>&1; then
        PY_VER=$("$py" -c "import sys; print(sys.version_info.minor)" 2>/dev/null || echo 0)
        PY_MAJ=$("$py" -c "import sys; print(sys.version_info.major)" 2>/dev/null || echo 0)
        if [ "$PY_MAJ" -ge 3 ] && [ "$PY_VER" -ge 9 ]; then
            PYTHON_BIN="$py"; break
        fi
    fi
done
if [ -z "$PYTHON_BIN" ]; then
    warn "Python >= 3.9 未找到"
    warn "  当前版本: $($(command -v python3 || echo python3) --version 2>&1)"
    warn "  安装: yum install -y python3.11 或 apt install -y python3.11"
    FAIL=1
else
    info "  Python: $($PYTHON_BIN --version 2>&1) ($PYTHON_BIN)"
fi

check_cmd node "Node.js >= 18"
check_cmd npm  "npm"
check_cmd nginx "Nginx >= 1.20"

# Node 版本
NODE_VER=$(node -v 2>/dev/null | grep -oP '\d+' | head -1)
[ -n "$NODE_VER" ] && [ "$NODE_VER" -ge 18 ] || { warn "Node.js >= 18 需要，当前: $(node -v 2>&1)"; FAIL=1; }

# Hermes Agent
HERMES_OK=0
for p in "$HOME/.local/bin/hermes" "/usr/local/bin/hermes" "/usr/bin/hermes"; do
    [ -x "$p" ] && { HERMES_OK=1; info "  Hermes: $p"; break; }
done
[ "$HERMES_OK" -eq 0 ] && { warn "Hermes Agent 未安装"; FAIL=1; }

# PM2
if ! command -v pm2 >/dev/null 2>&1; then
    info "安装 PM2..."
    npm install -g pm2 2>&1 | tail -1
fi
info "  PM2: $(pm2 --version 2>&1)"

if [ "$FAIL" -eq 1 ]; then
    echo ""
    error "环境不满足，请安装缺失组件后重试"
fi

info "环境检查通过 ✓"
echo ""

# ── 定位源码 ──
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -d "$SCRIPT_DIR/server" ] && [ -f "$SCRIPT_DIR/package.json" ]; then
    SRC_DIR="$SCRIPT_DIR"
else
    # 查找源码包
    ARCHIVE=$(ls "$SCRIPT_DIR"/hermes-dashboard-*.tar.gz 2>/dev/null | head -1)
    if [ -n "$ARCHIVE" ]; then
        info "解压: $ARCHIVE"
        tar -xzf "$ARCHIVE" -C /root/
        SRC_DIR="/root/hermes-dashboard"
    else
        error "找不到源码，请将 install.sh 放在源码目录或与 .tar.gz 同目录"
    fi
fi

cd "$SRC_DIR"
info "源码: $SRC_DIR"
echo ""

# ── Python 依赖 ──
WHEEL_DIR="$SRC_DIR/offline-deps/python"
info "安装 Python 依赖 (使用 $PYTHON_BIN)..."

set +e  # Allow pip failures without aborting
_pip_install() {
    if [ -d "$WHEEL_DIR" ] && ls "$WHEEL_DIR"/*.whl >/dev/null 2>&1; then
        $PYTHON_BIN -m pip install --no-index --find-links="$WHEEL_DIR" fastapi uvicorn httpx bcrypt pyjwt pyyaml 2>&1
    else
        $PYTHON_BIN -m pip install -r "$SRC_DIR/requirements.txt" 2>&1
    fi
}

PIP_OUT=$(_pip_install); PIP_RC=$?
# If offline wheels failed (wrong arch), fall back to online
if [ $PIP_RC -ne 0 ] && [ -d "$WHEEL_DIR" ] && ls "$WHEEL_DIR"/*.whl >/dev/null 2>&1; then
    warn "离线 wheels 不可用（可能架构不匹配），尝试在线安装..."
    $PYTHON_BIN -m pip install --break-system-packages -r "$SRC_DIR/requirements.txt" 2>&1 | tail -5
elif echo "$PIP_OUT" | grep -q "externally-managed-environment\|--break-system-packages"; then
    warn "检测到 PEP 668 保护，使用 --break-system-packages"
    if [ -d "$WHEEL_DIR" ] && ls "$WHEEL_DIR"/*.whl >/dev/null 2>&1; then
        $PYTHON_BIN -m pip install --break-system-packages --no-index --find-links="$WHEEL_DIR" fastapi uvicorn httpx bcrypt pyjwt pyyaml 2>&1 | tail -3
    else
        $PYTHON_BIN -m pip install --break-system-packages -r "$SRC_DIR/requirements.txt" 2>&1 | tail -3
    fi
elif [ -n "$PIP_OUT" ]; then
    echo "$PIP_OUT" | tail -3
fi
$PYTHON_BIN -c "import fastapi, uvicorn, httpx, jwt, bcrypt, yaml; print('  Python 依赖 OK')" || error "Python 依赖安装失败"
set -e  # Re-enable strict mode
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
API_KEY="your-api-key-$(date +%s)"
if [ -f "$HOME/.hermes/.env" ]; then
    KEY=$(grep API_SERVER_KEY "$HOME/.hermes/.env" 2>/dev/null | cut -d'=' -f2- | tr -d '"' | tr -d "'" || echo "")
    [ -n "$KEY" ] && API_KEY="$KEY"
fi
sed -i "s|\"API_SERVER_KEY\": \".*\"|\"API_SERVER_KEY\": \"$API_KEY\"|" ecosystem.config.json 2>/dev/null || true

read -p "输入域名 (如 app.example.com，不要加 http://，回车跳过): " DOMAIN
# 自动去掉用户可能输入的协议前缀
DOMAIN=$(echo "$DOMAIN" | sed 's|^https\?://||; s|:[0-9]*$||; s|/.*$||')
[ -n "$DOMAIN" ] && sed -i "s|\"NEXT_PUBLIC_API_URL\": \".*\"|\"NEXT_PUBLIC_API_URL\": \"https://$DOMAIN\"|" ecosystem.config.json

# 更新 Python 解释器路径（sed 特殊字符转义）
PY_FULL=$(command -v "$PYTHON_BIN")
ESC_PATH=$(echo "$PY_FULL" | sed 's/\//\\\//g')
sed -i "s|\"interpreter\": \"[^\"]*\"|\"interpreter\": \"$ESC_PATH\"|" ecosystem.config.json 2>/dev/null || true

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
    info "执行以下命令完成配置:"
    info "  cp $SRC_DIR/nginx-example.conf /etc/nginx/conf.d/hermes-dashboard.conf"
    info "  nginx -t && nginx -s reload"
    info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
fi

echo ""
info "部署完成！"
info "  登录: admin / hermes2026"
info "  URL:  https://${DOMAIN:-你的IP}/login"
warn "  请登录后立即修改密码！"
echo ""
pm2 status
