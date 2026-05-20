# 模型选择器 + 多 Agent 聊天室 实施计划

> **目标**: 在对话页面增加模型切换下拉框 + 新增多 Agent 协作聊天室模块

**架构**: 
- 模型选择器: 对话框顶部栏增加 Provider/Model 下拉框，传给 API → hermes CLI `--provider` + `--model`
- 多 Agent 聊天室: 新路由 `/rooms`，后端轮转编排多 Agent 对话，每个 Agent 独立调用 hermes CLI

**技术栈**: 同现有项目 — FastAPI + Next.js 16 + shadcn/ui v4 + Framer Motion

---

## Phase 1: 后端 — 模型列表 API

### Task 1.1: 新增 GET /api/models 端点

**目标**: 返回可用的 provider/model 列表供前端选择

**文件**: `server/api.py`

**实现**:

在 `# ── Public Endpoints (no auth) ──` 之后增加（因为需要注入到对话中，可以用 auth 保护着放在 protected 区）：

```python
@app.get("/api/models")
async def get_models(user: str = Depends(get_current_user)):
    """List available models from hermes config."""
    models = []
    
    # Read from hermes config.yaml
    if CONFIG_PATH.exists():
        try:
            config = yaml.safe_load(CONFIG_PATH.read_text())
            # Default model
            default_model = config.get("model", {})
            if default_model.get("default"):
                models.append({
                    "provider": default_model.get("provider", "unknown"),
                    "model": default_model.get("default", ""),
                    "label": f"{default_model.get('provider','')}/{default_model.get('default','')}",
                    "is_default": True,
                })
        except Exception:
            pass
    
    # Also expose common models user might want to try
    # This list could be kept in a dashboard config
    common_models = [
        {"provider": "deepseek", "model": "deepseek-chat", "label": "DeepSeek Chat"},
        {"provider": "deepseek", "model": "deepseek-reasoner", "label": "DeepSeek Reasoner"},
        {"provider": "openrouter", "model": "anthropic/claude-sonnet-4", "label": "Claude Sonnet 4"},
        {"provider": "openrouter", "model": "anthropic/claude-opus-4", "label": "Claude Opus 4"},
        {"provider": "openrouter", "model": "openai/gpt-4o", "label": "GPT-4o"},
        {"provider": "openrouter", "model": "openai/gpt-4.1", "label": "GPT-4.1"},
        {"provider": "openrouter", "model": "google/gemini-2.5-pro", "label": "Gemini 2.5 Pro"},
        {"provider": "openrouter", "model": "google/gemini-2.5-flash", "label": "Gemini 2.5 Flash"},
        {"provider": "openrouter", "model": "meta-llama/llama-4-maverick", "label": "Llama 4 Maverick"},
    ]
    
    return {
        "current": models[0] if models else None,
        "available": models + [
            {**m, "is_default": False} for m in common_models
            if not any(existing["model"] == m["model"] for existing in models)
        ],
    }
```

### Task 1.2: 修改 ChatRequest 增加 provider/model 字段

**文件**: `server/api.py`

**修改**:

```python
class ChatRequest(BaseModel):
    message: str
    session_id: str = ""
    skills: list[str] = []
    provider: str = ""     # 新增
    model: str = ""        # 新增
```

### Task 1.3: 修改 POST /api/chat/stream 传递 provider/model

**文件**: `server/api.py:934-1013`

**修改**: 构建 `cmd_args` 时追加 provider/model:

```python
# 在 event_generator() 内，第958行附近
cmd_args = ["chat", "-q", body.message, "--quiet", "--yolo"]
if body.provider:
    cmd_args.extend(["--provider", body.provider])
if body.model:
    cmd_args.extend(["--model", body.model])
if body.skills:
    for skill in body.skills:
        cmd_args.extend(["--skills", skill])
```

### Task 1.4: 同样修改 POST /api/chat (阻塞式)

**文件**: `server/api.py:793`

同样追加 provider/model 参数传递。

---

## Phase 2: 前端 — 模型选择器

### Task 2.1: 在 api.ts 增加 models 接口

**文件**: `src/components/lib/api.ts`

```typescript
export interface ModelInfo {
  provider: string
  model: string
  label: string
  is_default: boolean
}

export interface ModelsList {
  current: ModelInfo | null
  available: ModelInfo[]
}

// 在 api 对象中增加:
models: () => fetchJSON<ModelsList>("/api/models"),
```

