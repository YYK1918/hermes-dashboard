import { useAuth } from "@/components/auth-context"

const API_BASE = typeof window !== "undefined"
  ? (window.location.port === "3000"
      ? "http://localhost:8643"   // 直连开发模式，API 在本机 8643
      : (process.env.NEXT_PUBLIC_API_URL || window.location.origin))  // Nginx 代理模式
  : (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8643")

export interface SystemStatus {
  provider: string
  model: string
  api_keys: { name: string; set: boolean }[]
  session_count: number
  message_count: number
  skill_count: number
}

export interface SessionSummary {
  id: string
  title: string
  platform: string
  message_count: number
  created_at: string
  updated_at: string
}

export interface TokenUsage {
  total: number
  input: number
  output: number
  by_model: { model: string; tokens: number }[]
  by_platform: { platform: string; tokens: number }[]
}

export interface SkillInfo {
  name: string
  description: string
  category: string
  enabled: boolean
}

export interface CronJob {
  id: string
  name: string
  schedule: string
  status: string
  prompt: string
  skills: string[]
  last_run: string | null
  run_count: number
}

export interface CronLogEntry {
  timestamp: string
  level: string
  message: string
}

export interface ModelInfo {
  provider: string
  model: string
  label: string
  is_default: boolean
  source?: string
  base_url?: string
}

export interface ModelsList {
  current: ModelInfo | null
  available: ModelInfo[]
}

export interface RoomAgentConfig {
  name: string
  provider: string
  model: string
  system_prompt: string
  is_host: boolean
}

export interface Room {
  room_id: string
  name: string
  topic: string
  agents: RoomAgentConfig[]
  message_count: number
  created_at: string
  messages?: RoomMessage[]
}

export interface RoomMessage {
  agent_name: string
  content: string
  timestamp: string
}

export interface ChatFile {
  path: string
  name: string
  size: number
  modified: string
}

export interface DashboardOverview {
  status: SystemStatus
  recent_sessions: SessionSummary[]
  tokens: TokenUsage
}

function getToken(): string | null {
  if (typeof window === "undefined") return null
  return localStorage.getItem("hermes_dashboard_token")
}

async function authFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = getToken()
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
  }
  if (token) {
    headers["Authorization"] = `Bearer ${token}`
  }
  return fetch(`${API_BASE}${path}`, { ...options, headers })
}

async function fetchJSON<T>(path: string): Promise<T> {
  const res = await authFetch(path)
  if (!res.ok) {
    if (res.status === 401) {
      localStorage.removeItem("hermes_dashboard_token")
      localStorage.removeItem("hermes_dashboard_user")
      if (typeof window !== "undefined") window.location.href = "/login"
    }
    throw new Error(`API error: ${res.status}`)
  }
  return res.json()
}

