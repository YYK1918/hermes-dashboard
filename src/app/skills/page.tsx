"use client"

import { useQuery } from "@tanstack/react-query"
import { api } from "@/components/lib/api"
import { Badge } from "@/components/ui/badge"
import { motion } from "framer-motion"
import { Puzzle } from "lucide-react"

const categoryColors: Record<string, string> = {
  "autonomous-ai-agents": "bg-blue-500/10 text-blue-500 border-blue-500/20",
  creative: "bg-pink-500/10 text-pink-500 border-pink-500/20",
  devops: "bg-orange-500/10 text-orange-500 border-orange-500/20",
  github: "bg-slate-500/10 text-slate-500 border-slate-500/20",
  mlops: "bg-green-500/10 text-green-500 border-green-500/20",
  research: "bg-purple-500/10 text-purple-500 border-purple-500/20",
  "web-development": "bg-cyan-500/10 text-cyan-500 border-cyan-500/20",
  "software-development": "bg-indigo-500/10 text-indigo-500 border-indigo-500/20",
  media: "bg-rose-500/10 text-rose-500 border-rose-500/20",
  productivity: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  social: "bg-sky-500/10 text-sky-500 border-sky-500/20",
  email: "bg-teal-500/10 text-teal-500 border-teal-500/20",
}

export default function SkillsPage() {
  const { data: skills, isLoading } = useQuery({
    queryKey: ["skills"],
    queryFn: api.skills,
  })

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div>
        <h1 className="text-2xl font-bold tracking-tight">技能</h1>
        <p className="text-sm text-muted-foreground mt-1">
          已安装 {skills?.length || 0} 个技能
        </p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="h-24 rounded-xl border bg-card animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {skills?.map((s, i) => (
            <motion.div
              key={s.name}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.02 }}
              whileHover={{ scale: 1.02, y: -2 }}
              className="rounded-xl border bg-card p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 shrink-0">
                  <Puzzle className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{s.name}</p>
                  <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                    {s.description || "暂无描述"}
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge
                      variant="outline"
                      className={categoryColors[s.category] || "bg-muted text-muted-foreground"}
                    >
                      {s.category}
                    </Badge>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  )
}
