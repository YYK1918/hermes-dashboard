# Hermes Agent Dashboard v2.1.0

基于 Next.js 16 + FastAPI 的 Hermes Agent 可视化控制面板，支持多 Agent 协作聊天室、模型管理、SSE 流式对话、Token 用量追踪。

## 功能总览

| 页面 | 路由 | 功能 |
|------|------|------|
| 总览 | `/` | Bento Grid 系统状态、API Keys、会话/技能统计、Token 图表 |
| 对话 | `/chat` | SSE 流式 AI 对话、工具调用可视化、文件生成追踪、模型切换 |
| 聊天室 | `/rooms` | 多 Agent 协作：房主开题→成员讨论→房主汇总、文件上传、导出 |
| 会话 | `/sessions` | 历史会话列表 |
| 技能 | `/skills` | 已安装技能网格 |
| 模型 | `/models` | 自定义 Provider/Model/BaseURL/APIKey 管理 |
| 用量 | `/tokens` | Token 消耗图表（按模型/平台） |
| 定时 | `/cron` | 定时任务 CRUD |

## 对话模块特性

- SSE 流式输出（`asyncio.create_subprocess_exec` + `hermes chat -q --yolo`）
- 工具调用实时卡片（工具名/emoji/状态）
- 文件生成追踪与自动提取（代码块 → `/tmp/hermes-chat/`）
- 模型选择器（对话页顶部栏下拉切换 Provider/Model）
- Skill 选择器 + 文件上传
- 可拖拽侧边栏 + 一键隐藏
- 代码块复制按钮

## 聊天室特性

- 房主模式：开题分析 → 成员轮转讨论 → 房主汇总
- SSE 流式实时输出，进度条显示当前轮数
- `max_turns` = 成员讨论轮数（不含房主开题/汇总）
- 用户可随时插话（自动运行时不锁定输入框）
- 预设模板：架构师(房主) + 开发工程师 + 实施工程师
- 文件上传供 Agent 讨论时参考
- 讨论结果导出 Markdown

## 模型管理

- 内置 9 个常用模型（DeepSeek/ChatGPT/Claude/Gemini/Llama）
- 支持自定义 Provider + Model + Base URL + API Key
- 自动同步到 `~/.hermes/config.yaml` 的 `providers:` 段
- API Key 通过子进程环境变量注入，前端不暴露
- 总览页 API Keys 中显示自定义模型状态

## 技术栈

| 层 | 技术 |
|----|------|
| 前端框架 | Next.js 16 + React 19 + TypeScript 5 |
| UI | shadcn/ui v4 (New York) + Tailwind v4 + Framer Motion |
| 图表 | Recharts |
| 后端 | FastAPI (Python 3.9+) |
| 鉴权 | JWT (HS256, 24h 过期) + bcrypt |
| 实时通信 | SSE (Server-Sent Events) |
| 进程管理 | PM2 |
| 反向代理 | Nginx |

## 系统架构

```
Internet → Nginx :443
              ├── /              → Next.js :3000
              ├── /api/chat      → FastAPI :8643 (SSE, 360s 超时)
              ├── /api/rooms     → FastAPI :8643 (SSE, 360s 超时)
              ├── /api/*         → FastAPI :8643 (30s 超时)
              ├── /docs          → FastAPI :8643 (Swagger)
              └── /_next/static  → Next.js :3000 (365d 缓存)
```

## 环境要求

| 组件 | 最低版本 | 检查命令 |
|------|---------|---------|
| Node.js | >= 18 | `node --version` |
| npm | >= 9 | `npm --version` |
| Python | >= 3.9 | `python3 --version` |
| pip3 | >= 21 | `python3 -m pip --version` |
| Nginx | >= 1.20 | `nginx -v` |
| PM2 | >= 5 | `pm2 --version`（未安装则 `npm install -g pm2`） |
| Hermes Agent | 已安装 | `~/.local/bin/hermes --version`（必须预先安装） |

---

## 部署指南

### 第一步：获取源码

```bash
git clone git@github.com:YYK1918/hermes-dashboard.git
cd hermes-dashboard
```

### 第二步：安装依赖

```bash
# Python 依赖（共 6 个核心包）
pip3 install -r requirements.txt

# 验证
python3 -c "import fastapi, uvicorn, httpx, jwt, bcrypt, yaml; print('Python OK')"

# Node 依赖
npm install
```

