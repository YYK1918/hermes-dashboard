"use client"

import { useQuery } from "@tanstack/react-query"
import { api } from "@/components/lib/api"
import { BentoGrid, BentoCard } from "@/components/dashboard/bento-grid"
import { StatusCard } from "@/components/dashboard/status-card"
import { SessionsStatCard } from "@/components/dashboard/sessions-stat-card"
import { SkillsStatCard } from "@/components/dashboard/skills-stat-card"
import { TokenChartCard } from "@/components/dashboard/token-chart-card"
import { RecentSessionsTable } from "@/components/dashboard/recent-sessions-table"
import { SkeletonCards } from "@/components/dashboard/skeleton-cards"
import { AlertCircle } from "lucide-react"
import { motion } from "framer-motion"

export default function DashboardPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["overview"],
    queryFn: api.overview,
  })

  if (error) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-muted-foreground"
      >
        <AlertCircle className="h-10 w-10 text-destructive" />
        <p className="text-lg font-medium">无法连接到数据服务器</p>
        <p className="text-sm">请确保 API 服务器在端口 8643 上运行</p>
        <code className="text-xs bg-muted px-3 py-1.5 rounded-md mt-2">
          cd server && python3 api.py
        </code>
      </motion.div>
    )
  }

  if (isLoading || !data) {
    return <SkeletonCards />
  }

  const { status, recent_sessions, tokens } = data

  return (
    <div className="space-y-6">
      {/* Page Title */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <h1 className="text-2xl font-bold tracking-tight">总览</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Hermes Agent 系统状态与实时数据监控
        </p>
      </motion.div>

      {/* Bento Grid */}
      <BentoGrid>
        {/* System Status — Hero Card (2x2) */}
        <BentoCard colSpan="lg:col-span-2" rowSpan="lg:row-span-2">
          <StatusCard status={status} />
        </BentoCard>

        {/* Session Stats (1x1) */}
        <BentoCard>
          <SessionsStatCard
            count={status.session_count}
            messages={status.message_count}
          />
        </BentoCard>

        {/* Skills Stats (1x1) */}
        <BentoCard>
          <SkillsStatCard count={status.skill_count} />
        </BentoCard>

        {/* Token Chart (2x1) */}
        <BentoCard colSpan="lg:col-span-2">
          <TokenChartCard tokens={tokens} />
        </BentoCard>

        {/* Cron Jobs Placeholder */}
        <BentoCard>
          <div className="flex flex-col h-full justify-between">
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">定时任务</h3>
              <p className="text-2xl font-bold mt-1">0</p>
            </div>
            <p className="text-xs text-muted-foreground">暂无活跃定时任务</p>
          </div>
        </BentoCard>
      </BentoGrid>

      {/* Recent Sessions Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        <h2 className="text-lg font-semibold mb-3">最近会话</h2>
        <RecentSessionsTable sessions={recent_sessions} />
      </motion.div>
    </div>
  )
}
