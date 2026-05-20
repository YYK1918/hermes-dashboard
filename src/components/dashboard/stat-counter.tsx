"use client"

import { motion, useSpring, useTransform } from "framer-motion"
import { useEffect } from "react"
import { cn } from "@/lib/utils"

interface StatCounterProps {
  value: number
  className?: string
  prefix?: string
  suffix?: string
  duration?: number
}

export function StatCounter({
  value,
  className,
  prefix = "",
  suffix = "",
  duration = 0.8,
}: StatCounterProps) {
  const spring = useSpring(0, {
    stiffness: 100,
    damping: 20,
    duration: duration * 1000,
  })

  const display = useTransform(spring, (v) => {
    if (value >= 1_000_000) return `${prefix}${(v / 1_000_000).toFixed(1)}M${suffix}`
    if (value >= 1_000) return `${prefix}${(v / 1_000).toFixed(1)}K${suffix}`
    return `${prefix}${Math.floor(v).toLocaleString()}${suffix}`
  })

  useEffect(() => {
    spring.set(value)
  }, [spring, value])

  return (
    <motion.span className={cn("tabular-nums", className)}>
      {display}
    </motion.span>
  )
}
