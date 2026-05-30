export default function ProjectsLoading() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 animate-pulse">
      <div className="flex items-center justify-between">
        <div>
          <div className="h-7 w-32 bg-stone-800 rounded-lg" />
          <div className="h-4 w-20 bg-stone-800/50 rounded mt-2" />
        </div>
        <div className="h-9 w-32 bg-stone-800 rounded-lg" />
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-xl bg-[#1a1918] border border-[#2a2827] h-40" />
        ))}
      </div>
    </div>
  )
}
