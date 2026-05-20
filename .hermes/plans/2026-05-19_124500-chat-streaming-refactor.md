# 对话模块 SSE 实时流式重构计划

**日期**: 2026-05-19
**目标**: 将对话模块升级为终端级实时体验——流式输出、工具调用可视化、Token 追踪、文件上传等

---

## 1. 现状分析

### 当前架构（阻塞式）

```
前端 → POST /api/chat → FastAPI → subprocess hermes chat -q → 阻塞等待 300s → 返回全文
```

**缺陷**:
- 无实时输出，用户需要等完整响应
- 看不见工具调用过程（write_file, terminal, browser 等）
- 看不见 thinking/reasoning 过程
- Token 用量无法在聊天中实时显示
- 无运行时间统计

### 目标架构（流式 SSE）

```
前端 → POST /api/chat/stream → FastAPI → 代理 SSE → Hermes API :8642 /v1/chat/completions (stream=true)
                                                                        ↓
                                             SSE events: delta content, tool.progress, usage
```

Hermes API Server (端口 8642) 已原生支持：
- `POST /v1/chat/completions` with `stream: true`
- `event: hermes.tool.progress` 自定义 SSE 事件（工具名、emoji、label、运行/完成状态）
- Delta 内容逐字输出
- 最终 `[DONE]` 前返回 `usage: {prompt_tokens, completion_tokens, total_tokens}`

---

## 2. 功能清单

| # | 功能 | 优先级 | 实现方式 |
|---|------|--------|---------|
| 1 | 流式文字输出（逐字/逐块） | P0 | SSE delta content 渲染 |
| 2 | 工具调用可视化（实时显示工具名+状态） | P0 | `hermes.tool.progress` 事件卡片 |
| 3 | Thinking/Reasoning 过程显示 | P0 | Delta 流中的 reasoning 内容 |
| 4 | Token 用量实时显示 | P0 | 最终 chunk 的 usage 字段 |
| 5 | 运行时间统计 | P1 | 前端计时器 |
| 6 | 文件上传+自动读取 | P1 | `<input file>` + Base64/FD 上传 |
| 7 | 生成文件自动入列 | P1 | 保留现有 _scan_chat_files 机制 |
| 8 | Skill 使用提示 | P2 | Skill 选择器 + 事件标注 |
| 9 | 对话中断/停止按钮 | P2 | AbortController |
| 10 | 错误/超时友好提示 | P2 | 错误状态卡片 |

---

## 3. 实施步骤

### Phase 1: 后端流式代理（预计 15 分钟）

**文件**: `server/api.py`

新增端点 `POST /api/chat/stream`：

```python
@app.post("/api/chat/stream")
async def chat_stream(body: ChatRequest, user: str = Depends(get_current_user)):
    """SSE streaming proxy to Hermes API server."""
    CHAT_WORKDIR.mkdir(parents=True, exist_ok=True)
    session_id = body.session_id or f"chat_{int(time.time())}"
    
    async def event_generator():
        # 1. Save user message to session
        # 2. Call Hermes API server :8642 with stream=true
        # 3. Forward SSE events: delta content → frontend
        #    Forward hermes.tool.progress → frontend
        # 4. On [DONE], save assistant reply + scan files
        # 5. Emit custom event with usage + files + session_id
    
    return StreamingResponse(event_generator(), media_type="text/event-stream")
```

关键细节：
- Hermes API Server 地址: `http://127.0.0.1:8642/v1/chat/completions`
- 无需 API Key（本地访问不验证）
- 请求体格式:
```json
{
  "model": "hermes-agent",
  "messages": [{"role": "user", "content": "..."}],
  "stream": true
}
```
- 响应: `Content-Type: text/event-stream`

### Phase 2: 前端 SSE 客户端（预计 10 分钟）

**文件**: `src/components/lib/api.ts`

新增:
```ts
chatStream(
  message: string, 
  sessionId: string,
  onDelta: (text: string) => void,
  onToolProgress: (event: ToolProgressEvent) => void,
  onDone: (result: StreamResult) => void,
  onError: (error: string) => void,
  signal?: AbortSignal
): Promise<void>
```

使用 `fetch()` + `ReadableStream` reader 解析 SSE 事件。

### Phase 3: 聊天 UI 重构（预计 25 分钟）

**文件**: `src/app/chat/page.tsx`

#### 3.1 消息气泡增强
- 用户消息：现有样式不变
- AI 消息：新增三种内联子组件
  - **流式文本**: 逐字追加渲染（使用 `requestAnimationFrame` 节流）
  - **工具调用卡片**: 紧凑内联卡片，图标 + 工具名 + 参数摘要 + 状态指示器
  - **Thinking 折叠区**: 可折叠的 reasoning 文本

#### 3.2 新增工具栏
在输入框上方添加：
- 文件上传按钮（📎）
- Skill 选择器下拉
- 停止生成按钮（⬛）— 仅在 streaming 时显示

#### 3.3 新增状态栏
在消息区底部固定：
```
┌─────────────────────────────────────────────┐
│ ⏱ 12.3s  │ 🧠 1,234 tokens  │ 🔧 3 工具调用 │
└─────────────────────────────────────────────┘
```

#### 3.4 工具调用卡片组件（新增）

**文件**: `src/components/dashboard/tool-call-card.tsx`

```tsx
interface ToolCallCardProps {
  toolName: string      // "write_file", "terminal", "browser_navigate"
  emoji: string         // "📝", "💻", "🌐"
  label: string         // "写入文件: app.py"
  status: "running" | "completed" | "error"
  duration?: number     // 运行时长
}
```

