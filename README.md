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

### 方式一：快速测试（无需 Nginx，5 分钟）

适用于本机测试或内网环境，无需域名和 SSL。

```bash
# 1. 克隆
git clone git@github.com:YYK1918/hermes-dashboard.git
cd hermes-dashboard

# 2. 安装依赖
pip3 install -r requirements.txt
npm install

# 3. 构建
npm run build

# 4. 启动
npm install -g pm2
pm2 start ecosystem.config.json
```

然后直接访问：**`http://你的IP:3000/login`**

> 端口 3000 直连时，前端自动将 API 请求指向 `localhost:8643`，无需配置 `NEXT_PUBLIC_API_URL`。

---

### 方式二：生产部署（Nginx + 域名 + SSL）

#### 第一步：获取源码

```bash
git clone git@github.com:YYK1918/hermes-dashboard.git
cd hermes-dashboard
```

#### 第二步：安装依赖

```bash
pip3 install -r requirements.txt     # Python
python3 -c "import fastapi, uvicorn, httpx, jwt, bcrypt, yaml; print('Python OK')"

npm install                           # Node
```

#### 第三步：构建前端

```bash
npm run build
```

预期输出所有路由标记为 `○ (Static)`。

#### 第四步：配置环境变量

编辑 `ecosystem.config.json`：

| 字段 | 说明 | 示例 |
|------|------|------|
| `API_SERVER_KEY` | 内部 API 密钥（随机字符串） | `my-secret-key-123` |
| `NEXT_PUBLIC_API_URL` | 对外访问地址（Nginx 代理模式才需要） | `https://app.example.com` |

> 如果通过 Nginx 反代，设为 `https://你的域名`。
> 如果直连端口 3000，**不要设置此项**——前端自动使用 `localhost:8643`。

#### 第五步：启动服务

```bash
pm2 start ecosystem.config.json
pm2 save
pm2 startup    # 开机自启
```

#### 第六步：配置 Nginx

```bash
cp nginx-example.conf /etc/nginx/conf.d/hermes-dashboard.conf
# 替换 your-domain.com → 你的域名
# 替换 SSL 证书路径
nginx -t && nginx -s reload
```

#### 第七步：申请 SSL

```bash
certbot --nginx -d 你的域名
```

#### 第八步：首次登录

```
URL:   https://你的域名/login
用户:  admin
密码:  hermes2026    ← 登录后立即修改
```

---

### 方式三：离线部署（无外网环境）

**准备离线包**（在有网络的机器上）：

```bash
pip3 download -d offline-deps/python fastapi uvicorn httpx bcrypt pyjwt pyyaml
npm install && npm run build
tar -czf hermes-dashboard-offline.tar.gz hermes-dashboard/
```

> 离线包约 300MB，基于构建时的 CPU 架构和 glibc 版本。目标机器必须同架构。

**在目标服务器安装**：

```bash
tar -xzf hermes-dashboard-offline.tar.gz
cd hermes-dashboard
chmod +x install.sh
./install.sh
```

安装脚本会自动：离线 wheels → 失败则在线安装 → PEP 668 自动处理 → 启动服务。

> ⚠️ 离线包基于构建时的服务器架构（x86_64/Linux），目标服务器必须同架构。

### 方式四：Docker 部署（推荐，一次构建到处运行）

镜像约 250MB（Alpine），内置 node_modules + .next + Python venv。**构建仅需联网一次，运行完全离线。**

**构建镜像**（联网机器上）：
```bash
docker compose build
```

**导出离线包**：
```bash
docker save hermes-dashboard:latest -o hermes-dashboard.tar
```

**离线机器加载并运行**：
```bash
docker load -i hermes-dashboard.tar

docker run -d --name hermes-dashboard \
  -p 3000:3000 -p 8643:8643 \
  -v ~/.local/bin/hermes:/usr/local/bin/hermes:ro \
  -v ~/.hermes:/root/.hermes \
  hermes-dashboard:latest
```

访问 `http://IP:3000/login`。无需 npm install / pip install / npm run build。

### 访问模式说明

| 模式 | 访问地址 | API 地址 | 需要 Nginx |
|------|---------|---------|-----------|
| 直连 | `http://IP:3000` | `localhost:8643` | 不需要 |
| 反代 | `https://域名` | 同域名（Nginx 转发） | 需要 |
| 自定义端口 | `http://IP:8080` | 同域名端口 | 需要（监听该端口） |
| Docker | `http://IP:3000` | 容器内 8643 | 不需要（直连） |

端口 3000 直连时，无需配置 `NEXT_PUBLIC_API_URL`。自定义端口请在 Nginx 中配 `listen`。

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
