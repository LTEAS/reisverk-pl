export default function DashboardLoading() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 animate-pulse">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div>
          <div className="h-7 w-64 bg-stone-800 rounded-lg" />
          <div className="h-4 w-40 bg-stone-800/50 rounded mt-2" />
        </div>
        <div className="h-10 w-44 bg-stone-800 rounded-lg" />
      </div>

      {/* Stat cards skeleton */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl bg-[#1a1918] border border-[#2a2827] p-4 h-24"
          />
        ))}
      </div>

      {/* Content skeleton */}
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          <div className="rounded-xl bg-[#1a1918] border border-[#2a2827] h-48" />
          <div className="rounded-xl bg-[#1a1918] border border-[#2a2827] h-40" />
        </div>
        <div className="space-y-6">
          <div className="rounded-xl bg-[#1a1918] border border-[#2a2827] h-48" />
          <div className="rounded-xl bg-[#1a1918] border border-[#2a2827] h-40" />
        </div>
      </div>
    </div>
  )
}
