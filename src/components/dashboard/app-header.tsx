"use client"

import { useTheme } from "next-themes"
import { Moon, Sun, RefreshCw, Terminal, ExternalLink, Key, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { motion } from "framer-motion"
import { useQueryClient } from "@tanstack/react-query"
import { useState } from "react"

export function AppHeader() {
  const { theme, setTheme } = useTheme()
  const queryClient = useQueryClient()
  const [refreshing, setRefreshing] = useState(false)
  const [showPwd, setShowPwd] = useState(false)
  const [oldPwd, setOldPwd] = useState("")
  const [newPwd, setNewPwd] = useState("")
  const [pwdError, setPwdError] = useState("")
  const [pwdOk, setPwdOk] = useState(false)

  const handleRefresh = async () => {
    setRefreshing(true)
    await queryClient.invalidateQueries()
    setTimeout(() => setRefreshing(false), 600)
  }

  const handleChangePwd = async () => {
    if (!oldPwd || !newPwd) { setPwdError("请填写旧密码和新密码"); return }
    if (newPwd.length < 6) { setPwdError("新密码至少 6 位"); return }
    setPwdError(""); setPwdOk(false)
    try {
      const token = localStorage.getItem("hermes_dashboard_token")
      const apiBase = typeof window !== "undefined"
        ? (process.env.NEXT_PUBLIC_API_URL || (window.location.port === "3000" ? "http://localhost:8643" : window.location.origin))
        : "http://localhost:8643"
      const resp = await fetch(`${apiBase}/api/auth/change-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ old_password: oldPwd, new_password: newPwd }),
      })
      if (!resp.ok) {
        const err = await resp.json()
        setPwdError(err.detail || "修改失败")
      } else {
        setPwdOk(true)
        setOldPwd(""); setNewPwd("")
        setTimeout(() => { setShowPwd(false); setPwdOk(false) }, 1500)
      }
    } catch {
      setPwdError("网络错误")
    }
  }

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4 md:px-6">
      <div className="flex items-center gap-2">
        <Terminal className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs text-muted-foreground hidden sm:inline">
          Hermes Agent Dashboard v2.1
        </span>
      </div>

      <div className="flex items-center gap-1">
        <Button
          variant="ghost" size="icon" onClick={handleRefresh}
          className="h-8 w-8" title="刷新数据">
          <motion.div
            animate={{ rotate: refreshing ? 360 : 0 }}
            transition={{ duration: 0.6, ease: "easeInOut" }}>
            <RefreshCw className="h-4 w-4" />
          </motion.div>
        </Button>

        <Button
          variant="ghost" size="icon" onClick={() => { setShowPwd(!showPwd); setPwdError(""); setPwdOk(false) }}
          className="h-8 w-8" title="修改密码">
          <Key className="h-4 w-4" />
        </Button>

        <Separator orientation="vertical" className="h-5 mx-1" />

        <Button
          variant="ghost" size="icon" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="h-8 w-8" title="切换主题">
          <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        </Button>

        <a href={`${typeof window !== "undefined" ? (window.location.port === "3000" ? "http://localhost:8643" : window.location.origin) : ""}/docs`}
          target="_blank" rel="noopener noreferrer" className="ml-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" title="API 文档">
            <ExternalLink className="h-3.5 w-3.5" />
          </Button>
        </a>
      </div>

      {/* Password change dialog */}
      {showPwd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setShowPwd(false)}>
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            onClick={e => e.stopPropagation()}
            className="bg-card rounded-xl shadow-2xl border w-full max-w-sm overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="font-semibold text-sm">修改密码</h3>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowPwd(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">旧密码</label>
                <Input type="password" value={oldPwd} onChange={e => setOldPwd(e.target.value)}
                  placeholder="输入当前密码" className="text-sm" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">新密码</label>
                <Input type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)}
                  placeholder="至少 6 位" className="text-sm" />
              </div>
              {pwdError && <p className="text-xs text-destructive">{pwdError}</p>}
              {pwdOk && <p className="text-xs text-green-500">✅ 密码已修改</p>}
              <Button className="w-full" onClick={handleChangePwd}>确认修改</Button>
            </div>
          </motion.div>
        </div>
      )}
    </header>
  )
}
