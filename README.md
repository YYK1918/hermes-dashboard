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

| 组件 | 最低版本 |
|------|---------|
| Node.js | >= 18 |
| npm | >= 9 |
| Python | >= 3.9 |
| Nginx | >= 1.20 |
| PM2 | >= 5 |
| Hermes Agent | 已安装于 `~/.local/bin/hermes` |

## 快速开始

### 1. 安装依赖

```bash
cd hermes-dashboard

# Python
pip3 install fastapi uvicorn httpx bcrypt pyjwt pyyaml

# Node
npm install
```

### 2. 构建前端

```bash
npm run build
```

### 3. 配置 PM2

编辑 `ecosystem.config.json`，设置 `API_SERVER_KEY` 和 `NEXT_PUBLIC_API_URL`：

```json
{
  "apps": [
    {
      "name": "hermes-api",
      "script": "server/api.py",
      "interpreter": "python3",
      "cwd": "/root/hermes-dashboard",
      "env": {
        "HERMES_NO_COLOR": "1",
        "API_SERVER_KEY": "你的Key"
      },
      "autorestart": true
    },
    {
      "name": "hermes-dashboard",
      "script": "node_modules/.bin/next",
      "args": "start -p 3000",
      "cwd": "/root/hermes-dashboard",
      "env": {
        "NODE_ENV": "production",
        "NEXT_PUBLIC_API_URL": "https://你的域名"
      }
    }
  ]
}
```

启动：

```bash
pm2 start ecosystem.config.json
pm2 save
```

### 4. 配置 Nginx

```bash
cp nginx-example.conf /etc/nginx/conf.d/hermes-dashboard.conf
# 编辑域名和 SSL 证书路径
nginx -t && nginx -s reload
```

### 5. 登录

```
URL:   https://你的域名/login
用户:  admin
密码:  hermes2026
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
