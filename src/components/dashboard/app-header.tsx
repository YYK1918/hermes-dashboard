"use client"

import { useTheme } from "next-themes"
import { Moon, Sun, RefreshCw, Terminal, ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { motion } from "framer-motion"
import { useQueryClient } from "@tanstack/react-query"
import { useState } from "react"

export function AppHeader() {
  const { theme, setTheme } = useTheme()
  const queryClient = useQueryClient()
  const [refreshing, setRefreshing] = useState(false)

  const handleRefresh = async () => {
    setRefreshing(true)
    await queryClient.invalidateQueries()
    setTimeout(() => setRefreshing(false), 600)
  }

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4 md:px-6">
      <div className="flex items-center gap-2">
        <Terminal className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs text-muted-foreground hidden sm:inline">
          Hermes Agent Dashboard v1.0
        </span>
      </div>

      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={handleRefresh}
          className="h-8 w-8"
          title="刷新数据"
        >
          <motion.div
            animate={{ rotate: refreshing ? 360 : 0 }}
            transition={{ duration: 0.6, ease: "easeInOut" }}
          >
            <RefreshCw className="h-4 w-4" />
          </motion.div>
        </Button>

        <Separator orientation="vertical" className="h-5 mx-1" />

        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="h-8 w-8"
          title="切换主题"
        >
          <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        </Button>

        <a
          href="http://localhost:8643/docs"
          target="_blank"
          rel="noopener noreferrer"
          className="ml-1"
        >
          <Button variant="ghost" size="icon" className="h-8 w-8" title="API 文档">
            <ExternalLink className="h-3.5 w-3.5" />
          </Button>
        </a>
      </div>
    </header>
  )
}
