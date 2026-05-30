export default function AdminLoading() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-stone-800" />
        <div>
          <div className="h-7 w-20 bg-stone-800 rounded-lg" />
          <div className="h-4 w-48 bg-stone-800/50 rounded mt-2" />
        </div>
      </div>
      <div className="h-10 w-64 bg-stone-800/50 rounded-lg" />
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl bg-[#1a1918] border border-[#2a2827] h-24"
          />
        ))}
      </div>
      <div className="rounded-xl bg-[#1a1918] border border-[#2a2827] h-40" />
      <div className="rounded-xl bg-[#1a1918] border border-[#2a2827] h-60" />
    </div>
  )
}
