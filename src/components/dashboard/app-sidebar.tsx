"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard,
  MessageSquare,
  Puzzle,
  BarChart3,
  Clock,
  ChevronLeft,
  LogOut,
  Terminal,
  Users,
  Cpu,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { motion } from "framer-motion"
import { useState } from "react"
import { useAuth } from "@/components/auth-context"

const navItems = [
  { href: "/", label: "总览", icon: LayoutDashboard },
  { href: "/chat", label: "对话", icon: Terminal },
  { href: "/rooms", label: "聊天室", icon: Users },
  { href: "/sessions", label: "会话", icon: MessageSquare },
  { href: "/skills", label: "技能", icon: Puzzle },
  { href: "/models", label: "模型", icon: Cpu },
  { href: "/tokens", label: "用量", icon: BarChart3 },
  { href: "/cron", label: "定时", icon: Clock },
]

export function AppSidebar() {
  const pathname = usePathname()
  const { logout } = useAuth()
  const [collapsed, setCollapsed] = useState(false)

  return (
    <motion.aside
      animate={{ width: collapsed ? 64 : 240 }}
      transition={{ type: "spring", stiffness: 300, damping: 25 }}
      className={cn(
        "h-screen sticky top-0 flex flex-col border-r bg-sidebar",
        collapsed ? "items-center" : "px-3"
      )}
    >
      {/* Logo */}
      <div className={cn("flex items-center h-14", collapsed ? "justify-center" : "px-2")}>
        {!collapsed && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-2"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary">
              <span className="text-xs font-bold text-primary-foreground">H</span>
            </div>
            <span className="font-semibold text-sm">Hermes</span>
          </motion.div>
        )}
      </div>

      <Separator />

      {/* Nav */}
      <nav className="flex-1 py-4 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href))
          return (
            <Link key={item.href} href={item.href}>
              <Button
                variant={isActive ? "secondary" : "ghost"}
                size="sm"
                className={cn(
                  "w-full justify-start gap-2",
                  collapsed && "justify-center px-0"
                )}
                title={collapsed ? item.label : undefined}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </Button>
            </Link>
          )
        })}
      </nav>

      {/* Collapse toggle */}
      <div className={cn("pb-4 space-y-2", collapsed ? "flex flex-col items-center" : "px-2")}>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCollapsed(!collapsed)}
          className="h-8 w-8"
        >
          <motion.div
            animate={{ rotate: collapsed ? 180 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <ChevronLeft className="h-4 w-4" />
          </motion.div>
        </Button>

        {!collapsed && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 text-muted-foreground hover:text-destructive"
            onClick={logout}
          >
            <LogOut className="h-4 w-4" />
            退出登录
          </Button>
        )}
      </div>
    </motion.aside>
  )
}
