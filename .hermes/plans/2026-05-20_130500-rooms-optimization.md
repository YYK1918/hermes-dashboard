# 聊天室模块全面优化 — 实施计划

> **目标**: 修复聊天室现有问题 + 新增用户插话、文件上传讨论、结果导出下载功能

**架构**: 前端 SSE 流式改造 + 后端编排逻辑增强 + 文件系统集成  
**涉及文件**: `server/api.py`, `src/app/rooms/page.tsx`, `src/components/lib/api.ts`

---

## Phase 1: 修复现有核心问题

### Task 1.1: 轮数用完提前终止的根因修复

**问题**: 设置 15 轮但 1-2 轮就结束  
**根因**: `member_turn >= max_turns` 条件在 member_turn 计数有 bug — member_turn 在 `phase == "discussion"` 时才递增，但 host intro 后 phase 切换时 increment 位置不对。另外 `[READY]` 条件太宽松，成员 prompt 里写了标注 READY 就触发汇总。

**修复方案**:
1. 将 `member_turn += 1` 移到发言完成保存消息之后，而非 phase 切换时
2. 移除成员 prompt 中的"标注 [READY]"提示，改为由系统自动判断轮数
3. 仅当 `member_turn >= max_turns` 时汇总，取消 [READY] 自动触发
4. 在 SSE speaking 事件中透传 `member_turn` 和 `max_turns`

**文件**: `server/api.py:1460-1590`

### Task 1.2: 前端轮数显示修复

**问题**: 自动运行时无法显示当前进度  
**根因**: 前端 StatusCard 的 member_turn 显示使用了 `parsed.member_turn || parsed.turn`，但 speaking 事件中 member_turn 在讨论阶段才递增，intro 阶段为 0。

**修复方案**:
1. 后端在所有 speaking 事件中统一使用 `current_turn` (总轮数) 和 `max_turns`
2. 前端状态栏显示 `"第 N/M 轮"`，其中 N = current_turn (intro 算第 0 轮，讨论第 1-N 轮)
3. 底部新增进度条组件 (0% → 100%)

**文件**: `server/api.py:1493-1497`, `src/app/rooms/page.tsx:216-222`

### Task 1.3: 用户中途插话

**问题**: 自动运行时用户无法插话  
**根因**: 输入框 `disabled={running}` 阻止了输入

**修复方案**:
1. 自动运行时保持输入框可用，不 disable
2. 后端新增 `POST /api/rooms/{room_id}/interject` 端点 — 在当前发言完成后插入用户消息
3. 用户消息作为特殊的 `[用户]` role 插入对话历史，所有 agent 可见
4. 前端: 用户按 Enter 或点击发送 → 调用 interject 端点 → 消息插入 → 下一轮 agent 会读到
5. 非 running 时行为保持不变（等同于 handleNext with message）

**新增端点**:
```python
@app.post("/api/rooms/{room_id}/interject")
async def room_interject(room_id: str, body: dict):
    """User interjects a message during discussion."""
    room = ROOMS.get(room_id)
    msg = {"agent_name": "[用户]", "content": body["message"], 
           "timestamp": datetime.now().isoformat(), "phase": "user"}
    room["messages"].append(msg)
    return {"ok": True}
```

**文件**: `server/api.py` (新端点), `src/app/rooms/page.tsx` (移除 disabled, 新增 interject 调用)

---

## Phase 2: 文件上传讨论功能

### Task 2.1: 后端文件上传端点

**目标**: 用户上传文件后，内容注入到房间上下文，agent 可以读取

**实现**:
```python
@app.post("/api/rooms/{room_id}/upload")
async def room_upload(room_id: str, file: UploadFile):
    """Upload a file for agents to reference."""
    # 保存到 /tmp/hermes-rooms/{room_id}/
    # 文本文件直接读取内容，超过 10000 字截断
    # 返回文件摘要
    content = (await file.read()).decode("utf-8", errors="replace")[:10000]
    room = ROOMS.get(room_id)
    room.setdefault("files", []).append({
        "name": file.filename, 
        "size": len(content),
        "uploaded_at": datetime.now().isoformat()
    })
    # 注入到对话上下文
    room["messages"].append({
        "agent_name": "[系统]", 
        "content": f"用户上传了文件: {file.filename}\n内容:\n```\n{content}\n```",
        "timestamp": datetime.now().isoformat(), "phase": "file"
    })
    return {"ok": True, "filename": file.filename, "preview": content[:200]}
```

### Task 2.2: 前端文件上传 UI

**目标**: 聊天室顶部栏增加 📎 按钮 + 文件列表显示

**实现**:
1. Header 区域增加 `📎 上传文件` 按钮
2. 点击后弹出文件选择器 (accept=".txt,.md,.py,.js,.json,.yaml,.yml,.csv,.log,.conf,.toml,.env")
3. 上传后调用 `/api/rooms/{id}/upload`
4. 文件注入到对话流中，显示为系统消息
5. 右侧 Agent 信息面板改为 Tab 切换: Agent | 文件
6. 文件可预览 (点击文件名展开) 和删除

