#!/bin/bash
# Hermes Agent Dashboard — 一键启动
# 同时启动数据中间层 (8643) 和前端 (3000)

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== Hermes Dashboard ==="
echo ""

# Kill any existing processes on these ports
kill $(lsof -ti:8643 2>/dev/null) 2>/dev/null || true
kill $(lsof -ti:3000 2>/dev/null) 2>/dev/null || true
sleep 1

echo "[1/2] 启动 API 数据中间层 (端口 8643)..."
cd "$SCRIPT_DIR/server"
python3 api.py &
API_PID=$!
sleep 2

# Verify API
if curl -s http://localhost:8643/api/health > /dev/null 2>&1; then
    echo "  ✓ API 服务器就绪"
else
    echo "  ✗ API 服务器启动失败"
    exit 1
fi

echo "[2/2] 启动前端开发服务器 (端口 3000)..."
cd "$SCRIPT_DIR"
npx next dev -p 3000 &
FRONTEND_PID=$!

echo ""
echo "=== Dashboard 已启动 ==="
echo "  前端:  http://localhost:3000"
echo "  API:   http://localhost:8643/docs"
echo ""
echo "按 Ctrl+C 停止所有服务"

# Trap Ctrl+C to kill both
trap "kill $API_PID $FRONTEND_PID 2>/dev/null; echo '已停止。'" EXIT

wait
