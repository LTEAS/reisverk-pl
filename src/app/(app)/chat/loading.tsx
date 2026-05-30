export default function ChatLoading() {
  return (
    <div className="h-full flex animate-pulse">
      <div className="w-60 shrink-0 border-r border-[#2a2827] bg-[#1a1918] hidden md:block">
        <div className="p-3 border-b border-[#2a2827]">
          <div className="h-9 bg-stone-800 rounded-lg" />
        </div>
        <div className="p-2 space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-12 bg-stone-800/50 rounded-lg" />
          ))}
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center">
        <div className="w-16 h-16 rounded-2xl bg-stone-800" />
      </div>
    </div>
  )
}
