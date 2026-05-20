"use client"

import { cn } from "@/lib/utils"
import { motion, type Variants } from "framer-motion"
import React from "react"

interface BentoGridProps {
  children: React.ReactNode
  className?: string
}

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.1 },
  },
}

export function BentoGrid({ children, className }: BentoGridProps) {
  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className={cn(
        "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 auto-rows-[160px] gap-4",
        className
      )}
    >
      {children}
    </motion.div>
  )
}

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: [0.25, 0.1, 0.25, 1] },
  },
}

interface BentoCardProps {
  children: React.ReactNode
  className?: string
  colSpan?: string
  rowSpan?: string
  hover?: boolean
}

export function BentoCard({
  children,
  className,
  colSpan = "lg:col-span-1",
  rowSpan = "lg:row-span-1",
  hover = true,
}: BentoCardProps) {
  return (
    <motion.div
      variants={cardVariants}
      whileHover={hover ? { scale: 1.01, y: -2 } : undefined}
      transition={{ type: "spring", stiffness: 400, damping: 20 }}
      className={cn(
        "rounded-xl border bg-card p-5 overflow-hidden relative",
        "hover:shadow-md transition-shadow duration-200",
        colSpan,
        rowSpan,
        className
      )}
    >
      {children}
    </motion.div>
  )
}
