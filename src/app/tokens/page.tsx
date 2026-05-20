"use client"

import { useQuery } from "@tanstack/react-query"
import { api } from "@/components/lib/api"
import { StatCounter } from "@/components/dashboard/stat-counter"
import { motion } from "framer-motion"
import { BarChart3, ArrowDown, ArrowUp, Database } from "lucide-react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts"

const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
]

export default function TokensPage() {
  const { data: tokens, isLoading } = useQuery({
    queryKey: ["tokens"],
    queryFn: api.tokens,
  })

  const fmt = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
    return n.toString()
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div>
        <h1 className="text-2xl font-bold tracking-tight">用量</h1>
        <p className="text-sm text-muted-foreground mt-1">7 天内 Token 消耗统计</p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-32 rounded-xl border bg-card animate-pulse" />
          ))}
        </div>
      ) : tokens ? (
        <>
          {/* Stat Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="rounded-xl border bg-card p-5"
            >
              <div className="flex items-center gap-2 mb-2">
                <Database className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground uppercase tracking-wider">
                  总计
                </span>
              </div>
              <StatCounter
                value={tokens.total}
                className="text-2xl font-bold"
              />
              <p className="text-xs text-muted-foreground mt-1">tokens</p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="rounded-xl border bg-card p-5"
            >
              <div className="flex items-center gap-2 mb-2">
                <ArrowDown className="h-4 w-4 text-blue-500" />
                <span className="text-xs text-muted-foreground uppercase tracking-wider">
                  输入
                </span>
              </div>
              <StatCounter
                value={tokens.input}
                className="text-2xl font-bold"
              />
              <p className="text-xs text-muted-foreground mt-1">tokens</p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="rounded-xl border bg-card p-5"
            >
              <div className="flex items-center gap-2 mb-2">
                <ArrowUp className="h-4 w-4 text-green-500" />
                <span className="text-xs text-muted-foreground uppercase tracking-wider">
                  输出
                </span>
              </div>
              <StatCounter
                value={tokens.output}
                className="text-2xl font-bold"
              />
              <p className="text-xs text-muted-foreground mt-1">tokens</p>
            </motion.div>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* By Model */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="rounded-xl border bg-card p-5"
            >
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
                按模型
              </h3>
              {tokens.by_model.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart
                    data={tokens.by_model.map((m) => ({
                      name: m.model.length > 18 ? m.model.slice(0, 16) + "..." : m.model,
                      tokens: m.tokens,
                    }))}
                    layout="vertical"
                    margin={{ left: -20 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={fmt} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={100} />
                    <Tooltip
                      contentStyle={{
                        background: "var(--card)",
                        border: "1px solid var(--border)",
                        borderRadius: "8px",
                      }}
                      formatter={(v: any) => [(v ?? 0).toLocaleString(), "Tokens"] as [string, string]}
                    />
                    <Bar dataKey="tokens" radius={[0, 4, 4, 0]} barSize={18}>
                      {tokens.by_model.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-12">暂无数据</p>
              )}
            </motion.div>

            {/* By Platform */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35 }}
              className="rounded-xl border bg-card p-5"
            >
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
                按平台
              </h3>
              {tokens.by_platform.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart
                    data={tokens.by_platform}
                    layout="vertical"
                    margin={{ left: -20 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={fmt} />
                    <YAxis type="category" dataKey="platform" tick={{ fontSize: 10 }} width={60} />
                    <Tooltip
                      contentStyle={{
                        background: "var(--card)",
                        border: "1px solid var(--border)",
                        borderRadius: "8px",
                      }}
                      formatter={(v: any) => [(v ?? 0).toLocaleString(), "Tokens"] as [string, string]}
                    />
                    <Bar dataKey="tokens" radius={[0, 4, 4, 0]} barSize={24}>
                      {tokens.by_platform.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[(i + 2) % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-12">暂无数据</p>
              )}
            </motion.div>
          </div>
        </>
      ) : null}
    </motion.div>
  )
}