**文件**: `src/app/rooms/page.tsx`

### Task 2.3: Agent prompt 注入文件上下文

**目标**: Agent 发言时自动引用已上传文件

**修改**: 在 `room_next_turn` 和 `run_room_discussion` 的 prompt 构建中:
```python
# 提取文件上下文
files = room.get("files", [])
if files:
    file_context = "\n".join([f"已上传文件: {f['name']} ({f['size']} 字节)" for f in files])
    prompt = f"可参考的文件:\n{file_context}\n\n" + prompt
```

**文件**: `server/api.py` — room_next_turn 和 run_room_discussion prompt 构建处

---

## Phase 3: 讨论结果导出下载

### Task 3.1: 后端结果生成端点

**目标**: 讨论完成后，生成总结文件供下载

**实现**:
```python
@app.post("/api/rooms/{room_id}/export")
async def room_export(room_id: str, format: str = "md"):
    """Export room discussion as a file."""
    room = ROOMS.get(room_id)
    
    if format == "md":
        content = f"# {room['name']}\n\n## 课题\n{room['topic']}\n\n## 参与 Agent\n"
        for a in room["agents"]:
            content += f"- **{a['name']}** ({a['provider']}/{a['model']})\n"
        content += "\n## 讨论记录\n\n"
        for m in room["messages"]:
            content += f"### {m['agent_name']}\n{m['content']}\n\n"
        
        # 写到 /tmp/hermes-rooms/{room_id}/summary.md
        export_dir = Path(f"/tmp/hermes-rooms/{room_id}")
        export_dir.mkdir(parents=True, exist_ok=True)
        path = export_dir / "summary.md"
        path.write_text(content)
        return {"ok": True, "path": str(path), "filename": "summary.md"}
```

### Task 3.2: 前端下载按钮

**目标**: 讨论完成后显示"导出结果"按钮

**实现**:
1. 在 Header 区域或讨论完成后自动显示 `📥 导出 Markdown` 按钮
2. 点击调用 `/api/rooms/{id}/export` 
3. 下载返回的 Markdown 文件

### Task 3.3: 文件面板

**目标**: 右侧面板增加文件 Tab

**实现**:
1. 右侧面板改为 Tabs: "Agent" | "文件" | "导出"
2. "文件"Tab: 已上传文件列表 + 预览 + 删除
3. "导出"Tab: 下载 Markdown + 复制纯文本

---

## Phase 4: 体验优化

### Task 4.1: 底部状态栏增强

- 讨论中显示进度条: `████████░░░░ 4/15 轮`
- 当前发言人高亮动画
- 实时 Token 消耗估算

### Task 4.2: 消息类型可视化

- 用户消息: 蓝色背景 + 👤 图标
- 系统消息(文件上传): 灰色背景 + 📎 图标  
- Agent 消息: 保持现有样式
- 房主消息: 保留 👑 标识 + amber 边框

### Task 4.3: 错误恢复

- 单个 Agent 调用失败不终止整个讨论
- 失败时显示 ⚠️ 标记，自动跳过继续下一轮
- 连续 3 次失败则终止

---

## 文件变更清单

| 文件 | 变更量 | 说明 |
|------|--------|------|
| `server/api.py` | +120 行 | interject 端点, upload 端点, export 端点, prompt 增强, 轮数逻辑修复 |
| `src/app/rooms/page.tsx` | +150 行 | 文件上传 UI, 下载按钮, 消息类型, 进度条, 移除 disabled |
| `src/components/lib/api.ts` | +20 行 | 新增 API 方法 |

## 风险

1. **文件大小**: 大文件上传需截断 (10000 字)，二进制文件不支持
2. **安全性**: 文件路径注入需 sanitize，上传路径限制在 /tmp/hermes-rooms/
3. **内存**: 讨论历史 + 文件内容全在内存 (ROOMS dict)，大讨论可能 OOM
4. **并发**: 多房间同时运行时 hermes 子进程抢占 CPU

---

## Agent 讨论流程 (优化后)

```
1. 用户上传文件 (可选)
   └→ 文件内容注入对话上下文

2. 房主开题 (intro)
   └→ 分析课题 + 引用文件内容

3. 成员讨论 (N 轮，严格按 max_turns)
   ├→ 成员A 发言
   ├→ 成员B 发言
   ├→ 用户可随时插话 → [用户] 消息注入
   ├→ 成员A 继续...
   └→ 达到 max_turns 或用户点停止

4. 房主汇总 (summary)
   ├→ 综合所有发言 + 文件内容
   └→ 标注 [DONE]

5. 用户下载结果
   └→ 📥 导出 Markdown
```