### 第三步：构建前端

```bash
npm run build
```

预期输出：

```
Route (app)
┌ ○ /
├ ○ /chat
├ ○ /rooms
├ ○ /models
├ ○ /sessions
├ ○ /skills
├ ○ /tokens
├ ○ /cron
├ ○ /login
└ ○ /_not-found

○  (Static)  prerendered as static content
```

### 第四步：配置环境变量

编辑 `ecosystem.config.json`，修改以下两项：

```json
{
  "env": {
    "API_SERVER_KEY": "填入一个随机字符串作为内部 API 密钥"
  }
}
```

```json
{
  "env": {
    "NEXT_PUBLIC_API_URL": "https://你的域名（如 app.example.com）"
  }
}
```

- `API_SERVER_KEY`：任意随机字符串，用于内部通信
- `NEXT_PUBLIC_API_URL`：用户访问的完整 URL（含 https://），本地测试可设为 `http://localhost:8643`

> ⚠️ 如果仅在本机测试，将 `NEXT_PUBLIC_API_URL` 留空或设为 `http://localhost:8643`

### 第五步：启动服务

```bash
# 安装 PM2（如未安装）
npm install -g pm2

# 启动两个进程：hermes-api (FastAPI) + hermes-dashboard (Next.js)
pm2 start ecosystem.config.json

# 查看状态，确认两个进程均为 online
pm2 status
```

预期输出：

```
┌────┬──────────────────┬─────────┬─────────┬──────────┐
│ id │ name             │ status  │ cpu     │ mem      │
├────┼──────────────────┼─────────┼─────────┼──────────┤
│ 0  │ hermes-api       │ online  │ 0%      │ 55mb     │
│ 1  │ hermes-dashboard │ online  │ 0%      │ 140mb    │
└────┴──────────────────┴─────────┴─────────┴──────────┘
```

### 第六步：设置开机自启

```bash
pm2 save
pm2 startup
# 按屏幕提示执行输出的 sudo 命令
```

### 第七步：配置 Nginx 反向代理

#### 7.1 安装 Nginx（如未安装）

```bash
# CentOS/RHEL
yum install -y nginx

# Ubuntu/Debian
apt install -y nginx
```

#### 7.2 申请 SSL 证书（推荐 Let's Encrypt）

```bash
# 安装 certbot
yum install -y certbot python3-certbot-nginx   # CentOS
# 或
apt install -y certbot python3-certbot-nginx   # Ubuntu

# 申请证书（替换为你的域名）
certbot --nginx -d 你的域名
```

如果暂时没有域名或证书，可以先使用 HTTP 测试（将 Nginx 配置中的 443 部分注释掉，保留 80 端口配置）。

#### 7.3 写入 Nginx 配置

```bash
# 复制模板
cp nginx-example.conf /etc/nginx/conf.d/hermes-dashboard.conf

# 编辑模板，替换以下内容：
#   your-domain.com → 你的域名
#   /etc/nginx/ssl/your-domain.com.pem → 你的证书路径
#   /etc/nginx/ssl/your-domain.com.key → 你的私钥路径
vim /etc/nginx/conf.d/hermes-dashboard.conf
```

Nginx 配置中**必须保留**的关键项：

```nginx
# 对话和聊天室端点必须设置长超时 + 禁用缓冲
location /api/chat {
    proxy_read_timeout 360s;
    proxy_buffering off;
}
location /api/rooms {
    proxy_read_timeout 360s;
    proxy_buffering off;
}
```

> ⚠️ 缺少以上配置会导致 SSE 流式中断，返回 HTML 504 错误。

#### 7.4 验证并重载

```bash
# 检查配置语法
nginx -t

# 应输出：syntax is ok / test is successful

# 重载配置（不停服）
nginx -s reload

# 启动 Nginx（如未启动）
systemctl start nginx
systemctl enable nginx
```

#### 7.5 配置防火墙

```bash
# 开放 80 (HTTP) 和 443 (HTTPS) 端口
firewall-cmd --permanent --add-service=http
firewall-cmd --permanent --add-service=https
firewall-cmd --reload

# 如使用 iptables
iptables -A INPUT -p tcp --dport 80 -j ACCEPT
iptables -A INPUT -p tcp --dport 443 -j ACCEPT
```

