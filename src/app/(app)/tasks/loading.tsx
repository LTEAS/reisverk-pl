export default function TasksLoading() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 animate-pulse">
      <div className="flex items-center justify-between">
        <div>
          <div className="h-7 w-32 bg-stone-800 rounded-lg" />
          <div className="h-4 w-20 bg-stone-800/50 rounded mt-2" />
        </div>
        <div className="flex gap-2">
          <div className="h-9 w-28 bg-stone-800 rounded-lg" />
          <div className="h-9 w-28 bg-stone-800 rounded-lg" />
        </div>
      </div>
      <div className="flex gap-3">
        <div className="h-9 w-36 bg-stone-800 rounded-lg" />
        <div className="h-9 w-36 bg-stone-800 rounded-lg" />
        <div className="h-9 w-36 bg-stone-800 rounded-lg" />
      </div>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-xl bg-[#1a1918] border border-[#2a2827] h-40" />
      ))}
    </div>
  )
}