### Task 2.2: 在对话页顶部栏增加模型选择器

**文件**: `src/app/chat/page.tsx`

**位置**: 在顶部栏 (line 469-481) 的左侧或中间增加下拉框

```tsx
// 新增 state
const [selectedModel, setSelectedModel] = useState<string>("")
const [selectedProvider, setSelectedProvider] = useState<string>("")

// 从 localStorage 恢复
useEffect(() => {
  const saved = localStorage.getItem("hermes_chat_model")
  if (saved) {
    try {
      const { provider, model } = JSON.parse(saved)
      setSelectedProvider(provider)
      setSelectedModel(model)
    } catch {}
  }
}, [])

// 保存到 localStorage
useEffect(() => {
  if (selectedModel) {
    localStorage.setItem("hermes_chat_model", JSON.stringify({
      provider: selectedProvider,
      model: selectedModel,
    }))
  }
}, [selectedModel, selectedProvider])

// 在 handleSend 的 fetch body 中加入:
body: JSON.stringify({
  message: userMsg,
  session_id: sessionId || undefined,
  skills: selectedSkills,
  provider: selectedProvider,
  model: selectedModel,
}),
```

**UI**: 在顶部栏 (PanelLeftOpen/Plus/PanelRightOpen 所在行) 加入:

```tsx
{/* 模型选择器 — 放在新会话和文件面板按钮之间 */}
<select
  value={`${selectedProvider}/${selectedModel}`}
  onChange={(e) => {
    const [provider, model] = e.target.value.split("/")
    setSelectedProvider(provider)
    setSelectedModel(model)
  }}
  className="text-xs bg-transparent border rounded-md px-2 py-1 outline-none"
>
  <option value="">默认模型</option>
  {availableModels?.map(m => (
    <option key={`${m.provider}/${m.model}`} value={`${m.provider}/${m.model}`}>
      {m.label || `${m.provider}/${m.model}`}
    </option>
  ))}
</select>
```

也可以用 shadcn/ui DropdownMenu 实现更好的样式。

### Task 2.3: 在总览页也显示当前模型

**文件**: `src/app/page.tsx` — 在 StatusCard 中已经显示了 model 信息，无需额外修改。

---

## Phase 3: 后端 — 多 Agent 聊天室 API

### Task 3.1: 设计数据结构

```python
class RoomAgent(BaseModel):
    name: str           # Agent 显示名称，如 "架构师"
    provider: str       # deepseek / openrouter
    model: str          # deepseek-chat / claude-sonnet-4
    system_prompt: str  # 角色设定，如 "你是一个资深架构师..."

class RoomCreateRequest(BaseModel):
    name: str           # 房间名称
    topic: str          # 讨论主题/任务
    agents: list[RoomAgent]  # 参与者

class RoomTurnRequest(BaseModel):
    room_id: str
    message: str = ""   # 用户介入消息（可选）

class RoomMessage(BaseModel):
    agent_name: str
    content: str
    timestamp: str
```

### Task 3.2: 房间 CRUD 端点

**文件**: `server/api.py` — 新增 `# ── Multi-Agent Room ──` 区块

```python
# 房间存储 (重启丢失，可后续持久化到 JSON)
ROOMS: dict = {}  # room_id -> RoomState

# 房间状态
class RoomState:
    def __init__(self, name: str, topic: str, agents: list):
        self.name = name
        self.topic = topic
        self.agents = agents  # list of RoomAgent
        self.messages: list = []  # list of RoomMessage
        self.turn_index: int = 0
        self.created_at: str = datetime.now().isoformat()
```

端点:
- `GET /api/rooms` — 列出所有房间
- `POST /api/rooms` — 创建房间
- `GET /api/rooms/{room_id}` — 获取房间详情 + 消息历史
- `DELETE /api/rooms/{room_id}` — 删除房间

### Task 3.3: 核心 — 多 Agent 对话编排

**文件**: `server/api.py`

端点: `POST /api/rooms/{room_id}/next` — 让下一个 Agent 发言

**编排逻辑**:
1. 确定当前发言人 (turn_index % len(agents))
2. 构建对话上下文：topic + 历史消息 + 当前 agent 的 system_prompt
3. 调用 `hermes chat -q` 让该 agent 用其指定的 provider/model 生成回应
4. 将回应追加到房间消息历史
5. turn_index += 1
6. 返回回应

