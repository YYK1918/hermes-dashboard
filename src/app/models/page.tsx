"use client"

import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api, ModelInfo } from "@/components/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { motion } from "framer-motion"
import { Plus, Trash2, Cpu, Star, Database, ChevronDown } from "lucide-react"

export default function ModelsPage() {
  const queryClient = useQueryClient()
  const [provider, setProvider] = useState("")
  const [model, setModel] = useState("")
  const [label, setLabel] = useState("")
  const [baseUrl, setBaseUrl] = useState("")
  const [apiKey, setApiKey] = useState("")
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [error, setError] = useState("")

  const { data: modelsData } = useQuery({
    queryKey: ["models"], queryFn: api.models, staleTime: 30_000,
  })

  const { data: customModels } = useQuery({
    queryKey: ["custom-models"], queryFn: api.customModels, staleTime: 30_000,
  })

  const handleAdd = async () => {
    if (!provider.trim() || !model.trim()) return
    setError("")
    try {
      await api.addModel({
        provider: provider.trim(), model: model.trim(),
        label: label.trim() || undefined,
        base_url: baseUrl.trim() || undefined,
        api_key: apiKey.trim() || undefined,
      })
      setProvider(""); setModel(""); setLabel(""); setBaseUrl(""); setApiKey("")
      setShowAdvanced(false)
      queryClient.invalidateQueries({ queryKey: ["models"] })
      queryClient.invalidateQueries({ queryKey: ["custom-models"] })
    } catch (e: any) {
      setError(e.message || "添加失败")
    }
  }

  const handleDelete = async (p: string, m: string) => {
    try {
      await api.deleteModel(p, m)
      queryClient.invalidateQueries({ queryKey: ["models"] })
      queryClient.invalidateQueries({ queryKey: ["custom-models"] })
    } catch (e: any) {
      setError(e.message || "删除失败")
    }
  }

  const allModels = modelsData?.available || []
  const builtinModels = allModels.filter(m => !(m as any).source || (m as any).source === "builtin")
  const userModels = allModels.filter(m => (m as any).source === "custom")

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Cpu className="h-6 w-6 text-primary" /> 模型管理
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          添加自定义模型，添加后可在对话页和聊天室中选择使用
        </p>
      </motion.div>

      {/* Add form */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        className="rounded-xl border bg-card p-5">
        <h3 className="text-sm font-semibold mb-3">添加自定义模型</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Provider</label>
            <Input value={provider} onChange={e => setProvider(e.target.value)}
              placeholder="deepseek / openrouter" className="text-sm"
              onKeyDown={e => e.key === "Enter" && handleAdd()} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Model</label>
            <Input value={model} onChange={e => setModel(e.target.value)}
              placeholder="deepseek-chat" className="text-sm"
              onKeyDown={e => e.key === "Enter" && handleAdd()} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">标签 (可选)</label>
            <Input value={label} onChange={e => setLabel(e.target.value)}
              placeholder="自定义显示名" className="text-sm"
              onKeyDown={e => e.key === "Enter" && handleAdd()} />
          </div>
        </div>
        {error && <p className="text-xs text-destructive mb-2">{error}</p>}

        {/* Advanced: custom endpoint */}
        <button onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-2">
          <ChevronDown className={`h-3 w-3 transition-transform ${showAdvanced ? "rotate-180" : ""}`} />
          高级设置 (自定义 API 端点)
        </button>
        {showAdvanced && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3 p-3 rounded-lg border bg-muted/20">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">API Base URL</label>
              <Input value={baseUrl} onChange={e => setBaseUrl(e.target.value)}
                placeholder="https://api.example.com/v1" className="text-xs"
                onKeyDown={e => e.key === "Enter" && handleAdd()} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">API Key</label>
              <Input value={apiKey} onChange={e => setApiKey(e.target.value)}
                placeholder="sk-..." className="text-xs" type="password"
                onKeyDown={e => e.key === "Enter" && handleAdd()} />
            </div>
            <p className="text-xs text-muted-foreground col-span-2">
              仅自定义 Provider 需要。会自动写入 hermes 配置文件。Key 加密存储，仅用于 API 调用。
            </p>
          </div>
        )}

        <Button onClick={handleAdd} disabled={!provider.trim() || !model.trim()} size="sm">
          <Plus className="h-3.5 w-3.5 mr-1" /> 添加
        </Button>
      </motion.div>

      {/* Current default */}
      {modelsData?.current && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
          className="rounded-xl border bg-muted/30 p-4 flex items-center gap-3">
          <Star className="h-4 w-4 text-amber-400" />
          <div>
            <span className="text-sm font-semibold">当前默认模型</span>
            <span className="text-sm text-muted-foreground ml-2">
              {modelsData.current.provider} / {modelsData.current.model}
            </span>
          </div>
        </motion.div>
      )}

      {/* User-added models */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Database className="h-4 w-4" /> 自定义模型 ({userModels.length})
          </h3>
        </div>
        {!userModels.length ? (
          <div className="text-center py-8 text-sm text-muted-foreground rounded-xl border bg-card">
            暂无自定义模型，使用上方表单添加
          </div>
        ) : (
          <div className="space-y-2">
            {userModels.map((m, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg border bg-card p-3">
                <div>
                  <span className="text-sm font-semibold">{m.label || `${m.provider}/${m.model}`}</span>
                  <span className="text-xs text-muted-foreground ml-2">
                    {m.provider} / {m.model}
                  </span>
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => handleDelete(m.provider, m.model)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </motion.div>

      {/* Built-in models */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
        <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
          <Database className="h-4 w-4 text-muted-foreground" /> 内置模型 ({builtinModels.length})
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {builtinModels.map((m, i) => (
            <div key={i} className="rounded-lg border bg-card p-3 text-sm">
              <span className="font-semibold">{m.label || m.model}</span>
              <div className="text-xs text-muted-foreground mt-0.5">{m.provider} / {m.model}</div>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  )
}
