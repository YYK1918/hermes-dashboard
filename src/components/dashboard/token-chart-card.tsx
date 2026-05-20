"use client"

import { TokenUsage } from "@/components/lib/api"
import { StatCounter } from "@/components/dashboard/stat-counter"
import { BarChart3, TrendingUp } from "lucide-react"
import { motion } from "framer-motion"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts"

interface TokenChartCardProps {
  tokens: TokenUsage
}

export function TokenChartCard({ tokens }: TokenChartCardProps) {
  const chartData = (tokens.by_model || [])
    .map((m) => ({
      name: m.model.length > 20 ? m.model.slice(0, 18) + "..." : m.model,
      tokens: m.tokens,
      fullName: m.model,
    }))
    .slice(0, 5)

  // Format large numbers
  const fmt = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
    return n.toString()
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10">
            <BarChart3 className="h-4 w-4 text-amber-500" />
          </div>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Token 用量
          </h3>
        </div>
        <motion.div
          className="flex items-center gap-1 text-xs text-muted-foreground"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          <TrendingUp className="h-3 w-3" />
          7 天内
        </motion.div>
      </div>

      <div className="flex items-baseline gap-2 mt-1">
        <StatCounter
          value={tokens.total}
          className="text-2xl font-bold"
        />
        <span className="text-xs text-muted-foreground">tokens</span>
      </div>

      {/* Chart */}
      {chartData.length > 0 && (
        <div className="flex-1 min-h-0 mt-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" horizontal={false} />
              <XAxis
                type="number"
                tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                tickFormatter={fmt}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                width={110}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
                formatter={(value: any) => [(value ?? 0).toLocaleString(), "Tokens"] as [string, string]}
                labelFormatter={(label: any, payload: any) => {
                  if (payload?.[0]?.payload?.fullName) return payload[0].payload.fullName
                  return label
                }}
              />
              <Bar
                dataKey="tokens"
                fill="var(--primary)"
                radius={[0, 4, 4, 0]}
                barSize={16}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