端点: `POST /api/rooms/{room_id}/run` — 自动运行 N 轮（或直到任务完成）

**自动运行逻辑**:
- 使用 SSE streaming 逐轮推送每个 agent 的回应
- 前端实时显示对话进展
- 可设置最大轮数或直到出现 "DONE" 关键词

### Task 3.4: SSE 多轮对话

```python
@app.post("/api/rooms/{room_id}/run")
async def run_room_discussion(room_id: str, max_turns: int = 10):
    """Run multi-agent discussion with SSE streaming."""
    
    async def event_generator():
        room = ROOMS.get(room_id)
        if not room:
            yield f"event: error\ndata: {json.dumps({'error': '房间不存在'})}\n\n"
            return
        
        yield f"event: room.start\ndata: {json.dumps({'room_id': room_id, 'topic': room.topic, 'agents': [a.name for a in room.agents]})}\n\n"
        
        for turn in range(max_turns):
            agent_idx = room.turn_index % len(room.agents)
            agent = room.agents[agent_idx]
            
            # 通知前端谁在说话
            yield f"event: agent.speaking\ndata: {json.dumps({'agent': agent.name, 'model': agent.model, 'turn': turn+1})}\n\n"
            
            # 构建提示
            history_text = "\n\n".join([
                f"**{m['agent_name']}**: {m['content']}"
                for m in room.messages[-20:]  # 最近20条
            ])
            
            prompt = f"""你是一个名为"{agent.name}"的AI助手。

你的角色设定: {agent.system_prompt}

当前讨论主题: {room.topic}

以下是讨论历史:
{history_text if history_text else "(尚无历史记录，请首先发言)"}

请以"{agent.name}"的身份，就讨论主题发表你的看法。保持角色设定，与历史对话保持连贯。
你可以提出观点、反驳他人、执行任务或协调下一步行动。
如有需要，你可以在回答末尾标注 DONE 表示讨论已完成。"""

            # 调用 hermes
            try:
                proc = await asyncio.create_subprocess_exec(
                    HERMES_BIN, "chat", "-q", prompt, 
                    "--quiet", "--yolo",
                    "--provider", agent.provider,
                    "--model", agent.model,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.STDOUT,
                    env={**os.environ, "HERMES_NO_COLOR": "1"},
                )
                
                response_text = ""
                while True:
                    line = await proc.stdout.readline()
                    if not line: break
                    decoded = line.decode("utf-8", errors="replace").strip()
                    if decoded:
                        response_text += decoded + "\n"
                        yield f"data: {json.dumps({'agent': agent.name, 'content': decoded})}\n\n"
                
                await proc.wait()
                
                # 记录消息
                msg = {"agent_name": agent.name, "content": response_text.strip(), "timestamp": datetime.now().isoformat()}
                room.messages.append(msg)
                room.turn_index += 1
                
                # 检查是否完成
                if "DONE" in response_text:
                    yield f"event: room.done\ndata: {json.dumps({'message': '讨论完成'})}\n\n"
                    break
                    
            except Exception as e:
                yield f"event: error\ndata: {json.dumps({'error': str(e)})}\n\n"
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
```

---

## Phase 4: 前端 — 多 Agent 聊天室页面

### Task 4.1: 新增侧边栏入口

**文件**: `src/components/dashboard/app-sidebar.tsx`

在 navItems 数组中增加:
```typescript
{ href: "/rooms", label: "聊天室", icon: Users },
```

需要 import `Users` from lucide-react。

### Task 4.2: 新增 /rooms 页面

**文件**: `src/app/rooms/page.tsx` (新建)

**功能**:
1. 房间列表 (左侧面板)
2. 创建房间对话框 — 设置:
   - 房间名称
   - 讨论主题/任务
   - 添加 Agent: 名称 + Provider/Model + 角色设定(system prompt)
3. 聊天区 — 显示多 Agent 对话历史
   - 每条消息显示 Agent 名称、模型、内容
   - 不同 Agent 用不同颜色区分
4. 控制面板:
   - "下一步" — 让下一个 Agent 发言 (手动模式)
   - "自动运行" — 连续运行 N 轮
   - "停止" — 中断运行
   - 轮数设置