> ⚠️ 端口 3000 和 8643 只应监听 localhost，不对外开放。所有外部流量通过 Nginx 代理。

### 第八步：验证部署

```bash
# 测试 API 健康检查（本地）
curl http://localhost:8643/api/health
# 应输出：{"ok":true,...}

# 测试前端（通过 Nginx）
curl -s -o /dev/null -w "%{http_code}" https://你的域名/
# 应输出：200
```

### 第九步：首次登录

```
URL:   https://你的域名/login
用户:  admin
密码:  hermes2026
```

> ⚠️ **登录后请立即修改密码！** 密码哈希存储在 `~/.hermes/dashboard-auth.json`，删除此文件可重置密码。

修改密码：

```bash
# 获取 token
TOKEN=$(curl -s -X POST https://你的域名/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"hermes2026"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

# 修改密码
curl -s -X POST https://你的域名/api/auth/change-password \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"old_password":"hermes2026","new_password":"你的新密码"}'
```

---

## 离线部署

如果目标服务器无法访问外网，使用离线安装包：

### 1. 准备离线包

```bash
# 在有网络的机器上下载 Python 依赖
pip3 download -d offline-deps/python fastapi uvicorn httpx bcrypt pyjwt pyyaml

# 执行 npm install + npm run build 生成 node_modules 和 .next
npm install && npm run build

# 打包（包含 node_modules 和 .next）
tar -czf hermes-dashboard-v2.1.1-offline.tar.gz hermes-dashboard/
```

### 2. 在目标服务器安装

```bash
tar -xzf hermes-dashboard-v2.1.1-offline.tar.gz
cd hermes-dashboard
chmod +x install.sh
./install.sh
```

安装脚本会自动：
- 使用本地 `.whl` 文件离线安装 Python 依赖
- 使用内置 `node_modules`（无需 `npm install`）
- 使用内置 `.next` 构建产物（无需 `npm run build`）
- 配置 PM2 并启动服务

> ⚠️ 离线包基于构建时的服务器架构（x86_64/Linux），目标服务器必须同架构。

---

## 配置 Let's Encrypt SSL 证书自动续期

Let's Encrypt 证书有效期 90 天，设置自动续期：

```bash
# certbot 安装后默认已添加 systemd timer
systemctl status certbot.timer

# 手动测试续期
certbot renew --dry-run

# 续期后自动重载 Nginx
# 确认 /etc/letsencrypt/renewal/ 目录下配置中有：
# renew_hook = nginx -s reload
```

---

## 更新部署

拉取最新代码后重新构建：

```bash
cd hermes-dashboard
git pull
npm install            # 如有新依赖
npm run build          # 重新构建前端
pm2 restart all        # 重启服务
```

---

## 常见问题

### Q: 对话页报错 "Unexpected token '<'" 或显示 HTML

**原因**: Nginx 超时返回 504 页面。  
**解决**: 检查 `/etc/nginx/conf.d/hermes-dashboard.conf` 中 `/api/chat` 和 `/api/rooms` 的 `proxy_read_timeout` 是否设为 360s，且 `proxy_buffering off`。

### Q: 聊天室自动运行 1-2 轮就结束

**原因**: Nginx `/api/rooms` 超时不足。  
**解决**: 同上，确保 `/api/rooms` 有独立的 location 块配 360s 超时。

### Q: 聊天室没有输出内容

**原因**: SSE 缓冲未关闭。  
**解决**: 确保 `proxy_buffering off` 在 `/api/rooms` 中配置。

### Q: 自定义模型不生效

**原因**: Provider 名称使用了内置名称（deepseek/anthropic/openai/openrouter/google）。  
**解决**: 使用自定义名称，如 `minimax`、`local-llm` 等。

### Q: pip install bcrypt 报错

**原因**: 部分系统缺少编译工具。  
**解决**: `yum install -y gcc python3-devel` 或 `apt install -y build-essential python3-dev`。

### Q: 502 Bad Gateway

**原因**: 后端服务未启动。  
**解决**: `pm2 status` 检查两个进程，`pm2 logs` 查看错误日志。

### Q: 端口 3000 或 8643 被占用

```bash
# 查看占用进程
ss -tlnp | grep -E '3000|8643'
# 释放端口
fuser -k 3000/tcp
```

## API 端点

