export default function SettingsLoading() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 animate-pulse max-w-2xl">
      <div>
        <div className="h-7 w-32 bg-stone-800 rounded-lg" />
        <div className="h-4 w-56 bg-stone-800/50 rounded mt-2" />
      </div>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="rounded-xl bg-[#1a1918] border border-[#2a2827] h-36" />
      ))}
    </div>
  )
}
