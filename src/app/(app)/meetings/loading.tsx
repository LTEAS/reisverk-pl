export default function MeetingsLoading() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 animate-pulse">
      <div className="flex items-center justify-between">
        <div>
          <div className="h-7 w-24 bg-stone-800 rounded-lg" />
          <div className="h-4 w-32 bg-stone-800/50 rounded mt-2" />
        </div>
        <div className="h-9 w-44 bg-stone-800 rounded-lg" />
      </div>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-xl bg-[#1a1918] border border-[#2a2827] h-24" />
      ))}
    </div>
  )
}
