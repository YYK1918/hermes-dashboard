"use client"

import { StatCounter } from "@/components/dashboard/stat-counter"
import { Puzzle } from "lucide-react"

interface SkillsStatCardProps {
  count: number
}

export function SkillsStatCard({ count }: SkillsStatCardProps) {
  return (
    <div className="flex flex-col h-full justify-between">
      <div>
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/10">
            <Puzzle className="h-4 w-4 text-purple-500" />
          </div>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            技能
          </h3>
        </div>
        <StatCounter value={count} className="text-3xl font-bold mt-2 block" />
      </div>
      <p className="text-xs text-muted-foreground">已安装并启用</p>
    </div>
  )
}
