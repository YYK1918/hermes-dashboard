"use client"

import { SystemStatus } from "@/components/lib/api"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { motion } from "framer-motion"
import { Cpu, Key, CheckCircle2, XCircle } from "lucide-react"

interface StatusCardProps {
  status: SystemStatus
}

export function StatusCard({ status }: StatusCardProps) {
  const pulseVariants = {
    idle: { scale: 1, opacity: 0.6 },
    pulse: {
      scale: [1, 1.3, 1],
      opacity: [0.6, 1, 0.6],
      transition: { duration: 2, repeat: Infinity, ease: "easeInOut" as const },
    },
  }

  return (
    <div className="flex flex-col h-full justify-between">
      {/* Header */}
      <div>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            系统状态
          </h3>
          <motion.div
            variants={pulseVariants}
            animate="pulse"
            className="flex items-center gap-1.5"
          >
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
            </span>
            <span className="text-xs text-green-500 font-medium">在线</span>
          </motion.div>
        </div>

        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-2">
            <Cpu className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-sm text-muted-foreground">{status.provider}</span>
            <Badge variant="secondary" className="text-xs font-mono">
              {status.model}
            </Badge>
            {(status as any).is_default_model && (
              <Badge variant="default" className="text-xs">默认</Badge>
            )}
          </div>
        </div>

        <Separator className="my-3" />

        {/* API Keys */}
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <Key className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
              API Keys
            </span>
          </div>
          <div className="grid grid-cols-2 gap-1">
            {status.api_keys.slice(0, 8).map((key) => (
              <div
                key={key.name}
                className="flex items-center gap-1.5 text-xs py-0.5"
              >
                {key.set ? (
                  <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />
                ) : (
                  <XCircle className="h-3 w-3 text-muted-foreground/30 shrink-0" />
                )}
                <span className={key.set ? "" : "text-muted-foreground/50"}>
                  {key.name}
                  {(key as any).custom && key.set && (
                    <span className="text-amber-400 ml-0.5">⚡</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer stats */}
      <div className="flex gap-4 mt-2 pt-2 border-t">
        <div>
          <p className="text-2xl font-bold">{status.session_count}</p>
          <p className="text-xs text-muted-foreground">会话</p>
        </div>
        <div>
          <p className="text-2xl font-bold">{status.message_count}</p>
          <p className="text-xs text-muted-foreground">消息</p>
        </div>
        <div>
          <p className="text-2xl font-bold">{status.skill_count}</p>
          <p className="text-xs text-muted-foreground">技能</p>
        </div>
      </div>
    </div>
  )
}