紧凑样式：
```
┌─────────────────────────────────────────┐
│ 📝 write_file → app.py    ✓ 已完成 2.3s │
└─────────────────────────────────────────┘
```

#### 3.5 文件上传组件（新增）

**文件**: `src/components/dashboard/file-upload.tsx`

- `<input type="file">` 隐藏，按钮触发
- 读取文件内容 → Base64 或文本
- 将内容注入到消息中：`"请分析以下文件内容：\n```\n{content}\n```"`
- 支持多文件（最多 5 个，每个 < 1MB）

### Phase 4: 增强消息渲染（预计 10 分钟）

**文件**: `src/app/chat/page.tsx`

当前 `renderContent` 函数升级：
- 代码块语法高亮（使用 `highlight.js` 或简单正则）
- 复制按钮（每个代码块右上角）
- 表格渲染
- 链接自动识别

### Phase 5: 状态栏组件（新增）

**文件**: `src/components/dashboard/chat-status-bar.tsx`

```tsx
interface ChatStatusBarProps {
  elapsed: number       // 秒
  tokens: number        // 总 token 数
  toolCalls: number     // 工具调用次数
  streaming: boolean    // 是否正在流式输出
}
```

### Phase 6: 自测 + 回归测试（预计 10 分钟）

#### 6.1 功能自测清单

| 测试项 | 验证方法 |
|--------|---------|
| 流式输出 | 发送"写一篇短文"，观察逐字出现 |
| 工具调用卡片 | 发送"创建 hello.py"，观察 write_file 卡片出现 |
| 停止生成 | 发送长任务，点击停止按钮 |
| 文件上传 | 上传 .txt/.py 文件，确认内容被读取 |
| Token 统计 | 对话结束后状态栏显示 token 数 |
| 运行时间 | 状态栏计时器正常运行 |
| 暗色模式 | 切换主题，聊天界面正常 |
| 移动端 | 375px 宽度布局不错乱 |
| 错误处理 | 断开 API 服务器，观察错误提示 |

#### 6.2 回归测试

| 原功能 | 验证 |
|--------|------|
| 登录 | 登录页正常，Token 持久化 |
| 总览 | Bento Grid 数据正常 |
| 会话列表 | 会话切换正常 |
| 技能列表 | 技能网格正常 |
| Token 用量 | 图表正常 |
| Cron 管理 | 新建/暂停/日志正常 |

---

## 4. 文件变更清单

```
新增:
  src/components/dashboard/tool-call-card.tsx      # 工具调用卡片
  src/components/dashboard/file-upload.tsx          # 文件上传组件
  src/components/dashboard/chat-status-bar.tsx      # 状态栏

修改:
  server/api.py                                     # + POST /api/chat/stream
  src/components/lib/api.ts                         # + chatStream()
  src/app/chat/page.tsx                             # 全面重写消息渲染+布局
  src/components/dashboard/app-sidebar.tsx           # 无变更（对话入口已有）
```

---

## 5. 数据流图（SSE 流式）

```
用户输入 "写一个 Python 脚本"
        │
        ▼
POST /api/chat/stream  ──→  FastAPI :8643
        │                        │
        │              POST :8642/v1/chat/completions
        │              {stream: true}
        │                        │
        │              ┌─────────▼──────────┐
        │              │  Hermes Agent Loop  │
        │              │  thinking...        │
        │              │  调用 write_file    │
        │              │  调用 terminal      │
        │              │  生成最终回复       │
        │              └─────────┬──────────┘
        │                        │
        │   ◄── SSE stream ──────┤
        │                        │
        ▼                        ▼
   前端实时渲染:
   ┌─────────────────────────────────────┐
   │ 💬 你: 写一个 Python 脚本            │
   │                                     │
   │ 🤖 AI:                               │
   │   🔧 write_file → script.py  [运行中]│
   │   🔧 write_file → script.py  [✓ 完成]│
   │   已为您创建 script.py，内容如下...   │
   │                                     │
   │ ═══════════════════════════════════ │
   │ ⏱ 8.2s  │ 🧠 1,456 tk  │ 🔧 1 tool │
   └─────────────────────────────────────┘
```

---

## 6. 风险与缓解

| 风险 | 缓解 |
|------|------|
| SSE 代理增加延迟 | FastAPI StreamingResponse 零拷贝转发，延迟 < 50ms |
| Hermes API 无 Auth 暴露 | 仅监听 127.0.0.1:8642，不对外 |
| 大文件上传内存溢出 | 前端限制 1MB/文件，最多 5 个 |
| 移动端布局复杂 | 工具卡片自适应宽度，状态栏固定底部 |
| 浏览器 SSE 断开重连 | AbortController + 自动重试（最多 3 次） |

---

## 7. 验收标准

- [ ] 文字逐字/逐块流式输出，延迟 < 200ms
- [ ] 工具调用卡片在工具执行时实时出现
- [ ] Token 用量在对话结束后正确显示
- [ ] 运行时间准确（误差 < 1s）
- [ ] 文件上传后内容正确注入消息
- [ ] 停止按钮能中断长时间对话
- [ ] 暗色/亮色主题均正常
- [ ] 移动端 (375px) 无布局错乱
- [ ] 所有原有功能正常（回归通过）

---

*计划编写时间: 2026-05-19 12:45 UTC*
*状态: 待执行*
