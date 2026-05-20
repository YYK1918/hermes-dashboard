# Hermes Agent Dashboard v2.1.0 — 离线部署文档

**版本**: v2.1.0  
**封版日期**: 2026-05-20  

**交付物**:
| 文件 | 大小 | 说明 |
|------|------|------|
| `hermes-dashboard-v2.1.0-offline-20260520.tar.gz` | ~400MB | 完整离线包(含 node_modules + .next + Python wheels) |
| `hermes-dashboard-v2.1.0-src-20260520.tar.gz` | 185KB | 仅源码(需在线 npm install) |

---

## 1. 离线包内容

```
hermes-dashboard/
├── server/api.py                  # FastAPI 后端 (1622行)
├── src/                           # Next.js 前端源码
├── node_modules/                  # Node 依赖 (离线)
├── .next/                         # 前端构建产物 (离线)
├── offline-deps/
│   └── python/                    # Python .whl 离线包 (22个)
│       ├── fastapi-0.128.8-*.whl
│       ├── uvicorn-0.39.0-*.whl
│       ├── bcrypt-5.0.0-*.whl
│       └── ... (含所有传递依赖)
├── requirements.txt               # Python 依赖声明
├── install.sh                     # 一键离线安装脚本
├── ecosystem.config.json          # PM2 配置
├── nginx-example.conf             # Nginx 模板
├── DEPLOY-v2.1.0.md               # 详细部署文档
└── package.json
```

## 2. 环境要求

| 组件 | 最低版本 | 离线包是否需要预装 |
|------|---------|-------------------|
| **Node.js** | >= 18 | ✅ 必须预装 |
| **npm** | >= 9 | ✅ 必须预装 |
| **Python** | >= 3.9 | ✅ 必须预装 |
| **pip3** | >= 21 | ✅ 必须预装 |
| **Nginx** | >= 1.20 | ✅ 必须预装 |
| **PM2** | >= 5 | 脚本会自动安装 |
| **Hermes Agent** | 已安装 | ✅ 必须预装 |

## 3. 安装步骤

```bash
# 1. 上传离线包到服务器
scp hermes-dashboard-v2.1.0-offline-20260520.tar.gz root@服务器IP:/root/

# 2. 解压
cd /root
tar -xzf hermes-dashboard-v2.1.0-offline-20260520.tar.gz

# 3. 运行安装脚本
cd /root/hermes-dashboard
chmod +x install.sh
./install.sh

# 安装脚本会自动:
#   - pip3 install --no-index Python wheels
#   - 使用内置 node_modules (无需 npm install)
#   - 使用内置 .next 构建产物 (无需 npm run build)
#   - 配置 PM2 并启动服务
#   - 输出 Nginx 配置提示
```

## 4. Nginx 配置

```bash
# 编辑模板替换域名
vim /root/hermes-dashboard/nginx-example.conf

# 写入并加载
cp /root/hermes-dashboard/nginx-example.conf /etc/nginx/conf.d/hermes-dashboard.conf
nginx -t && nginx -s reload
```

## 5. 首次登录

```
URL:   https://你的域名/login
用户:  admin
密码:  hermes2026  ← 立即修改！
```

## 6. 注意事项 ⚠️

### 离线包限制
- `node_modules` 和 `.next` 是基于当前服务器 (x86_64/Linux) 构建的，**仅限同架构服务器使用**
- 如果目标服务器架构不同 (ARM/Mac)，需要重新 npm install + npm run build
- Python wheels 包含 `.manylinux_x86_64` 格式，**仅限 x86_64 Linux**

### 安全
| 项 | 说明 |
|----|------|
| 🔐 密码 | `hermes2026`，部署后立即修改 |
| 🔑 API Key | 自定义模型 Key 存 `~/.hermes/dashboard-models.json` |
| 🌐 CORS | 当前 `*`，生产环境改为具体域名 |
| ⚠️ YOLO | 子进程 `--yolo`，仅受信环境 |

### Nginx 超时配置
```
/api/chat  → proxy_read_timeout 360s + buffering off
/api/rooms → proxy_read_timeout 360s + buffering off  
/api/*     → 30s 即可
```
缺少配置会导致 SSE 流式中断返回 HTML 504。

### 持久化文件
```
~/.hermes/dashboard-auth.json     — 密码哈希
~/.hermes/dashboard-models.json   — 自定义模型(含Key)
~/.hermes/config.yaml             — providers段由dashboard写入
```

### 运维
```bash
pm2 status        # 状态
pm2 logs          # 日志
pm2 restart all   # 重启
```

## 7. 常见问题

**Q: pip install --no-index 报错**
A: 检查 Python 版本 >= 3.9，且是 x86_64 Linux

**Q: node_modules 不兼容**
A: 目标服务器架构不同，删除 node_modules 和 .next 后重新 `npm install && npm run build`

**Q: 聊天室没有输出**
A: 检查 Nginx `/api/rooms` 是否配置了 `proxy_buffering off` + `proxy_read_timeout 360s`

**Q: 自定义模型不生效**
A: 确认 Provider 名称不是内置的 (deepseek/anthropic/openai/openrouter/google)

---

## 免责声明

本项目由 AI 辅助生成，仅供学习研究使用。使用者应自行审查代码安全性，作者不对使用后果承担责任。
