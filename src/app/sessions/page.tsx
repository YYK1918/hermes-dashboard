"use client"

import { useQuery } from "@tanstack/react-query"
import { api } from "@/components/lib/api"
import { Badge } from "@/components/ui/badge"
import { motion } from "framer-motion"
import { formatDistanceToNow, parseISO } from "date-fns"
import { zhCN } from "date-fns/locale/zh-CN"
import { MessageSquare } from "lucide-react"

const platformColors: Record<string, string> = {
  cli: "bg-slate-500/10 text-slate-500 border-slate-500/20",
  telegram: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  discord: "bg-indigo-500/10 text-indigo-500 border-indigo-500/20",
  api_server: "bg-green-500/10 text-green-500 border-green-500/20",
}

export default function SessionsPage() {
  const { data: sessions, isLoading } = useQuery({
    queryKey: ["sessions"],
    queryFn: api.sessions,
  })

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div>
        <h1 className="text-2xl font-bold tracking-tight">会话</h1>
        <p className="text-sm text-muted-foreground mt-1">
          最近 20 个会话记录
        </p>
      </div>

      {isLoading ? (
        <div className="grid gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 rounded-xl border bg-card animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid gap-3">
          {sessions?.map((s, i) => (
            <motion.div
              key={s.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.03 }}
              className="flex items-center justify-between rounded-xl border bg-card p-4 hover:shadow-sm transition-shadow"
            >
              <div className="flex items-center gap-3 min-w-0">
                <MessageSquare className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{s.title}</p>
                  <p className="text-xs text-muted-foreground font-mono">
                    {s.id}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4 shrink-0">
                <Badge variant="outline" className={platformColors[s.platform] || ""}>
                  {s.platform}
                </Badge>
                <span className="text-sm tabular-nums text-muted-foreground">
                  {s.message_count} 条消息
                </span>
                <span className="text-xs text-muted-foreground w-24 text-right">
                  {s.updated_at
                    ? formatDistanceToNow(parseISO(s.updated_at), {
                        addSuffix: true,
                        locale: zhCN,
                      })
                    : "—"}
                </span>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  )
}