export const api = {
  overview: () => fetchJSON<DashboardOverview>("/api/overview"),
  status: () => fetchJSON<SystemStatus>("/api/status"),
  sessions: () => fetchJSON<SessionSummary[]>("/api/sessions"),
  tokens: () => fetchJSON<TokenUsage>("/api/tokens"),
  skills: () => fetchJSON<SkillInfo[]>("/api/skills"),
  models: () => fetchJSON<ModelsList>("/api/models"),

  // Model management
  customModels: () => fetchJSON<ModelInfo[]>("/api/manage/models"),
  addModel: (data: { provider: string; model: string; label?: string; base_url?: string; api_key?: string }) =>
    authFetch("/api/manage/models", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).then(r => r.ok ? r.json() : r.json().then(e => { throw new Error(e.detail) })),
  deleteModel: (provider: string, model: string) =>
    authFetch(`/api/manage/models?provider=${encodeURIComponent(provider)}&model=${encodeURIComponent(model)}`, {
      method: "DELETE",
    }).then(r => r.ok ? r.json() : r.json().then(e => { throw new Error(e.detail) })),

  cron: () => fetchJSON<CronJob[]>("/api/cron"),
  cronLogs: (jobId: string) => fetchJSON<{ job_id: string; logs: CronLogEntry[] }>(`/api/cron/${jobId}/logs`),
  cronStatus: () => fetchJSON<{ running: boolean; pid: number | null }>("/api/cron/status"),
  createCron: (data: { schedule: string; prompt?: string; name?: string; skills?: string[] }) =>
    authFetch("/api/cron", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).then(r => r.ok ? r.json() : r.json().then(e => { throw new Error(e.detail) })),
  pauseCron: (jobId: string) =>
    authFetch(`/api/cron/${jobId}/pause`, { method: "POST" }).then(r => r.json()),
  resumeCron: (jobId: string) =>
    authFetch(`/api/cron/${jobId}/resume`, { method: "POST" }).then(r => r.json()),
  runCronNow: (jobId: string) =>
    authFetch(`/api/cron/${jobId}/run`, { method: "POST" }).then(r => r.json()),
  deleteCron: (jobId: string) =>
    authFetch(`/api/cron/${jobId}`, { method: "DELETE" }).then(r => r.json()),
  health: () => fetchJSON<{ ok: boolean }>("/api/health"),
  login: (username: string, password: string) =>
    fetch(`${API_BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    }).then(r => r.ok ? r.json() : r.json().then(e => { throw new Error(e.detail) })),

  // Chat
  chat: (message: string, sessionId?: string, skills?: string[]) =>
    authFetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, session_id: sessionId, skills }),
    }).then(r => r.json()),
  chatFiles: () => fetchJSON<{ path: string; name: string; size: number; modified: string }[]>("/api/chat/files"),
  chatFileContent: (path: string) => fetchJSON<{ path: string; content: string }>(`/api/chat/files/${encodeURIComponent(path)}`),
  chatSessions: () => fetchJSON<{ session_id: string; message_count: number; preview: string }[]>("/api/chat/sessions"),
  chatHistory: (sessionId: string) => fetchJSON<{ session_id: string; messages: { role: string; content: string }[] }>(`/api/chat/${sessionId}`),
  deleteChatFile: (path: string) => authFetch(`/api/chat/files/${encodeURIComponent(path)}`, { method: "DELETE" }).then(r => r.json()),
  deleteChatSession: (sessionId: string) => authFetch(`/api/chat/sessions/${sessionId}`, { method: "DELETE" }).then(r => r.json()),

  // Rooms
  rooms: () => fetchJSON<Room[]>("/api/rooms"),
  getRoom: (roomId: string) => fetchJSON<Room & { messages: RoomMessage[] }>(`/api/rooms/${roomId}`),
  createRoom: (data: { name: string; topic: string; agents: RoomAgentConfig[] }) =>
    authFetch("/api/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).then(r => r.ok ? r.json() : r.json().then(e => { throw new Error(e.detail) })),
  deleteRoom: (roomId: string) =>
    authFetch(`/api/rooms/${roomId}`, { method: "DELETE" }).then(r => r.json()),
  roomNext: (roomId: string, message?: string) =>
    authFetch(`/api/rooms/${roomId}/next`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ room_id: roomId, message: message || "" }),
    }).then(r => {
      if (!r.ok) {
        return r.text().then(text => {
          if (text.startsWith("<")) throw new Error("服务器响应超时，请重试")
          try { const err = JSON.parse(text); throw new Error(err.detail || text) }
          catch (e: any) { if (e.message !== text) throw e; throw new Error("HTTP " + r.status) }
        })
      }
      return r.json()
    }),

  roomInterject: (roomId: string, message: string) =>
    authFetch(`/api/rooms/${roomId}/interject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    }).then(r => r.ok ? r.json() : r.json().then(e => { throw new Error(e.detail) })),

  roomUpload: (roomId: string, file: File) => {
    const form = new FormData()
    form.append("file", file)
    const token = typeof window !== "undefined" ? localStorage.getItem("hermes_dashboard_token") : null
    return fetch(`${typeof window !== "undefined" ? (window.location.port === "3000" ? "http://localhost:8643" : window.location.origin) : "http://localhost:8643"}/api/rooms/${roomId}/upload`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    }).then(r => r.ok ? r.json() : r.json().then(e => { throw new Error(e.detail) }))
  },

  roomExport: (roomId: string, format: string = "md") =>
    authFetch(`/api/rooms/${roomId}/export?format=${format}`, { method: "POST" })
      .then(r => r.ok ? r.json() : r.json().then(e => { throw new Error(e.detail) })),
}
