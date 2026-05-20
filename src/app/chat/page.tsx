"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api, ChatFile } from "@/components/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import { motion, AnimatePresence } from "framer-motion"
import {
  Send, Plus, MessageSquare, FileText, Download,
  File, FileCode, FileImage, Loader2, Terminal,
  PanelRightOpen, PanelRightClose, ChevronLeft,
  Square, Paperclip, Clock, Brain, Wrench, Copy, Check, Trash2,
  PanelLeftOpen, PanelLeftClose,
} from "lucide-react"

// ── Types ──

interface Message {
  role: "user" | "assistant"
  content: string
  toolCalls?: ToolCallEvent[]
}

interface ToolCallEvent {
  tool: string
  emoji: string
  label: string
  status: "running" | "completed"
  toolCallId: string
  duration?: number
}

interface StreamMeta {
  tokens: number
  toolCount: number
  elapsed: number
}

// ── Helpers ──

const TOOL_EMOJI: Record<string, string> = {
  write_file: "📝", read_file: "📖", patch: "🔧",
  terminal: "💻", execute_code: "🐍",
  browser_navigate: "🌐", browser_click: "🖱️", browser_snapshot: "📸",
  web_search: "🔍", search_files: "🔎",
  delegate_task: "🤖", skill_view: "📚",
  memory: "🧠", vision_analyze: "👁️",
}

function getFileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase()
  if (["py","js","ts","tsx","jsx","go","rs","java","sh"].includes(ext||"")) return <FileCode className="h-4 w-4" />
  if (["png","jpg","jpeg","gif","svg","webp"].includes(ext||"")) return <FileImage className="h-4 w-4" />
  return <File className="h-4 w-4" />
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024*1024) return `${(bytes/1024).toFixed(1)}KB`
  return `${(bytes/(1024*1024)).toFixed(1)}MB`
}

function formatTokens(n: number) {
  if (n >= 1000000) return `${(n/1000000).toFixed(1)}M`
  if (n >= 1000) return `${(n/1000).toFixed(0)}K`
  return n.toString()
}

// ── Component ──

