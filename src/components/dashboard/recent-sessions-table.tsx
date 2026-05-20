"use client"

import { SessionSummary } from "@/components/lib/api"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { MessageSquare, ExternalLink } from "lucide-react"
import { motion } from "framer-motion"
import { formatDistanceToNow, parseISO } from "date-fns"
import { zhCN } from "date-fns/locale/zh-CN"

interface RecentSessionsTableProps {
  sessions: SessionSummary[]
}

const platformColors: Record<string, string> = {
  cli: "bg-slate-500/10 text-slate-500 border-slate-500/20",
  telegram: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  discord: "bg-indigo-500/10 text-indigo-500 border-indigo-500/20",
  api_server: "bg-green-500/10 text-green-500 border-green-500/20",
  slack: "bg-purple-500/10 text-purple-500 border-purple-500/20",
}

export function RecentSessionsTable({ sessions }: RecentSessionsTableProps) {
  if (sessions.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center">
        <MessageSquare className="h-8 w-8 mx-auto text-muted-foreground/40" />
        <p className="mt-2 text-sm text-muted-foreground">暂无会话记录</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-[300px]">会话</TableHead>
            <TableHead className="w-[80px]">平台</TableHead>
            <TableHead className="w-[80px] text-right">消息</TableHead>
            <TableHead className="w-[140px] text-right">最近活动</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sessions.slice(0, 10).map((session, i) => (
            <motion.tr
              key={session.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.03 }}
              className="group"
            >
              <TableCell>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground truncate max-w-[240px]">
                    {session.title}
                  </span>
                </div>
              </TableCell>
              <TableCell>
                <Badge
                  variant="outline"
                  className={
                    platformColors[session.platform] ||
                    "bg-muted text-muted-foreground"
                  }
                >
                  {session.platform}
                </Badge>
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {session.message_count}
              </TableCell>
              <TableCell className="text-right text-xs text-muted-foreground">
                {session.updated_at
                  ? formatDistanceToNow(parseISO(session.updated_at), {
                      addSuffix: true,
                      locale: zhCN,
                    })
                  : "—"}
              </TableCell>
            </motion.tr>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