**UI 布局**:
```
┌─────────────────────────────────────────────────┐
│  ← 隐藏面板 │ 聊天室名称 │ +新建 │ 隐藏文件 → │
├────────────┬────────────────────┬───────────────┤
│ 房间列表   │                    │  Agent 面板    │
│            │  对话消息流         │  ┌──────────┐ │
│ ┌────────┐│                    │  │ Agent 1   │ │
│ │ Room 1 ││  Agent A: xxx      │  │ Model     │ │
│ │ Room 2 ││  Agent B: yyy      │  │ Role      │ │
│ │ Room 3 ││  Agent C: zzz      │  ├──────────┤ │
│ └────────┘│                    │  │ Agent 2   │ │
│            │                    │  │ ...       │ │
│            │                    │  └──────────┘ │
├────────────┴────────────────────┴───────────────┤
│  [上一步] [下一步] [自动运行] [最大轮数: 10]    │
└─────────────────────────────────────────────────┘
```

### Task 4.3: 创建房间对话框

**文件**: `src/app/rooms/page.tsx` 内或独立组件

**表单字段**:
- 房间名称 (Input)
- 讨论主题 (Textarea)
- Agent 列表 (动态增删):
  - 名称 (Input, 如 "架构师", "审查员", "执行者")
  - Provider (select: deepseek/openrouter/...)
  - Model (select, 根据 provider 变化)
  - 角色设定 (Textarea, 系统提示词)

### Task 4.4: API 客户端扩展

**文件**: `src/components/lib/api.ts`

```typescript
export interface RoomAgent {
  name: string
  provider: string
  model: string
  system_prompt: string
}

export interface Room {
  room_id: string
  name: string
  topic: string
  agents: RoomAgent[]
  message_count: number
  created_at: string
}

// 在 api 对象中增加:
rooms: () => fetchJSON<Room[]>("/api/rooms"),
createRoom: (data: { name: string; topic: string; agents: RoomAgent[] }) =>
  authFetch("/api/rooms", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  }).then(r => r.json()),
getRoom: (roomId: string) => fetchJSON<Room & { messages: RoomMessage[] }>(`/api/rooms/${roomId}`),
deleteRoom: (roomId: string) =>
  authFetch(`/api/rooms/${roomId}`, { method: "DELETE" }).then(r => r.json()),
roomNext: (roomId: string) =>
  fetchSSE(`/api/rooms/${roomId}/next`),  // SSE 流
roomRun: (roomId: string, maxTurns: number) =>
  fetchSSE(`/api/rooms/${roomId}/run?max_turns=${maxTurns}`),  // SSE 流
```

---

## Phase 5: 联调与优化

### Task 5.1: 端到端测试
- 测试模型选择器在对话中生效
- 测试聊天室创建、手动对话、自动运行
- 验证不同 provider/model 能正确切换

### Task 5.2: 用户体验优化
- 模型选择器记住上次选择 (localStorage)
- 聊天室预设常用 Agent 模板 (架构师+审查员+执行者 三件套)
- 对话气泡不同颜色对应不同 Agent
- 加载状态/错误处理
- 支持用户在对话中插话

---

## 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `server/api.py` | 修改 | +模型列表API、+ChatRequest字段、+房间CRUD、+编排逻辑 |
| `src/components/lib/api.ts` | 修改 | +ModelInfo/Room类型、+API方法 |
| `src/app/chat/page.tsx` | 修改 | +模型选择器下拉框 |
| `src/components/dashboard/app-sidebar.tsx` | 修改 | +聊天室导航 |
| `src/app/rooms/page.tsx` | 新建 | 多Agent聊天室页面 (~600行) |

---

## 风险与注意事项

1. **Provider 切换**: hermes CLI 的 `--provider` 参数可能需要对应的 API key 配置在 `~/.hermes/.env` 中。切换 provider 时如果 key 未配置会报错。
2. **并发问题**: 房间 API 使用内存存储 (ROOMS dict)，多请求需加 asyncio.Lock。
3. **SSE 兼容**: 聊天室的 SSE 路由需要 Nginx 同样配置 `proxy_buffering off` — 现有 `/api/chat` location 已匹配，但需要确认 `/api/rooms/*` 也能匹配到。
4. **Token 消耗**: 多 Agent 自动对话会消耗大量 token，建议默认 max_turns=10。
5. **同一模型多 Agent**: 如果用相同模型创建多个 Agent，hermes 应该能处理(每个子进程独立)。
