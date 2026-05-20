import { SkeletonCards } from "@/components/dashboard/skeleton-cards"

export default function Loading() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">总览</h1>
        <p className="text-sm text-muted-foreground mt-1">加载中...</p>
      </div>
      <SkeletonCards />
    </div>
  )
}
