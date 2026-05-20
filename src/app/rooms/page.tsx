"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api, Room, RoomMessage, RoomAgentConfig } from "@/components/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import { motion, AnimatePresence } from "framer-motion"
import {
  Plus, Trash2, Send, Users, Bot, Loader2, Square,
  Play, SkipForward, X, ChevronDown, Crown, Upload, FileText, Download,
} from "lucide-react"

// ── Agent color palette ──
const AGENT_COLORS = [
  "border-l-blue-500 bg-blue-500/5",
  "border-l-emerald-500 bg-emerald-500/5",
  "border-l-purple-500 bg-purple-500/5",
  "border-l-amber-500 bg-amber-500/5",
  "border-l-rose-500 bg-rose-500/5",
  "border-l-cyan-500 bg-cyan-500/5",
]
const AGENT_TEXT_COLORS = [
  "text-blue-400", "text-emerald-400", "text-purple-400",
  "text-amber-400", "text-rose-400", "text-cyan-400",
]

// ── Pre-built templates ──
const AGENT_TEMPLATES: RoomAgentConfig[] = [
  {
    name: "架构师",
    provider: "deepseek", model: "deepseek-chat", is_host: true,
    system_prompt: "你是房主/架构师。首先分析课题，明确各成员分工，然后将课题分发给成员。讨论结束后汇总所有成员的发言，给出最终结论。你不在中间环节发言。",
  },
  {
    name: "开发工程师",
    provider: "deepseek", model: "deepseek-chat", is_host: false,
    system_prompt: "你是一个资深开发工程师。你会仔细阅读课题和前面的发言，从代码实现角度发表观点。可以赞同、补充或质疑已有观点。",
  },
  {
    name: "实施工程师",
    provider: "deepseek", model: "deepseek-chat", is_host: false,
    system_prompt: "你是一个实施/运维工程师。从部署、运维、安全角度审视课题和已有讨论，指出实施中可能遇到的问题并提出解决方案。",
  },
]

function formatModel(agent: RoomAgentConfig) {
  const m = agent.model || ""
  const s = m.includes("/") ? m.split("/").pop() || m : m
  return s.length > 16 ? s.slice(0, 14) + "..." : s
}