export default function ChatPage() {
  const queryClient = useQueryClient()
  const [sessionId, setSessionId] = useState("")
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [streaming, setStreaming] = useState(false)
  const [files, setFiles] = useState<ChatFile[]>([])
  const [showFiles, setShowFiles] = useState(true)
  const [showSessions, setShowSessions] = useState(true)
  const [viewingFile, setViewingFile] = useState<{ path: string; content: string } | null>(null)
  const [meta, setMeta] = useState<StreamMeta>({ tokens: 0, toolCount: 0, elapsed: 0 })
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)
  const [selectedSkills, setSelectedSkills] = useState<string[]>([])
  const [skillSearch, setSkillSearch] = useState("")
  const [showSkillPicker, setShowSkillPicker] = useState(false)
  const [selectedModel, setSelectedModel] = useState("")
  const [selectedProvider, setSelectedProvider] = useState("")
  const [sessionWidth, setSessionWidth] = useState(224)
  const [filePanelWidth, setFilePanelWidth] = useState(280)
  const [resizing, setResizing] = useState<"session" | "files" | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  const { data: chatSessions, refetch: refetchSessions } = useQuery({
    queryKey: ["chat-sessions"], queryFn: api.chatSessions, refetchInterval: 5000,
  })

  const { data: initialFiles } = useQuery({
    queryKey: ["chat-files"], queryFn: api.chatFiles, refetchInterval: 10000,
  })

  const { data: allSkills } = useQuery({
    queryKey: ["skills"], queryFn: api.skills, staleTime: 60_000,
  })

  const { data: modelsData } = useQuery({
    queryKey: ["models"], queryFn: api.models, staleTime: 120_000,
  })

  // Restore saved model + auto-select default
  useEffect(() => {
    const saved = localStorage.getItem("hermes_chat_model")
    if (saved) {
      try {
        const { provider, model } = JSON.parse(saved)
        setSelectedProvider(provider || "")
        setSelectedModel(model || "")
      } catch {}
    } else if (modelsData?.current) {
      setSelectedProvider(modelsData.current.provider)
      setSelectedModel(modelsData.current.model)
    }
  }, [modelsData])

  // Persist model selection
  useEffect(() => {
    if (selectedModel) {
      localStorage.setItem("hermes_chat_model", JSON.stringify({
        provider: selectedProvider,
        model: selectedModel,
      }))
    }
  }, [selectedModel, selectedProvider])

  // Sync initial files (only if our local state is empty)
  useEffect(() => {
    if (initialFiles?.length && files.length === 0) {
      setFiles(initialFiles)
    }
  }, [initialFiles])

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })

  useEffect(() => { if (!streaming) scrollToBottom() }, [messages, streaming])

  // Resize handlers
  useEffect(() => {
    if (!resizing) return
    const handleMouseMove = (e: MouseEvent) => {
      if (resizing === "session") {
        setSessionWidth(prev => Math.max(160, Math.min(400, prev + e.movementX)))
      } else if (resizing === "files") {
        setFilePanelWidth(prev => Math.max(200, Math.min(500, prev - e.movementX)))
      }
    }
    const handleMouseUp = () => setResizing(null)
    window.addEventListener("mousemove", handleMouseMove)
    window.addEventListener("mouseup", handleMouseUp)
    return () => {
      window.removeEventListener("mousemove", handleMouseMove)
      window.removeEventListener("mouseup", handleMouseUp)
    }
  }, [resizing])

  const loadSession = useCallback(async (sid: string) => {
    setSessionId(sid)
    try {
      const data = await api.chatHistory(sid)
      setMessages(data.messages as Message[])
    } catch {}
    // Load files for this session
    try {
      const fres = await api.chatFiles()
      if (fres?.length) setFiles(fres)
    } catch {}
  }, [])

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files?.length) return
    for (const file of Array.from(files).slice(0, 5)) {
      if (file.size > 1024 * 1024) continue
      const text = await file.text()
      setInput(prev => prev + `\n\n[文件: ${file.name}]\n\`\`\`\n${text.slice(0, 5000)}\n\`\`\``)
    }
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const handleSend = async () => {
    if (!input.trim() || streaming) return
    const userMsg = input.trim()
    setInput("")
    const userMessage: Message = { role: "user", content: userMsg }
    setMessages(prev => [...prev, userMessage])
    setStreaming(true)
    setMeta({ tokens: 0, toolCount: 0, elapsed: 0 })

    // Timer
    const startTime = Date.now()
    timerRef.current = setInterval(() => {
      setMeta(prev => ({ ...prev, elapsed: (Date.now() - startTime) / 1000 }))
    }, 100)

    const controller = new AbortController()
    abortRef.current = controller

    // Assistant message placeholder
    const assistantMsg: Message = { role: "assistant", content: "", toolCalls: [] }
    setMessages(prev => [...prev, assistantMsg])

    try {
      const token = localStorage.getItem("hermes_dashboard_token")
      const apiBase = typeof window !== "undefined"
        ? (window.location.port === "3000" ? "http://localhost:8643" : window.location.origin)
        : "http://localhost:8643"

      const response = await fetch(`${apiBase}/api/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: userMsg, session_id: sessionId || undefined, skills: selectedSkills, provider: selectedProvider, model: selectedModel }),
        signal: controller.signal,
      })

      if (!response.ok) throw new Error(`HTTP ${response.status}`)

      const reader = response.body?.getReader()
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
          const data = line.slice(6)

          if (currentEvent === "hermes.tool.progress") {
            try {
              const evt: ToolCallEvent = JSON.parse(data)
              setMessages(prev => {
                const last = prev[prev.length - 1]
                if (last?.role !== "assistant") return prev
                const existing = last.toolCalls || []
                const idx = existing.findIndex(t => t.toolCallId === evt.toolCallId)
                const updated = [...existing]
                if (idx >= 0) updated[idx] = evt
                else updated.push(evt)
                return [...prev.slice(0, -1), { ...last, toolCalls: updated }]
              })
              if (evt.status === "running") setMeta(prev => ({ ...prev, toolCount: prev.toolCount + 1 }))
            } catch {}
            currentEvent = ""
            continue
          }

          if (currentEvent === "hermes.done") {
            try {
              const done: any = JSON.parse(data)
              if (!sessionId) setSessionId(done.session_id)
              setMeta(prev => ({
                ...prev,
                tokens: done.usage?.total_tokens || 0,
              }))
              if (done.files?.length) setFiles(prev => {
                const m = new Map(prev.map(f => [f.path, f]))
                done.files.forEach((f: any) => m.set(f.path, f))
                return Array.from(m.values()).sort((a: any, b: any) => b.modified.localeCompare(a.modified))
              })
              refetchSessions()
            } catch {}
            currentEvent = ""
            continue
          }

          if (currentEvent === "error") {
            try {
              const err = JSON.parse(data)
              setMessages(prev => {
                const last = prev[prev.length - 1]
                return [...prev.slice(0, -1), { ...last, content: `❌ ${err.error}` }]
              })
            } catch {}
            currentEvent = ""
            continue
          }

          // Regular delta content
          try {
            const chunk = JSON.parse(data)
            const content = chunk?.choices?.[0]?.delta?.content || ""
            if (content) {
              setMessages(prev => {
                const last = prev[prev.length - 1]
                return [...prev.slice(0, -1), { ...last, content: last.content + content }]
              })
            }
          } catch {}
        }
      }
    } catch (err: any) {
      if (err.name === "AbortError") {
        setMessages(prev => {
          const last = prev[prev.length - 1]
          return [...prev.slice(0, -1), { ...last, content: last.content + "\n\n_已停止生成_" }]
        })
      } else {
        setMessages(prev => {
          const last = prev[prev.length - 1]
          return [...prev.slice(0, -1), { ...last, content: `❌ 错误: ${err.message}` }]
        })
      }
    } finally {
      setStreaming(false)
      abortRef.current = null
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }

  const handleStop = () => {
    abortRef.current?.abort()
  }

  const handleNewSession = () => {
    // If there's an active session, it was already saved via hermes.done
    // Just switch to a fresh session — old one stays in the sidebar
    setSessionId("")
    setMessages([])
    setMeta({ tokens: 0, toolCount: 0, elapsed: 0 })
    setViewingFile(null)
    // Refresh session list so old session appears immediately
    refetchSessions()
  }

  const handleViewFile = async (filePath: string) => {
    try {
      const data = await api.chatFileContent(filePath)
      setViewingFile({ path: data.path, content: data.content })
    } catch {}
  }

  const handleDownload = (filePath: string, content: string) => {
    const ext = filePath.split(".").pop()?.toLowerCase() || ""
    const binaryExts = ["docx","xlsx","pptx","pdf","png","jpg","jpeg","gif","webp","mp4","mp3","zip","gz"]
    const isBinary = binaryExts.includes(ext)

    let blob: Blob
    if (isBinary && /^[A-Za-z0-9+/=]+$/.test(content.slice(0, 100))) {
      // Base64 decode
      const binary = atob(content)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      blob = new Blob([bytes], { type: "application/octet-stream" })
    } else {
      blob = new Blob([content], { type: "text/plain;charset=utf-8" })
    }

    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filePath.split("/").pop() || "file"
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleCopy = async (text: string, idx: number) => {
    await navigator.clipboard.writeText(text)
    setCopiedIdx(idx)
    setTimeout(() => setCopiedIdx(null), 2000)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  // ── Render ──

  const renderToolCalls = (calls: ToolCallEvent[] | undefined) => {
    if (!calls?.length) return null
    return (
      <div className="mt-2 space-y-1">
        {calls.map((tc) => (
          <div key={tc.toolCallId} className={`flex items-center gap-2 px-2 py-1 rounded-md text-xs ${
            tc.status === "running" ? "bg-amber-500/10 text-amber-600 animate-pulse" : "bg-muted/50 text-muted-foreground"
          }`}>
            <span>{tc.emoji || TOOL_EMOJI[tc.tool] || "🔧"}</span>
            <span className="font-mono">{tc.tool}</span>
            <span className="truncate">{tc.label}</span>
            <span className="ml-auto shrink-0">{tc.status === "completed" ? "✓" : "⏳"}</span>
          </div>
        ))}
      </div>
    )
  }

  const renderContent = (text: string, msgIdx: number) => {
    const parts = text.split(/(```[\s\S]*?```)/g)
    return parts.map((part, i) => {
      if (part.startsWith("```")) {
        const lines = part.split("\n")
        const lang = lines[0].replace("```", "").trim()
        const code = lines.slice(1, -1).join("\n")
        const codeIdx = `${msgIdx}-${i}`
        return (
          <div key={i} className="my-2 rounded-lg border bg-muted/30 overflow-hidden group">
            <div className="flex items-center justify-between px-3 py-1 bg-muted/50 border-b">
              <span className="text-xs text-muted-foreground font-mono">{lang || "code"}</span>
              <Button
                variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => handleCopy(code, msgIdx * 1000 + i)}
              >
                {copiedIdx === msgIdx * 1000 + i ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
              </Button>
            </div>
            <pre className="p-3 text-xs overflow-x-auto"><code>{code}</code></pre>
          </div>
        )
      }
      const boldParts = part.split(/(\*\*.*?\*\*)/g)
      return <span key={i}>{boldParts.map((bp, j) =>
        bp.startsWith("**") && bp.endsWith("**")
          ? <strong key={j}>{bp.slice(2, -2)}</strong>
          : <span key={j} className="whitespace-pre-wrap">{bp}</span>
      )}</span>
    })
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] -m-6">
      {/* Session List */}
      {showSessions && (
      <div className="border-r bg-card/50 flex flex-col shrink-0 overflow-hidden" style={{ width: sessionWidth }}>
        <div className="p-3 shrink-0 flex items-center justify-between">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">会话列表</span>
        </div>
        <Separator />
        <ScrollArea className="flex-1 min-h-0">
          <div className="p-2 space-y-1">
            {chatSessions?.map((s) => (
              <div key={s.session_id} className="flex items-center gap-0.5 group rounded-lg hover:bg-muted/50 min-w-0">
                <button onClick={() => loadSession(s.session_id)}
                  className={`flex-1 min-w-0 text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                    s.session_id === sessionId ? "bg-primary/10 text-primary" : "hover:bg-muted text-muted-foreground"}`}>
                  <div className="flex items-center gap-2 min-w-0">
                    <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate block">{s.preview || s.session_id}</span>
                  </div>
                  <span className="text-xs text-muted-foreground mt-0.5 block">{s.message_count} 条消息</span>
                </button>
                <button
                  onClick={async () => {
                    try {
                      await api.deleteChatSession(s.session_id)
                      if (s.session_id === sessionId) handleNewSession()
                      refetchSessions()
                    } catch {}
                  }}
                  className="p-1 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all shrink-0 mr-0.5"
                  title="删除会话"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>
      )}

      {/* Resize handle: session <-> chat */}
      {showSessions && (
        <div
          className="w-1 hover:w-1.5 bg-border hover:bg-primary/50 cursor-col-resize transition-all shrink-0 relative group"
          onMouseDown={() => setResizing("session")}
        >
          <div className="absolute inset-y-0 -left-1 -right-1" />
        </div>
      )}

      {/* Chat Area */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden" style={{ minWidth: 320 }}>
        {/* Top bar with toggle buttons and model selector */}
        <div className="flex items-center justify-between px-2 py-1 border-b shrink-0">
          <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowSessions(!showSessions)} title={showSessions ? "隐藏会话列表" : "显示会话列表"}>
            {showSessions ? <PanelLeftClose className="h-3.5 w-3.5" /> : <PanelLeftOpen className="h-3.5 w-3.5" />}
          </Button>
          {/* Model Selector */}
          <select
            value={selectedModel ? `${selectedProvider}:${selectedModel}` : ""}
            onChange={(e) => {
              const val = e.target.value
              if (!val) { setSelectedProvider(""); setSelectedModel("") }
              else {
                const idx = val.indexOf(":")
                setSelectedProvider(val.slice(0, idx))
                setSelectedModel(val.slice(idx + 1))
              }
            }}
            className="text-xs bg-transparent border rounded-md px-2 py-1 outline-none cursor-pointer hover:bg-muted/50 transition-colors max-w-[160px] truncate"
            title={selectedModel ? `${selectedProvider}/${selectedModel}` : "默认模型"}
          >
            <option value="">默认</option>
            {modelsData?.available?.map(m => (
              <option key={`${m.provider}:${m.model}`} value={`${m.provider}:${m.model}`}>
                {m.label || m.model}
              </option>
            ))}
          </select>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleNewSession} title="新建会话">
              <Plus className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowFiles(!showFiles)} title={showFiles ? "隐藏文件面板" : "显示文件面板"}>
              {showFiles ? <PanelRightClose className="h-3.5 w-3.5" /> : <PanelRightOpen className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>
        <ScrollArea className="flex-1 min-h-0 px-4">
          <div className={`mx-auto py-4 space-y-6 ${
            !showSessions && !showFiles ? "max-w-4xl" :
            !showSessions || !showFiles ? "max-w-3xl" : "max-w-2xl"
          }`}>
            {messages.length === 0 && !streaming && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                className="flex flex-col items-center justify-center py-20 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 mb-4">
                  <Terminal className="h-8 w-8 text-primary" />
                </div>
                <h2 className="text-xl font-semibold">Hermes Chat</h2>
                <p className="text-sm text-muted-foreground mt-2 max-w-md">实时流式对话 · 工具调用可视化 · 文件生成追踪</p>
                <div className="flex flex-wrap gap-2 mt-4 justify-center">
                  {["写一个 Python 脚本", "生成一个 HTML 页面", "创建一个 nginx 配置"].map(hint => (
                    <button key={hint} onClick={() => { setInput(hint); setTimeout(handleSend, 100) }}
                      className="px-3 py-1.5 rounded-full border text-xs text-muted-foreground hover:bg-muted transition-colors">{hint}</button>
                  ))}
                </div>
              </motion.div>
            )}

            <AnimatePresence>
              {messages.map((msg, i) => (
                <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                  className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}>
                  {msg.role === "assistant" && (
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                      <Terminal className="h-4 w-4 text-primary" />
                    </div>
                  )}
                  <div className={`rounded-2xl px-4 py-3 max-w-[80%] text-sm ${
                    msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                    {renderToolCalls(msg.toolCalls)}
                    {msg.content ? renderContent(msg.content, i) : (streaming && i === messages.length - 1 ? null : <span className="text-muted-foreground italic">无响应</span>)}
                  </div>
                  {msg.role === "user" && (
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary">
                      <span className="text-xs font-bold text-primary-foreground">你</span>
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>

            {streaming && messages[messages.length - 1]?.content === "" && !messages[messages.length - 1]?.toolCalls?.length && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <Terminal className="h-4 w-4 text-primary" />
                </div>
                <div className="rounded-2xl px-4 py-3 bg-muted">
                  <div className="flex gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-primary/40 animate-bounce [animation-delay:0ms]" />
                    <span className="h-2 w-2 rounded-full bg-primary/40 animate-bounce [animation-delay:150ms]" />
                    <span className="h-2 w-2 rounded-full bg-primary/40 animate-bounce [animation-delay:300ms]" />
                  </div>
                </div>
              </motion.div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        {/* Status Bar */}
        {(meta.elapsed > 0 || streaming) && (
          <div className="border-t px-4 py-1.5 flex items-center gap-4 text-xs text-muted-foreground">
            <div className={`mx-auto w-full flex items-center gap-4 ${
              !showSessions && !showFiles ? "max-w-4xl" : !showSessions || !showFiles ? "max-w-3xl" : "max-w-2xl"
            }`}>
            <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{meta.elapsed.toFixed(1)}s</span>
            {meta.tokens > 0 && <span className="flex items-center gap-1"><Brain className="h-3 w-3" />{formatTokens(meta.tokens)} tokens</span>}
            {meta.toolCount > 0 && <span className="flex items-center gap-1"><Wrench className="h-3 w-3" />{meta.toolCount} 工具调用</span>}
            </div>
          </div>
        )}

        {/* Input */}
        <div className="border-t p-4">
          {/* Skill badges */}
          {selectedSkills.length > 0 && (
            <div className="max-w-3xl mx-auto flex flex-wrap gap-1.5 mb-2">
              {selectedSkills.map(skill => (
                <Badge key={skill} variant="secondary" className="gap-1 cursor-pointer text-xs" onClick={() => setSelectedSkills(prev => prev.filter(s => s !== skill))}>
                  {skill} <span className="text-muted-foreground">×</span>
                </Badge>
              ))}
            </div>
          )}
          <div className={`mx-auto flex gap-2 ${
            !showSessions && !showFiles ? "max-w-4xl" : !showSessions || !showFiles ? "max-w-3xl" : "max-w-2xl"
          }`}>
            <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileUpload} accept=".txt,.py,.js,.ts,.tsx,.jsx,.json,.yaml,.yml,.md,.html,.css,.sh,.conf,.toml,.ini,.env,.go,.rs,.java" />
            <Button variant="ghost" size="icon" className="shrink-0" onClick={() => fileInputRef.current?.click()} title="上传文件">
              <Paperclip className="h-4 w-4" />
            </Button>
            {/* Skill picker */}
            <div className="relative">
              <Button variant="ghost" size="icon" className="shrink-0" onClick={() => setShowSkillPicker(!showSkillPicker)} title="加载技能">
                <Wrench className="h-4 w-4" />
              </Button>
              {showSkillPicker && (
                <div className="absolute bottom-full left-0 mb-2 w-64 rounded-xl border bg-card shadow-xl z-50 overflow-hidden">
                  <div className="p-2 border-b">
                    <input
                      className="w-full text-xs bg-transparent outline-none placeholder:text-muted-foreground"
                      placeholder="搜索技能..."
                      value={skillSearch}
                      onChange={e => setSkillSearch(e.target.value)}
                      autoFocus
                    />
                  </div>
                  <div className="max-h-48 overflow-y-auto">
                    {(allSkills || []).filter(s => !skillSearch || s.name.toLowerCase().includes(skillSearch.toLowerCase())).slice(0, 30).map(s => {
                      const isSelected = selectedSkills.includes(s.name)
                      return (
                        <button
                          key={s.name}
                          onClick={() => {
                            setSelectedSkills(prev => isSelected ? prev.filter(x => x !== s.name) : [...prev, s.name])
                          }}
                          className={`w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition-colors flex items-center gap-2 ${
                            isSelected ? "bg-primary/10 text-primary" : ""
                          }`}
                        >
                          <span className={isSelected ? "text-primary" : "text-muted-foreground"}>{isSelected ? "✓" : "○"}</span>
                          <span className="truncate">{s.name}</span>
                        </button>
                      )
                    })}
                  </div>
                  <div className="p-2 border-t">
                    <button
                      onClick={() => { setShowSkillPicker(false); setSkillSearch("") }}
                      className="w-full text-xs text-muted-foreground hover:text-foreground py-1"
                    >
                      关闭
                    </button>
                  </div>
                </div>
              )}
            </div>
            <Input value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown}
              placeholder="输入消息... (Enter 发送)" disabled={streaming} className="flex-1" />
            {streaming ? (
              <Button variant="destructive" size="icon" onClick={handleStop} title="停止生成">
                <Square className="h-4 w-4" />
              </Button>
            ) : (
              <Button onClick={handleSend} disabled={!input.trim()} size="icon">
                <Send className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Resize handle: chat <-> files */}
      {showFiles && (
        <div
          className="w-1 hover:w-1.5 bg-border hover:bg-primary/50 cursor-col-resize transition-all shrink-0 relative"
          onMouseDown={() => setResizing("files")}
        >
          <div className="absolute inset-y-0 -left-1 -right-1" />
        </div>
      )}

      {/* File Panel */}
      <AnimatePresence>
        {showFiles && (
          <motion.div initial={{ width: 0, opacity: 0 }} animate={{ width: filePanelWidth, opacity: 1 }} exit={{ width: 0, opacity: 0 }}
            className="border-l bg-card/50 flex flex-col shrink-0 overflow-hidden">
            <div className="p-3 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2"><FileText className="h-4 w-4 text-muted-foreground" /><span className="text-sm font-medium">生成文件</span></div>
              <Badge variant="secondary" className="text-xs">{files.length}</Badge>
            </div>
            <Separator />
            {viewingFile ? (
              <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                <div className="flex items-center justify-between p-2 border-b shrink-0">
                  <button onClick={() => setViewingFile(null)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                    <ChevronLeft className="h-3 w-3" />返回
                  </button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDownload(viewingFile.path, viewingFile.content)} title="下载">
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="p-2 border-b shrink-0"><div className="flex items-center gap-2">{getFileIcon(viewingFile.path)}<span className="text-xs font-mono truncate">{viewingFile.path}</span></div></div>
                {(() => {
                  const ext = viewingFile.path.split(".").pop()?.toLowerCase() || ""
                  const binary = ["docx","xlsx","pptx","pdf","png","jpg","jpeg","gif","webp","mp4","mp3","zip","gz"]
                  if (binary.includes(ext)) {
                    return (
                      <div className="flex-1 flex items-center justify-center p-6 text-center">
                        <div>
                          <File className="h-12 w-12 mx-auto text-muted-foreground/30" />
                          <p className="text-sm text-muted-foreground mt-3">二进制文件无法预览</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {ext.toUpperCase()} 文件 · {formatSize(viewingFile.content.length)}
                          </p>
                          <Button variant="outline" size="sm" className="mt-3" onClick={() => handleDownload(viewingFile.path, viewingFile.content)}>
                            <Download className="mr-2 h-3.5 w-3.5" />
                            下载文件
                          </Button>
                        </div>
                      </div>
                    )
                  }
                  return <ScrollArea className="flex-1 min-h-0"><pre className="p-3 text-xs font-mono whitespace-pre-wrap break-all">{viewingFile.content}</pre></ScrollArea>
                })()}
              </div>
            ) : files.length > 0 ? (
              <ScrollArea className="flex-1 min-h-0">
                <div className="p-2 space-y-1">
                  {files.map(f => (
                    <div key={f.path} className="flex items-center gap-1 rounded-lg hover:bg-muted transition-colors group">
                      <button onClick={() => handleViewFile(f.path)}
                        className="flex-1 flex items-center gap-3 p-2 text-left min-w-0">
                        {getFileIcon(f.name)}
                        <div className="min-w-0 flex-1"><p className="text-xs font-mono truncate">{f.name}</p><p className="text-xs text-muted-foreground">{formatSize(f.size)}</p></div>
                      </button>
                      <button
                        onClick={async () => {
                          try { await api.deleteChatFile(f.path); setFiles(prev => prev.filter(x => x.path !== f.path)) } catch {}
                        }}
                        className="p-1 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"
                        title="删除文件"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <div className="flex-1 flex items-center justify-center"><div className="text-center p-4"><File className="h-8 w-8 mx-auto text-muted-foreground/30" /><p className="text-xs text-muted-foreground mt-2">暂无生成文件</p></div></div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
