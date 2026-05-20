"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api, CronJob, CronLogEntry } from "@/components/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Separator } from "@/components/ui/separator"
import { motion, AnimatePresence } from "framer-motion"
import {
  Clock,
  Plus,
  Play,
  Pause,
  Trash2,
  FileText,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Terminal,
  RefreshCw,
} from "lucide-react"

export default function CronPage() {
  const queryClient = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [logSheet, setLogSheet] = useState<{ jobId: string; jobName: string } | null>(null)

  // Form state
  const [formSchedule, setFormSchedule] = useState("")
  const [formName, setFormName] = useState("")
  const [formPrompt, setFormPrompt] = useState("")
  const [formError, setFormError] = useState("")
  const [formSubmitting, setFormSubmitting] = useState(false)

  const { data: jobs, isLoading } = useQuery({
    queryKey: ["cron"],
    queryFn: api.cron,
    refetchInterval: 10_000,
  })

  const { data: cronStatus } = useQuery({
    queryKey: ["cron-status"],
    queryFn: api.cronStatus,
  })

  const { data: logData, isLoading: logsLoading } = useQuery({
    queryKey: ["cron-logs", logSheet?.jobId],
    queryFn: () => (logSheet ? api.cronLogs(logSheet.jobId) : null),
    enabled: !!logSheet,
    refetchInterval: 5000,
  })

  const pauseMut = useMutation({ mutationFn: api.pauseCron, onSuccess: () => queryClient.invalidateQueries({ queryKey: ["cron"] }) })
  const resumeMut = useMutation({ mutationFn: api.resumeCron, onSuccess: () => queryClient.invalidateQueries({ queryKey: ["cron"] }) })
  const runMut = useMutation({ mutationFn: api.runCronNow, onSuccess: () => queryClient.invalidateQueries({ queryKey: ["cron"] }) })
  const deleteMut = useMutation({
    mutationFn: api.deleteCron,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["cron"] }),
  })

  const handleCreate = async () => {
    if (!formSchedule.trim()) {
      setFormError("调度表达式不能为空")
      return
    }
    setFormError("")
    setFormSubmitting(true)
    try {
      await api.createCron({
        schedule: formSchedule.trim(),
        name: formName.trim() || undefined,
        prompt: formPrompt.trim() || undefined,
      })
      setCreateOpen(false)
      setFormSchedule("")
      setFormName("")
      setFormPrompt("")
      queryClient.invalidateQueries({ queryKey: ["cron"] })
    } catch (err: any) {
      setFormError(err.message || "创建失败")
    } finally {
      setFormSubmitting(false)
    }
  }

  const getStatusBadge = (status: string) => {
    if (status === "active") return <Badge className="bg-green-500/10 text-green-500 border-green-500/20">运行中</Badge>
    if (status === "paused") return <Badge variant="secondary">已暂停</Badge>
    return <Badge variant="outline">{status}</Badge>
  }

  const getLogLevelBadge = (level: string) => {
    if (level === "ERROR") return <Badge className="bg-red-500/10 text-red-500 border-red-500/20 text-xs">ERROR</Badge>
    if (level === "WARNING") return <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20 text-xs">WARN</Badge>
    return <Badge variant="secondary" className="text-xs">INFO</Badge>
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">定时任务</h1>
          <div className="flex items-center gap-2 mt-1">
            <div className={`flex items-center gap-1.5 text-xs ${cronStatus?.running ? "text-green-500" : "text-muted-foreground"}`}>
              <span className={`relative flex h-2 w-2 ${cronStatus?.running ? "" : "opacity-30"}`}>
                {cronStatus?.running && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />}
                <span className={`relative inline-flex rounded-full h-2 w-2 ${cronStatus?.running ? "bg-green-500" : "bg-muted-foreground"}`} />
              </span>
              调度器 {cronStatus?.running ? "运行中" : "已停止"}
            </div>
          </div>
        </div>

        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              新建任务
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>创建定时任务</DialogTitle>
              <DialogDescription>
                使用 hermes cron create 创建新的定时任务
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  调度表达式 *
                </label>
                <Input
                  placeholder="30m / every 2h / 0 9 * * *"
                  value={formSchedule}
                  onChange={(e) => setFormSchedule(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  支持: 30m, every 2h, every monday 9am, 0 9 * * *
                </p>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  任务名称
                </label>
                <Input
                  placeholder="可选"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  任务描述 / Prompt
                </label>
                <Textarea
                  placeholder="可选的任务提示词"
                  value={formPrompt}
                  onChange={(e) => setFormPrompt(e.target.value)}
                  rows={3}
                />
              </div>

              {formError && (
                <div className="flex items-center gap-2 rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {formError}
                </div>
              )}

              <Button onClick={handleCreate} disabled={formSubmitting} className="w-full">
                {formSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                创建任务
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Jobs table */}
      {isLoading ? (
        <div className="h-64 rounded-xl border bg-card animate-pulse" />
      ) : jobs && jobs.length > 0 ? (
        <div className="rounded-xl border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[200px]">名称</TableHead>
                <TableHead>调度</TableHead>
                <TableHead className="w-[80px]">状态</TableHead>
                <TableHead className="w-[60px] text-right">次数</TableHead>
                <TableHead className="w-[200px] text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.map((job, i) => (
                <motion.tr
                  key={job.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.03 }}
                >
                  <TableCell>
                    <div>
                      <p className="text-sm font-medium">{job.name || job.id}</p>
                      <p className="text-xs text-muted-foreground font-mono">{job.id}</p>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-sm">{job.schedule}</TableCell>
                  <TableCell>{getStatusBadge(job.status)}</TableCell>
                  <TableCell className="text-right tabular-nums text-sm">{job.run_count}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setLogSheet({ jobId: job.id, jobName: job.name || job.id })}
                        title="查看日志"
                      >
                        <FileText className="h-3.5 w-3.5" />
                      </Button>

                      {job.status === "active" ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => pauseMut.mutate(job.id)}
                          title="暂停"
                        >
                          <Pause className="h-3.5 w-3.5" />
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => resumeMut.mutate(job.id)}
                          title="恢复"
                        >
                          <Play className="h-3.5 w-3.5" />
                        </Button>
                      )}

                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => runMut.mutate(job.id)}
                        title="立即执行"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                      </Button>

                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => {
                          if (confirm(`确定删除任务 "${job.name || job.id}"？`)) {
                            deleteMut.mutate(job.id)
                          }
                        }}
                        title="删除"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </motion.tr>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="rounded-xl border bg-card p-12 text-center">
          <Clock className="h-10 w-10 mx-auto text-muted-foreground/30" />
          <p className="mt-3 text-sm text-muted-foreground">暂无定时任务</p>
          <p className="text-xs text-muted-foreground mt-1">点击"新建任务"创建第一个</p>
        </div>
      )}

      {/* Log Sheet */}
      <Sheet open={!!logSheet} onOpenChange={(open) => !open && setLogSheet(null)}>
        <SheetContent side="right" className="w-[500px] sm:max-w-[500px]">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              执行日志
            </SheetTitle>
            <SheetDescription>
              {logSheet?.jobName}
              <span className="ml-2 font-mono text-xs">({logSheet?.jobId})</span>
            </SheetDescription>
          </SheetHeader>

          <Separator className="my-4" />

          <div className="space-y-2">
            {logsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : logData?.logs && logData.logs.length > 0 ? (
              logData.logs.map((entry, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.02 }}
                  className="rounded-lg border bg-card/50 p-3 space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground font-mono">
                      {entry.timestamp || "—"}
                    </span>
                    {getLogLevelBadge(entry.level)}
                  </div>
                  <p className="text-xs text-muted-foreground break-all line-clamp-4">
                    {entry.message}
                  </p>
                </motion.div>
              ))
            ) : (
              <div className="py-12 text-center">
                <Terminal className="h-8 w-8 mx-auto text-muted-foreground/30" />
                <p className="mt-2 text-sm text-muted-foreground">暂无执行日志</p>
                <p className="text-xs text-muted-foreground mt-1">
                  日志来自 ~/.hermes/logs/agent.log
                </p>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </motion.div>
  )
}