export default function RoomsPage() {
  const queryClient = useQueryClient()
  const [selectedRoomId, setSelectedRoomId] = useState("")
  const [messages, setMessages] = useState<RoomMessage[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [running, setRunning] = useState(false)
  const [statusText, setStatusText] = useState("")         // 状态栏文字
  const [maxTurns, setMaxTurns] = useState(6)
  const [userInput, setUserInput] = useState("")
  const abortRef = useRef<AbortController | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Create form
  const [formName, setFormName] = useState("")
  const [formTopic, setFormTopic] = useState("")
  const [formAgents, setFormAgents] = useState<RoomAgentConfig[]>([
    { name: "", provider: "deepseek", model: "deepseek-chat", system_prompt: "", is_host: false },
  ])
  const [showTemplates, setShowTemplates] = useState(false)

  const { data: rooms, refetch: refetchRooms } = useQuery({
    queryKey: ["rooms"], queryFn: api.rooms, refetchInterval: 5000,
  })

  const { data: modelsData } = useQuery({
    queryKey: ["models"], queryFn: api.models, staleTime: 120_000,
  })

  const selectedRoom = rooms?.find(r => r.room_id === selectedRoomId)
  const agentList: RoomAgentConfig[] = selectedRoom?.agents || []

  const loadRoom = useCallback(async (roomId: string) => {
    setSelectedRoomId(roomId)
    try {
      const data = await api.getRoom(roomId)
      setMessages(data.messages || [])
    } catch {}
  }, [])

  useEffect(() => {
    if (!selectedRoomId && rooms?.length) loadRoom(rooms[0].room_id)
  }, [rooms, selectedRoomId, loadRoom])

  // ── Create Room ──
  const handleCreate = async () => {
    if (!formName.trim() || !formTopic.trim() || !formAgents.some(a => a.name.trim())) return
    try {
      const r = await api.createRoom({
        name: formName, topic: formTopic,
        agents: formAgents.filter(a => a.name.trim()),
      })
      setShowCreate(false); resetForm(); refetchRooms(); loadRoom(r.room_id)
    } catch (e: any) { alert("创建失败: " + (e.message || "")) }
  }

  const resetForm = () => {
    setFormName(""); setFormTopic("")
    setFormAgents([{ name: "", provider: "deepseek", model: "deepseek-chat", system_prompt: "", is_host: false }])
    setShowTemplates(false)
  }

  const applyTemplates = () => {
    setFormAgents([...AGENT_TEMPLATES])
    if (!formName) setFormName("开发讨论组")
    if (!formTopic) setFormTopic("请讨论并实现一个新功能")
    setShowTemplates(false)
  }

  const handleDeleteRoom = async (roomId: string) => {
    try {
      await api.deleteRoom(roomId)
      if (selectedRoomId === roomId) { setSelectedRoomId(""); setMessages([]) }
      refetchRooms()
    } catch {}
  }

  // ── API helper ──
  const getApiBase = () => typeof window !== "undefined"
    ? (window.location.port === "3000"
        ? "http://localhost:8643"
        : (process.env.NEXT_PUBLIC_API_URL || window.location.origin))
    : "http://localhost:8643"

  // ── Interject (user speaks during auto-run) ──
  const handleInterject = async () => {
    if (!selectedRoomId || !userInput.trim()) return
    const msg = userInput.trim()
    setUserInput("")
    try {
      await api.roomInterject(selectedRoomId, msg)
      setMessages(prev => [...prev, {
        agent_name: "[用户]", content: msg,
        timestamp: new Date().toISOString(),
      }])
    } catch (e: any) { alert("插话失败: " + (e.message || "")) }
  }

  // ── File upload ──
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !selectedRoomId) return
    if (file.size > 1024 * 1024) { alert("文件不能超过 1MB"); return }
    try {
      const r = await api.roomUpload(selectedRoomId, file)
      setMessages(prev => [...prev, {
        agent_name: "[系统]",
        content: "上传了文件: " + file.name + " (" + formatFileSize(file.size) + ")",
        timestamp: new Date().toISOString(),
      }])
    } catch (e: any) { alert("上传失败: " + (e.message || "")) }
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  // ── Export ──
  const handleExport = async () => {
    if (!selectedRoomId) return
    try {
      const r = await api.roomExport(selectedRoomId)
      // Fetch the file and download
      const token = localStorage.getItem("hermes_dashboard_token")
      const resp = await fetch(`${getApiBase()}/api/rooms/${selectedRoomId}/export?format=md`, {
        method: "POST", headers: { Authorization: `Bearer ${token}` },
      })
      const data = await resp.json()
      // Download as file
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "text/markdown" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a"); a.href = url; a.download = "summary.md"; a.click()
      URL.revokeObjectURL(url)
    } catch (e: any) { alert("导出失败: " + (e.message || "")) }
  }

  const formatFileSize = (bytes: number) => bytes < 1024 ? bytes + "B" : (bytes / 1024).toFixed(1) + "KB"

  // ── Next Turn (single step) ──
  const handleNext = async (userMsg?: string) => {
    if (!selectedRoomId || running) return
    setRunning(true)
    setStatusText("正在等待回应...")
    try {
      const r = await api.roomNext(selectedRoomId, userMsg)
      if (r.reply) {
        setMessages(prev => [...prev, {
          agent_name: r.agent_name, content: r.reply,
          timestamp: new Date().toISOString(),
        }])
      }
      if (r.error) alert(r.error)
      if (userMsg) setUserInput("")
      refetchRooms()
    } catch (e: any) {
      alert("错误: " + (e.message || ""))
    } finally {
      setRunning(false)
      setStatusText("")
    }
  }

  // ── Auto Run (SSE streaming) ──
  const handleRun = async () => {
    if (!selectedRoomId || running) return
    setRunning(true)
    setMessages([])
    setStatusText("房主正在分析课题...")

    const controller = new AbortController()
    abortRef.current = controller
    const token = localStorage.getItem("hermes_dashboard_token")

    try {
      const resp = await fetch(`${getApiBase()}/api/rooms/${selectedRoomId}/run?max_turns=${maxTurns}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      })

      if (!resp.ok) {
        const text = await resp.text()
        if (text.startsWith("<")) throw new Error("服务器超时，请减少轮数或Agent数量")
        try { throw new Error(JSON.parse(text).detail || text) } catch (e: any) { if (e.message !== text) throw e }
        throw new Error("HTTP " + resp.status)
      }

      const reader = resp.body?.getReader()
      if (!reader) throw new Error("No reader")

      const decoder = new TextDecoder()
      let buffer = ""
      let currentEvent = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() || ""

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7).trim()
            continue
          }
          if (!line.startsWith("data: ")) continue

          let parsed: any
          try { parsed = JSON.parse(line.slice(6)) } catch { continue }

          if (currentEvent === "room.start") {
            setStatusText("讨论开始: " + (parsed.topic || ""))
            currentEvent = ""
            continue
          }

          if (currentEvent === "agent.speaking") {
            setMessages(prev => [...prev, {
              agent_name: parsed.agent, content: "",
              timestamp: new Date().toISOString(),
            }])
            setStatusText(parsed.agent + " 正在发言... 第" + (parsed.current_turn || parsed.total_turn || parsed.member_turn || parsed.turn || "?") + "/" + parsed.max_turns + "轮")
            currentEvent = ""  // ★ 关键修复：重置避免误判后续数据行
            continue
          }

          if (currentEvent === "room.done") {
            setStatusText("讨论完成 — " + (parsed.message || ""))
            currentEvent = ""
            continue
          }

          if (currentEvent === "room.complete") {
            setStatusText("达到最大轮数 — " + (parsed.message || ""))
            currentEvent = ""
            continue
          }

          if (currentEvent === "error") {
            setStatusText("错误: " + (parsed.error || ""))
            currentEvent = ""
            continue
          }

          // Content chunk (no event prefix → currentEvent was reset to "")
          if (parsed.agent && parsed.content) {
            setMessages(prev => {
              const msgs = [...prev]
              const last = msgs[msgs.length - 1]
              if (last && last.agent_name === parsed.agent && last.content === "") {
                msgs[msgs.length - 1] = { ...last, content: parsed.content }
              } else if (last && last.agent_name === parsed.agent) {
                msgs[msgs.length - 1] = { ...last, content: last.content + "\n" + parsed.content }
              } else {
                msgs.push({ agent_name: parsed.agent, content: parsed.content, timestamp: new Date().toISOString() })
              }
              return msgs
            })
          }
        }
      }

      setStatusText("运行完毕")
    } catch (err: any) {
      if (err.name !== "AbortError") {
        alert("运行出错: " + (err.message || ""))
        setStatusText("出错: " + (err.message || ""))
      } else {
        setStatusText("已停止")
      }
    } finally {
      setRunning(false)
      abortRef.current = null
      refetchRooms()
    }
  }

  const handleStop = () => {
    abortRef.current?.abort()
    setStatusText("正在停止...")
  }

  // ── Render ──

  return (
    <div className="flex h-[calc(100vh-8rem)] -m-6">
      {/* ── Room List ── */}
      <div className="w-60 border-r bg-card/50 flex flex-col shrink-0">
        <div className="p-3 flex items-center justify-between">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">聊天室</span>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowCreate(true)} title="创建房间">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <Separator />
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {!rooms?.length && (
              <div className="px-3 py-8 text-center text-xs text-muted-foreground">暂无聊天室</div>
            )}
            {rooms?.map((r) => (
              <div key={r.room_id} className="flex items-center gap-0.5 group rounded-lg hover:bg-muted/50">
                <button onClick={() => loadRoom(r.room_id)}
                  className={`flex-1 text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                    r.room_id === selectedRoomId ? "bg-primary/10 text-primary" : "hover:bg-muted text-muted-foreground"
                  }`}>
                  <div className="flex items-center gap-2">
                    <Users className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{r.name}</span>
                  </div>
                  <span className="text-xs text-muted-foreground mt-0.5 block">
                    {r.agents?.length || 0} Agent · {r.message_count} 条消息
                  </span>
                </button>
                <button onClick={() => handleDeleteRoom(r.room_id)}
                  className="p-1 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all shrink-0 mr-0.5">
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* ── Chat Area ── */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
        {!selectedRoom ? (
          <div className="flex-1 flex items-center justify-center">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center text-center px-6">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 mb-4">
                <Users className="h-8 w-8 text-primary" />
              </div>
              <h2 className="text-xl font-semibold">多 Agent 聊天室</h2>
              <p className="text-sm text-muted-foreground mt-2 max-w-sm">
                创建房间，添加多个 Agent，让它们互相协作完成复杂任务
              </p>
              <Button className="mt-4" onClick={() => setShowCreate(true)}>
                <Plus className="h-4 w-4 mr-1" /> 创建聊天室
              </Button>
            </motion.div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2 border-b shrink-0">
              <div>
                <h3 className="font-semibold text-sm">{selectedRoom.name}</h3>
                <p className="text-xs text-muted-foreground">{selectedRoom.topic}</p>
              </div>
              <div className="flex items-center gap-2">
                <input ref={fileInputRef} type="file" className="hidden"
                  onChange={handleFileUpload} accept=".txt,.md,.py,.js,.json,.yaml,.yml,.csv,.log,.conf,.toml,.env,.go,.rs,.java" />
                <Button variant="ghost" size="sm" className="h-7 text-xs"
                  onClick={() => fileInputRef.current?.click()} title="上传文件供Agent讨论">
                  <Upload className="h-3 w-3 mr-1" /> 文件
                </Button>
                <Button variant="ghost" size="sm" className="h-7 text-xs"
                  onClick={handleExport} title="导出讨论结果">
                  <FileText className="h-3 w-3 mr-1" /> 导出
                </Button>
                {/* Turn count */}
                <span className="text-xs text-muted-foreground">轮数:</span>
                  <Input type="number" min={2} max={30} value={maxTurns}
                    onChange={e => setMaxTurns(parseInt(e.target.value) || 6)}
                    className="w-14 h-7 text-xs" disabled={running} />

                {/* Running: show stop button */}
                {running ? (
                  <Button variant="destructive" size="sm" onClick={handleStop} className="h-7 text-xs">
                    <Square className="h-3 w-3 mr-1" /> 停止
                  </Button>
                ) : (
                  <>
                    <Button variant="outline" size="sm" onClick={() => handleNext()} className="h-7 text-xs" disabled={running}>
                      <SkipForward className="h-3 w-3 mr-1" /> 下一步
                    </Button>
                    <Button size="sm" onClick={handleRun} className="h-7 text-xs" disabled={running}>
                      <Play className="h-3 w-3 mr-1" /> 自动运行
                    </Button>
                  </>
                )}
              </div>
            </div>

            {/* Status bar (running state) */}
            {statusText && (
              <div className="px-4 py-1.5 border-b bg-muted/30 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  {running && <Loader2 className="h-3 w-3 animate-spin" />}
                  <span>{statusText}</span>
                  {running && maxTurns > 0 && (
                    <div className="flex-1 mx-4 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(100, parseInt(statusText.match(/\d+/)?.[0] || "0") / maxTurns * 100)}%` }} />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Messages */}
            <ScrollArea className="flex-1 min-h-0">
              <div className="px-4 py-4 space-y-4 max-w-3xl mx-auto">
                {messages.length === 0 && !running && (
                  <div className="text-center py-12 text-muted-foreground text-sm">
                    点击"自动运行"开始多 Agent 讨论
                  </div>
                )}
                <AnimatePresence>
                  {messages.map((msg, i) => {
                    const idx = agentList.findIndex(a => a.name === msg.agent_name)
                    const isUser = msg.agent_name === "[用户]"
                    const isSystem = msg.agent_name === "[系统]"
                    const colorCls = isUser ? "border-l-blue-400 bg-blue-500/10" :
                      isSystem ? "border-l-gray-400 bg-gray-500/5" :
                      idx >= 0 ? AGENT_COLORS[idx % AGENT_COLORS.length] : "border-l-muted-foreground"
                    const textCls = isUser ? "text-blue-400" :
                      isSystem ? "text-gray-400" :
                      idx >= 0 ? AGENT_TEXT_COLORS[idx % AGENT_TEXT_COLORS.length] : "text-muted-foreground"
                    const cfg = isUser || isSystem ? null : agentList[idx]
                    const icon = isUser ? "👤" : isSystem ? "📎" : null
                    return (
                      <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                        className={`rounded-lg border-l-4 p-4 ${colorCls}`}>
                        <div className="flex items-center gap-2 mb-2">
                          {cfg?.is_host && <Crown className="h-3.5 w-3.5 text-amber-400" />}
                          <Bot className="h-4 w-4" />
                          <span className={`font-semibold text-sm ${textCls}`}>
                            {msg.agent_name}{cfg?.is_host ? " (房主)" : ""}
                          </span>
                          {cfg && <Badge variant="secondary" className="text-xs font-normal">{formatModel(cfg)}</Badge>}
                          {!msg.content && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground ml-1" />}
                        </div>
                        {msg.content ? (
                          <div className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</div>
                        ) : (
                          <div className="flex gap-1.5 py-1">
                            <span className="h-2 w-2 rounded-full bg-muted-foreground/30 animate-bounce [animation-delay:0ms]" />
                            <span className="h-2 w-2 rounded-full bg-muted-foreground/30 animate-bounce [animation-delay:150ms]" />
                            <span className="h-2 w-2 rounded-full bg-muted-foreground/30 animate-bounce [animation-delay:300ms]" />
                          </div>
                        )}
                      </motion.div>
                    )
                  })}
                </AnimatePresence>
              </div>
            </ScrollArea>

            {/* User input */}
            <div className="border-t p-3">
              <div className="max-w-3xl mx-auto flex gap-2">
                <Input value={userInput} onChange={e => setUserInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); running ? handleInterject() : handleNext(userInput) } }}
                  placeholder={running ? "插话发送到讨论中 (Enter)" : "输入消息 (Enter 发送 / 下一步)"}
                  className="flex-1" />
                <Button onClick={() => running ? handleInterject() : handleNext(userInput)}
                  disabled={!userInput.trim()} size="icon">
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Agent Info Panel ── */}
      {selectedRoom && (
        <div className="w-56 border-l bg-card/50 flex flex-col shrink-0 overflow-hidden">
          <div className="p-3 flex items-center justify-between shrink-0">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Agent</span>
            <Badge variant="secondary" className="text-xs">{agentList.length}</Badge>
          </div>
          <Separator />
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-2">
              {agentList.map((a, i) => (
                <div key={i} className={`rounded-lg p-3 text-xs ${AGENT_COLORS[i % AGENT_COLORS.length]}`}>
                  <div className="flex items-center gap-1.5 mb-1">
                    {a.is_host && <Crown className="h-3 w-3 text-amber-400" />}
                    <Bot className="h-3 w-3" />
                    <span className={`font-semibold ${AGENT_TEXT_COLORS[i % AGENT_TEXT_COLORS.length]}`}>
                      {a.name}{a.is_host ? " 👑" : ""}
                    </span>
                  </div>
                  <Badge variant="secondary" className="text-xs mb-1 font-normal">{formatModel(a)}</Badge>
                  <p className="text-muted-foreground leading-relaxed line-clamp-4 mt-1">
                    {a.system_prompt || "无角色设定"}
                  </p>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}

      {/* ── Create Room Dialog ── */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center"
          onClick={() => { setShowCreate(false); resetForm() }}>
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            onClick={e => e.stopPropagation()}
            className="bg-card rounded-xl shadow-2xl border w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
            <div className="p-4 border-b flex items-center justify-between shrink-0">
              <h3 className="font-semibold">创建聊天室</h3>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setShowCreate(false); resetForm() }}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="p-4 space-y-4 overflow-y-auto flex-1">
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">房间名称</label>
                <Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="例如: 架构讨论组" />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">讨论主题 / 任务</label>
                <Input value={formTopic} onChange={e => setFormTopic(e.target.value)} placeholder="例如: 设计一个微服务架构" />
              </div>

              {/* Templates */}
              <div>
                <button onClick={() => setShowTemplates(!showTemplates)}
                  className="flex items-center gap-1 text-xs text-primary hover:underline">
                  <ChevronDown className={`h-3 w-3 transition-transform ${showTemplates ? "rotate-180" : ""}`} />
                  使用预设模板 (房主+工程师三人组)
                </button>
                {showTemplates && (
                  <div className="mt-2 p-3 rounded-lg border bg-muted/30">
                    <div className="text-xs text-muted-foreground mb-2">架构师(房主) + 开发工程师 + 实施工程师</div>
                    <Button variant="secondary" size="sm" className="text-xs mb-2" onClick={applyTemplates}>应用模板</Button>
                    {AGENT_TEMPLATES.map((t, i) => (
                      <div key={i} className="text-xs mt-1">
                        <span className="font-semibold">{t.is_host ? "👑 " : ""}{t.name}</span>
                        <span className="text-muted-foreground ml-2">{t.model}</span>
                        <p className="text-muted-foreground text-xs mt-0.5 line-clamp-2">{t.system_prompt}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Agents */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-muted-foreground">Agent 列表 (第一个为房主)</label>
                  <Button variant="ghost" size="sm" className="h-6 text-xs"
                    onClick={() => setFormAgents(prev => [...prev, { name: "", provider: "deepseek", model: "deepseek-chat", system_prompt: "", is_host: false }])}>
                    <Plus className="h-3 w-3 mr-1" /> 添加
                  </Button>
                </div>
                <div className="space-y-3">
                  {formAgents.map((agent, i) => (
                    <div key={i} className={`p-3 rounded-lg border space-y-2 ${agent.is_host ? "border-amber-500/30 bg-amber-500/5" : ""}`}>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-muted-foreground">
                          #{i + 1}
                          {agent.is_host && <span className="text-amber-400 ml-1">房主 👑</span>}
                        </span>
                        <div className="flex items-center gap-1">
                          {i !== 0 && (
                            <label className="flex items-center gap-1 text-xs cursor-pointer">
                              <input type="checkbox" checked={agent.is_host}
                                onChange={() => {
                                  const u = [...formAgents]
                                  u.forEach((a, j) => { if (j !== 0) u[j] = { ...a, is_host: j === i } })
                                  setFormAgents(u)
                                }}
                                className="h-3 w-3" />
                              设为房主
                            </label>
                          )}
                          {formAgents.length > 1 && (
                            <Button variant="ghost" size="icon" className="h-5 w-5"
                              onClick={() => setFormAgents(prev => prev.filter((_, j) => j !== i))}>
                              <X className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </div>
                      <Input value={agent.name}
                        onChange={e => { const u = [...formAgents]; u[i] = { ...u[i], name: e.target.value }; setFormAgents(u) }}
                        placeholder={i === 0 && agent.is_host ? "房主名称 (如: 架构师)" : "Agent 名称 (如: 开发工程师)"}
                        className="text-sm" />
                      <div className="flex gap-2">
                        <select
                          value={`${agent.provider}:${agent.model}`}
                          onChange={e => {
                            const val = e.target.value
                            if (!val) return
                            const idx = val.indexOf(":")
                            const u = [...formAgents]
                            u[i] = { ...u[i], provider: val.slice(0, idx), model: val.slice(idx + 1) }
                            setFormAgents(u)
                          }}
                          className="text-xs bg-transparent border rounded-md px-2 py-1.5 outline-none flex-1"
                        >
                          {modelsData?.available?.map(m => (
                            <option key={`${m.provider}:${m.model}`} value={`${m.provider}:${m.model}`}>
                              {m.label || `${m.provider}/${m.model}`}
                            </option>
                          ))}
                        </select>
                      </div>
                      <Input value={agent.system_prompt}
                        onChange={e => { const u = [...formAgents]; u[i] = { ...u[i], system_prompt: e.target.value }; setFormAgents(u) }}
                        placeholder={i === 0 ? "房主角色设定..." : "角色设定 (system prompt)..."}
                        className="text-xs" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="p-4 border-t flex justify-end gap-2 shrink-0">
              <Button variant="outline" onClick={() => { setShowCreate(false); resetForm() }}>取消</Button>
              <Button onClick={handleCreate}
                disabled={!formName.trim() || !formTopic.trim() || !formAgents.some(a => a.name.trim())}>
                创建
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  )
}
