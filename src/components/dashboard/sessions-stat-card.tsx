"use client"

import { StatCounter } from "@/components/dashboard/stat-counter"
import { MessageSquare, MessagesSquare } from "lucide-react"

interface SessionsStatCardProps {
  count: number
  messages: number
}

export function SessionsStatCard({ count, messages }: SessionsStatCardProps) {
  return (
    <div className="flex flex-col h-full justify-between">
      <div>
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10">
            <MessageSquare className="h-4 w-4 text-blue-500" />
          </div>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            会话
          </h3>
        </div>
        <StatCounter value={count} className="text-3xl font-bold mt-2 block" />
      </div>
      <div className="flex items-center gap-1.5">
        <MessagesSquare className="h-3 w-3 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">
          <StatCounter value={messages} className="font-medium" /> 条消息
        </span>
      </div>
    </div>
  )
}