### 公开
| 端点 | 说明 |
|------|------|
| `GET /api/health` | 健康检查 |
| `POST /api/auth/login` | JWT 登录 |
| `POST /api/auth/verify` | 验证 Token |

### 数据
| 端点 | 说明 |
|------|------|
| `GET /api/status` | 系统状态（Provider/Model/API Keys） |
| `GET /api/sessions` | 历史会话列表 |
| `GET /api/tokens` | Token 用量统计 |
| `GET /api/skills` | 技能列表 |
| `GET /api/models` | 可用模型（内置+自定义） |
| `GET /api/overview` | 总览数据 |

### 对话
| 端点 | 说明 |
|------|------|
| `POST /api/chat` | 发送消息（阻塞） |
| `POST /api/chat/stream` | SSE 流式对话 |
| `GET /api/chat/files` | 生成文件列表 |
| `GET /api/chat/sessions` | 对话会话列表 |

### 聊天室
| 端点 | 说明 |
|------|------|
| `GET /api/rooms` | 房间列表 |
| `POST /api/rooms` | 创建房间 |
| `GET /api/rooms/{id}` | 房间详情 |
| `DELETE /api/rooms/{id}` | 删除房间 |
| `POST /api/rooms/{id}/next` | 手动下一步 |
| `POST /api/rooms/{id}/run` | SSE 自动运行 |
| `POST /api/rooms/{id}/interject` | 用户插话 |
| `POST /api/rooms/{id}/upload` | 上传文件 |
| `POST /api/rooms/{id}/export` | 导出 Markdown |

### 模型管理
| 端点 | 说明 |
|------|------|
| `GET /api/manage/models` | 自定义模型列表 |
| `POST /api/manage/models` | 添加模型 |
| `DELETE /api/manage/models?provider=X&model=Y` | 删除模型 |

## 自定义模型

在 `/models` 页面点击"高级设置"，填入：

| 字段 | 说明 | 示例 |
|------|------|------|
| Provider | 自定义名称（不要用内置名） | `minimax` |
| Model | 模型名 | `MiniMax-M2.7-highspeed` |
| API Base URL | 自定义端点 | `https://api.minimaxi.com/anthropic` |
| API Key | 鉴权密钥（密码框） | `sk-cp-xxx` |

添加后自动同步到 `~/.hermes/config.yaml`，对话页和聊天室下拉框即可选择。

## 注意事项

1. **Nginx 超时**：`/api/chat` 和 `/api/rooms` 必须配置 `proxy_read_timeout 360s` + `proxy_buffering off`，否则 SSE 流式会中断
2. **安全**：登录后修改默认密码；生产环境将 CORS 改为具体域名
3. **YOLO 模式**：对话子进程使用 `--yolo` 跳过危险命令审批，仅限受信环境
4. **持久化文件**：密码在 `~/.hermes/dashboard-auth.json`，模型在 `~/.hermes/dashboard-models.json`
5. **聊天室轮数**：`max_turns` 只计成员讨论轮数，不含房主开题/汇总

## 运维命令

```bash
pm2 status              # 查看服务状态
pm2 logs                # 实时日志
pm2 restart all         # 重启全部
```

## 项目结构

```
hermes-dashboard/
├── server/api.py              # FastAPI 后端 (~1700行)
├── src/
│   ├── app/                   # Next.js 页面
│   │   ├── page.tsx           # 总览
│   │   ├── chat/page.tsx      # 对话
│   │   ├── rooms/page.tsx     # 聊天室
│   │   ├── models/page.tsx    # 模型管理
│   │   ├── login/page.tsx     # 登录
│   │   └── ...
│   └── components/
│       ├── lib/api.ts         # 前端 API 客户端
│       ├── dashboard/         # 仪表盘组件
│       └── ui/                # shadcn/ui 组件
├── ecosystem.config.json      # PM2 配置
├── nginx-example.conf         # Nginx 模板
├── requirements.txt           # Python 依赖
├── install.sh                 # 离线安装脚本
└── package.json
```

## License

MIT

## 免责声明

本项目由 AI 辅助生成，仅供学习和研究使用。使用者应自行评估代码安全性、合规性和适用性。

- 本项目不提供任何明示或暗示的担保
- 使用者应自行审查所有代码，尤其是在生产环境部署前
- 代码中涉及的任何第三方 API、服务和商标均为其各自所有者的财产
- 作者不对因使用本代码产生的任何直接或间接损失承担责任
